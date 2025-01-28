import { PrismaClient, SePSP2Event } from '@prisma/client';
import { createPublicClient, http } from 'viem';
import { mainnet, optimism } from 'viem/chains';
import sePSP2Abi from './abis/sePSP2.json';

const TOKEN_DECIMALS = 18;
const MIN_PSP_BALANCE = BigInt(60000 * 10 ** TOKEN_DECIMALS);
const ALCHEMY_API_KEY = 'API_KEY';
const ALCHEMY_MAINNET_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key
const ALCHEMY_OP_RPC_URL = `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key

const prisma = new PrismaClient();

// Clients for Mainnet and Optimism
const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(ALCHEMY_MAINNET_RPC_URL),
});

const MAINNET_SEPSP2_ADDRESS = '0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485';
const OP_MAINNET_SEPSP2_ADDRESS = '0x26Ee65874f5DbEfa629EB103E7BbB2DEAF4fB2c8';

const optimismClient = createPublicClient({
  chain: optimism,
  transport: http(ALCHEMY_OP_RPC_URL),
});

type Epoch = {
  number: number;
  from: string;
  to: string;
  fromBlock: number;
  toBlock: number;
};

type UserEpochData = {
  user: string;
  epoch: Epoch;
  sePSP2Balance: bigint;
  pspBalance: bigint;
  wethBalance: bigint;
  sePSP2EventsId: number[];
  chain: 'mainnet' | 'optimism'; // Track the chain for each balance
};

// Define the static epoch array with predefined block ranges for both chains

const MAINNET_EPOCHS: Epoch[] = [
  {
    number: 26,
    from: '2024-12-23T00:00:00.000Z',
    fromBlock: 21461472,
    to: '2025-01-20T00:00:00.000Z',
    toBlock: 21661976,
  },
  {
    number: 25,
    from: '2024-11-24T00:00:00.000Z',
    fromBlock: 21253883,
    to: '2024-12-22T23:59:59.999Z',
    toBlock: 21461471,
  },
  {
    number: 24,
    from: '2024-10-26T00:00:00.000Z',
    fromBlock: 21046080,
    to: '2024-11-23T23:59:59.999Z',
    toBlock: 21253882,
  },
  {
    number: 23,
    from: '2024-09-27T00:00:00.000Z',
    fromBlock: 20838232,
    to: '2024-10-25T23:59:59.999Z',
    toBlock: 21046079,
  },
  {
    number: 22,
    from: '2024-08-29T00:00:00.000Z',
    fromBlock: 20630527,
    to: '2024-09-26T23:59:59.999Z',
    toBlock: 20838231,
  },
  {
    number: 21,
    from: '2024-07-31T00:00:00.000Z',
    fromBlock: 20422809,
    to: '2024-08-28T23:59:59.999Z',
    toBlock: 20630526,
  },
  {
    number: 20,
    from: '2024-07-02T00:00:00.000Z',
    fromBlock: 20215115,
    to: '2024-07-30T23:59:59.999Z',
    toBlock: 20422808,
  },
];

const OP_MAINNET_EPOCHS: Epoch[] = [
  {
    number: 26,
    from: '2024-12-23T00:00:00.000Z',
    fromBlock: 129699789,
    to: '2025-01-20T00:00:00.000Z',
    toBlock: 130866225,
  },
  {
    number: 25,
    from: '2024-11-24T00:00:00.000Z',
    fromBlock: 128403815,
    to: '2024-12-22T23:59:59.999Z',
    toBlock: 129699788,
  },
  {
    number: 24,
    from: '2024-10-26T00:00:00.000Z',
    fromBlock: 127151013,
    to: '2024-11-23T23:59:59.999Z',
    toBlock: 128403814,
  },
  {
    number: 23,
    from: '2024-09-27T00:00:00.000Z',
    fromBlock: 125898227,
    to: '2024-10-25T23:59:59.999Z',
    toBlock: 127151012,
  },
  {
    number: 22,
    from: '2024-08-29T00:00:00.000Z',
    fromBlock: 124645420,
    to: '2024-09-26T23:59:59.999Z',
    toBlock: 125898226,
  },
  {
    number: 21,
    from: '2024-07-31T00:00:00.000Z',
    fromBlock: 123392614,
    to: '2024-08-28T23:59:59.999Z',
    toBlock: 124645419,
  },
  {
    number: 20,
    from: '2024-07-02T00:00:00.000Z',
    fromBlock: 122139841,
    to: '2024-07-30T23:59:59.999Z',
    toBlock: 123392613,
  },
];

// Request balances from the sePSP2 contract for a given user on a specific chain
async function readUserSePSP2Balance(
  user: string,
  chain: 'mainnet' | 'optimism'
): Promise<bigint> {
  const client = chain === 'mainnet' ? mainnetClient : optimismClient;
  const result = await client.readContract({
    abi: sePSP2Abi,
    address:
      chain === 'mainnet' ? MAINNET_SEPSP2_ADDRESS : OP_MAINNET_SEPSP2_ADDRESS,
    functionName: 'balanceOf',
    args: [user],
  });

  return result as bigint;
}

async function getUserSePSP2Events(
  user: string,
  fromBlock: number,
  toBlock: number,
  chain: 'mainnet' | 'optimism'
): Promise<SePSP2Event[]> {
  return prisma.sePSP2Event.findMany({
    where: {
      user,
      blockNumber: {
        gte: fromBlock.toString(),
        lte: toBlock.toString(),
      },
      chain, // Filter events by chain
    },
    orderBy: {
      blockNumber: 'desc',
    },
  });
}

function calculateBalances(sePSP2Balance: bigint): {
  sePSP2Balance: bigint;
  pspBalance: bigint;
  wethBalance: bigint;
} {
  // TODO: CHECK IF RATIO IS CORRECT

  const pspSePSP2Percetange = BigInt(0.8 * 10 ** TOKEN_DECIMALS);
  const wethSePSP2Percentage = BigInt(0.2 * 10 ** TOKEN_DECIMALS);
  const pspSePSP2ConvertionRatio = BigInt(0.11 * 10 ** TOKEN_DECIMALS);

  const pspBalance =
    (sePSP2Balance * pspSePSP2Percetange) / pspSePSP2ConvertionRatio;
  const wethBalance =
    (sePSP2Balance * wethSePSP2Percentage) / BigInt(10 ** TOKEN_DECIMALS);

  return { sePSP2Balance, pspBalance, wethBalance };
}

function calculateEpochsBalances(
  user: string,
  epochs: Epoch[],
  lastSePSP2Balance: bigint,
  userSePSP2Events: SePSP2Event[],
  chain: 'mainnet' | 'optimism'
): Map<number, UserEpochData> {
  const userEpochMap = new Map<number, UserEpochData>();

  //Add first epoch to the map
  const balances = calculateBalances(lastSePSP2Balance);

  userEpochMap.set(epochs[0].number, {
    user,
    epoch: epochs[0],
    sePSP2Balance: balances.sePSP2Balance,
    pspBalance: balances.pspBalance,
    wethBalance: balances.wethBalance,
    sePSP2EventsId: [],
    chain, // Track the chain for this epoch balance
  });

  let currentsePSP2Balance = lastSePSP2Balance;
  let eventIdx = 0;

  // Iterate over the epochs, starting from the most recent
  for (const epoch of epochs.slice(1, epochs.length)) {
    const epochEntry: UserEpochData = {
      user,
      epoch,
      sePSP2Balance: BigInt(0),
      pspBalance: BigInt(0),
      wethBalance: BigInt(0),
      sePSP2EventsId: [],
      chain, // Track the chain for this epoch balance
    };

    // Iterate over the sePSP2 events within the epoch's block range
    while (
      eventIdx < userSePSP2Events.length &&
      BigInt(userSePSP2Events[eventIdx].blockNumber) >= BigInt(epoch.fromBlock)
    ) {
      if (userSePSP2Events[eventIdx].type === 'TransferIn') {
        currentsePSP2Balance -= BigInt(userSePSP2Events[eventIdx].amount);
      } else {
        currentsePSP2Balance += BigInt(userSePSP2Events[eventIdx].amount);
      }
      epochEntry.sePSP2EventsId.push(userSePSP2Events[eventIdx].id);
      eventIdx++;
    }

    const epochBalances = calculateBalances(currentsePSP2Balance);
    epochEntry.sePSP2Balance = epochBalances.sePSP2Balance;
    epochEntry.pspBalance = epochBalances.pspBalance;
    epochEntry.wethBalance = epochBalances.wethBalance;

    userEpochMap.set(epoch.number, epochEntry);
  }

  return userEpochMap;
}

async function saveEpochBalances(epochBalances: Map<number, UserEpochData>) {
  return prisma.userEpochBalance.createMany({
    data: Array.from(epochBalances.values()).map((epochBalance) => ({
      user: epochBalance.user,
      epoch: epochBalance.epoch.number,
      from: epochBalance.epoch.from,
      to: epochBalance.epoch.to,
      fromBlock: epochBalance.epoch.fromBlock.toString(),
      toBlock: epochBalance.epoch.toBlock.toString(),
      sePSP2Balance: epochBalance.sePSP2Balance.toString(),
      pspBalance: epochBalance.pspBalance.toString(),
      wethBalance: epochBalance.wethBalance.toString(),
      eventsIds: epochBalance.sePSP2EventsId.join(','),
      chain: epochBalance.chain, // Store the chain for each balance
    })),
  });
}

function getParaBoost(userEpochBalances: UserEpochData[]): number {
  // Combine balances from both chains for each epoch
  const combinedBalances = new Map<number, UserEpochData>();

  for (const balance of userEpochBalances) {
    const epochNumber = balance.epoch.number;
    if (combinedBalances.has(epochNumber)) {
      // If the epoch already exists, add the balances
      const existingBalance = combinedBalances.get(epochNumber)!;
      existingBalance.sePSP2Balance += balance.sePSP2Balance;
      existingBalance.pspBalance += balance.pspBalance;
      existingBalance.wethBalance += balance.wethBalance;
    } else {
      // If the epoch doesn't exist, add it to the map
      combinedBalances.set(epochNumber, { ...balance });
    }
  }

  // Sort epochs by number (descending)
  const sortedBalances = Array.from(combinedBalances.values()).sort(
    (a, b) => b.epoch.number - a.epoch.number
  );

  let totalEpochWithMinPSPCount = 0;
  for (const balance of sortedBalances) {
    if (balance.pspBalance > MIN_PSP_BALANCE) {
      totalEpochWithMinPSPCount++;
      continue;
    }
    break;
  }

  if (totalEpochWithMinPSPCount === 0) {
    return 0;
  }

  const paraBoostPercentage = (totalEpochWithMinPSPCount + 1) * 10;
  return paraBoostPercentage > 70 ? 0.7 : paraBoostPercentage / 100;
}

async function calculateParaBoost(user: string) {
  console.log(`Calculating paraboost for user ${user}`);

  // Fetch balances and events for both chains
  const [mainnetBalance, optimismBalance] = await Promise.all([
    readUserSePSP2Balance(user, 'mainnet'),
    readUserSePSP2Balance(user, 'optimism'),
  ]);

  const [mainnetEvents, optimismEvents] = await Promise.all([
    getUserSePSP2Events(
      user,
      MAINNET_EPOCHS[MAINNET_EPOCHS.length - 1].fromBlock,
      MAINNET_EPOCHS[0].toBlock,
      'mainnet'
    ),
    getUserSePSP2Events(
      user,
      OP_MAINNET_EPOCHS[OP_MAINNET_EPOCHS.length - 1].fromBlock,
      OP_MAINNET_EPOCHS[0].toBlock,
      'optimism'
    ),
  ]);

  // Calculate epoch balances for both chains
  const mainnetEpochBalances = calculateEpochsBalances(
    user,
    MAINNET_EPOCHS,
    mainnetBalance,
    mainnetEvents,
    'mainnet'
  );

  const optimismEpochBalances = calculateEpochsBalances(
    user,
    OP_MAINNET_EPOCHS,
    optimismBalance,
    optimismEvents,
    'optimism'
  );

  // Combine balances from both chains for ParaBoost calculation
  const allEpochBalances = [
    ...mainnetEpochBalances.values(),
    ...optimismEpochBalances.values(),
  ];
  const paraBoost = getParaBoost(allEpochBalances);

  // Save epoch balances for both chains
  await Promise.all([
    saveEpochBalances(mainnetEpochBalances),
    saveEpochBalances(optimismEpochBalances),
    prisma.userParaBoost.create({
      data: {
        user,
        paraBoost,
        lastCalculated: new Date(),
      },
    }),
  ]);

  console.log(`Finished calculating paraboost for user ${user}`);
}

(async () => {
  console.log('Calculating paraboost for users');

  const users = await prisma.sePSP2Event
    .findMany({
      distinct: ['user'],
      select: {
        user: true,
      },
    })
    .then((users) => users.map((user) => user.user));

  console.log(`Calculating ParaBoost for ${users.length} users`);

  await Promise.all(users.map((user) => calculateParaBoost(user)));

  console.log('done');
})();
