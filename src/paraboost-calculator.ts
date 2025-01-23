import { PrismaClient, sePSP2Event } from '@prisma/client';
import dayjs from 'dayjs';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import sePSP2Abi from './abis/sePSP2.json';

const TOKEN_DECIMALS = 18;
const TOTAL_EPOCHS = 7;
const EPOCH_DURATION = 28; // Duration of each epoch in days
const CYCLE_END = dayjs(new Date());
const CYCLE_START = CYCLE_END.subtract(TOTAL_EPOCHS * EPOCH_DURATION, 'day');
const MIN_PSP_BALANCE = BigInt(60000 * 10 ** TOKEN_DECIMALS);

const prisma = new PrismaClient();

const client = createPublicClient({
  chain: mainnet,
  transport: http(),
});

type Epoch = {
  number: number;
  from: Date;
  to: Date;
};

type UserEpochData = {
  user: string;
  epoch: Epoch;
  sePSP2Balance: bigint;
  pspBalance: bigint;
  wethBalance: bigint;
  sePSP2EventsId: number[];
};

const getPastEpochs = (): Epoch[] => {
  const epochs = [];

  let currentEpochEnd = CYCLE_END;
  let epochNumber = 1;

  //process backwards
  while (currentEpochEnd.isAfter(CYCLE_START)) {
    const epochStart = currentEpochEnd.subtract(EPOCH_DURATION - 1, 'day');
    epochs.push({
      number: epochNumber,
      from: epochStart.toDate(),
      to: currentEpochEnd.toDate(),
    });
    currentEpochEnd = currentEpochEnd.subtract(EPOCH_DURATION, 'day');
    epochNumber++;
  }

  return epochs;
};

// Request balances from the sePSP2 contract for a given user
async function readUserSePSP2Balance(user: string): Promise<bigint> {
  const result = await client.readContract({
    abi: sePSP2Abi,
    address: '0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485', // sePSP2 - mainnet https://etherscan.io/address/0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485
    functionName: 'balanceOf',
    args: [user],
  });

  return result as bigint;
}

async function getUserSePSP2Events(user: string): Promise<sePSP2Event[]> {
  return prisma.sePSP2Event.findMany({
    where: {
      user,
      blockTimestamp: {
        gte: CYCLE_START.toDate(),
        lte: CYCLE_END.toDate(),
      },
    },
    orderBy: {
      blockTimestamp: 'desc',
    },
  });
}

function calculateBalances(sePSP2Balance: bigint): {
  sePSP2Balance: bigint;
  pspBalance: bigint;
  wethBalance: bigint;
} {
  const convertedSepsp2Balance =
    Number(BigInt(sePSP2Balance)) / 10 ** TOKEN_DECIMALS;
  const pspBalance = BigInt(
    convertedSepsp2Balance * 0.8 * 10 ** TOKEN_DECIMALS
  );
  const wethBalance = BigInt(
    convertedSepsp2Balance * 0.2 * 10 ** TOKEN_DECIMALS
  );

  return { sePSP2Balance, pspBalance, wethBalance };
}

async function saveEpochBalances(epochBalances: Map<number, UserEpochData>) {
  return prisma.userEpochBalance.createMany({
    data: Array.from(epochBalances.values()).map((epochBalance) => ({
      user: epochBalance.user,
      epoch: 0, //TODO complete with proper transanction
      from: epochBalance.epoch.from,
      to: epochBalance.epoch.to,
      sePSP2Balance: epochBalance.sePSP2Balance.toString(),
      pspBalance: epochBalance.pspBalance.toString(),
      wethBalance: epochBalance.wethBalance.toString(),
      eventsIds: epochBalance.sePSP2EventsId.join(','),
    })),
  });
}

function calculateEpochsBalances(
  user: string,
  epochs: Epoch[],
  lastSePSP2Balance: bigint,
  userSePSP2Events: sePSP2Event[]
): Map<number, UserEpochData> {
  //create a map of epoch number to sePSP2 balance
  const userEpochMap = new Map<number, UserEpochData>();

  let currentsePSP2Balance = lastSePSP2Balance;
  let eventIdx = 0;

  //iterate over the epochs, down to the older one
  for (const epoch of epochs) {
    //iterate over the sePSP2 events until the beginning of the epoch
    const epochEntry: UserEpochData = {
      user,
      epoch,
      sePSP2Balance: BigInt(0),
      pspBalance: BigInt(0),
      wethBalance: BigInt(0),
      sePSP2EventsId: [],
    };

    while (
      eventIdx < userSePSP2Events.length &&
      userSePSP2Events[eventIdx].blockTimestamp > epoch.from &&
      userSePSP2Events[eventIdx].blockTimestamp <= epoch.to
    ) {
      if (userSePSP2Events[eventIdx].type === 'TransferIn') {
        // if the event is a transfer, we need to subtract the amount from the current balance
        currentsePSP2Balance -= BigInt(userSePSP2Events[eventIdx].amount);
      } else {
        // if the event is a withdraw or a transfer from the user to another account, we need to add the amount to the current balance
        currentsePSP2Balance += BigInt(userSePSP2Events[eventIdx].amount);
      }
      //save the event id
      epochEntry.sePSP2EventsId.push(userSePSP2Events[eventIdx].id);
      eventIdx++;
    }

    //calculate the balances for the epoch
    const epochBalances = calculateBalances(currentsePSP2Balance);
    epochEntry.sePSP2Balance = epochBalances.sePSP2Balance;
    epochEntry.pspBalance = epochBalances.pspBalance;
    epochEntry.wethBalance = epochBalances.wethBalance;

    //add the epoch to the map
    userEpochMap.set(epoch.number, epochEntry);
  }

  return userEpochMap;
}

async function calculateParaboost(user: string, epochs: Epoch[]) {
  console.log(`Calculating paraboost for user ${user}`);
  //get user's sePSP2 balance
  const userLastSePSP2Balance = await readUserSePSP2Balance(user);
  //get user's seSPS2 events
  const userSePSP2Events = await getUserSePSP2Events(user);
  //calculate user epoch balances
  const userEpochBalances = calculateEpochsBalances(
    user,
    epochs,
    userLastSePSP2Balance,
    userSePSP2Events
  );

  //save epoch balances in DB
  await saveEpochBalances(userEpochBalances);

  console.log(`Finished calculating paraboost for user ${user}`);
}

/**
 * Calculate the ParaBoost rewards for a given date for a given user
 * In order to be more efficient, we will be checking users that interacted with sePSP2 in the last 7 epochs instead of checking all users that made a swap in the platform
 * We will be storing the psp balance for each epoch in a separate table. The balance will be calculated by adding transfer and withdraw events from each epoch
 * Keep in mind that sePSP2 balance is composed of 80% of the psp balance and 20% of the eth balance
 */
(async () => {
  // calculate the epochs for a given date
  console.log('Calculating paraboost for users');
  const epochs = getPastEpochs();

  const users = await prisma.sePSP2Event
    .findMany({
      distinct: ['user'],
      select: {
        user: true,
      },
    })
    .then((users) => users.map((user) => user.user));

  console.log(`Calculating paraboost for ${users.length} users`);

  await Promise.all(users.map((user) => calculateParaboost(user, epochs)));
  console.log('done');
})();
