import { PrismaClient } from '@prisma/client';
import { Address, getAddress, createPublicClient, http, PublicClient } from 'viem';
import { mainnet, optimism } from 'viem/chains';
import dayjs from 'dayjs';
import sePSP2 from './abis/sePSP2.json';
import { getBalanceAtBlock, getBlockNumberByTimestamp } from './utils';

const TOKEN_DECIMALS = 18n;
const ALCHEMY_API_KEY = 'API-KEY';
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

const epochToBoostPercentage = {
  1: 0.1,
  2: 0.2,
  3: 0.3,
  4: 0.4,
  5: 0.5,
  6: 0.6,
  7: 0.7,
} as const;

export async function calculateParaBoost(event: any): Promise<number> {
  console.log(`Calculating paraboost for tx ${event.transactionHash} user ${event.user} on ethereum`);

  const user = getAddress(event.user)
  const txBlockTimestamp = new Date(event.blockTimestamp * 1000)

  let boost = 0

  const [firstStakeEvent, lastUserParaBoostData] = await Promise.all([
    getFirstUserStakedEvent(user),
    getLastUserParaBoostData(user)
  ])

  let { lastEpochProcessed, lastCalculated, epochsGeneratingBoost } = lastUserParaBoostData
    // 1. get the swap tx timestamp
    // 2. get the last user epoch processed fron the db
    // 3. compute if the boost is eligible for this tx until this epoch based on:
    //    - search all stake txs during that epoch, validating that
    //      60k PSP are staked in sePSP2 contract at all times.
    //    - Otherwise, the boost not elegible and is reset to 0.
    //    - Save the boost and epoch as the last processed in the db for this user.
    // 4. Continue with the next swap tx

    // we only care about the last 7 epochs for validting the boost
    // these epochs are the ones the user has been staking >= 60k PSP at all times
  
    // user has not staked any PSP yet, boost is not aplicable
    const hasNoStakingEvents = lastEpochProcessed === 0 && !firstStakeEvent

    if (hasNoStakingEvents) {
      console.log(`No staking transactions [${firstStakeEvent}] found for user ${user}, skipping...`)
      // Nothing to do, no staking txs found
    } else {
      // staking events found, process epochs
      if (lastEpochProcessed === 0) {
        console.log(`First time processing epochs for user ${event.user}`)

        if (!firstStakeEvent.blockTimestamp) {
          console.error(`firstStakeEvent.blockTimestamp is null, skipping...`)
          return 0
        }
        // no previous epoch processing for user
        // validate boost eligibility since the first stake tx
        const txTimestamp = dayjs(txBlockTimestamp)
        const firstStakeTxTimestamp = dayjs(firstStakeEvent.blockTimestamp)
        const epochsSinceFirstStake = Math.floor(txTimestamp.diff(firstStakeEvent.blockTimestamp, 'days') / 28)
        const sinceValidationEpoch = epochsSinceFirstStake > 7 ? 7 : epochsSinceFirstStake
        // i.e: staked 8 epochs ago, validate last 7 epochs
        // 8 - 7 = 1, the validation starts from firstStakeTxTimestamp + 1 epoch, so we validate only 7 epochs
        const diffEpoch = epochsSinceFirstStake - sinceValidationEpoch
        const fromEpoch = (diffEpoch > 0 ? diffEpoch : sinceValidationEpoch) * 28

        const startTime = firstStakeTxTimestamp.add(fromEpoch, 'days') // validate last 7 epochs
        const endTime = startTime.add(sinceValidationEpoch * 28, 'days')

        console.log(`startTime: ${startTime} - endTime: ${endTime}`)
        console.log({
          txTimestamp,
          firstStakeEvent,
          firstStakeTxTimestamp,
          epochsSinceFirstStake,
          sinceValidationEpoch,
          validateStarting: fromEpoch,
        })

        // calculate the boost of previous epochs until this swap tx
        const stakeEvents = await getUserStakingEvents(
          user,
          startTime.unix(),
          endTime.unix(),
        );

        console.log(`Staking events found: ${stakeEvents.length}`)
        console.log(`Staking events: ${stakeEvents.length ? JSON.stringify(stakeEvents[0]) : []}`)

        const balanceAtStartEpoch = await getBalanceAtTimestamp(user, startTime.unix())

        if (isElegibleForBoost(stakeEvents, balanceAtStartEpoch)) {
          boost = calculateBoostPercentage(sinceValidationEpoch);
          console.log(`${sinceValidationEpoch} Epochs elegible for ${boost} boost for ${event.user}`)

          epochsGeneratingBoost += 1
        } else {
          // reset boost
          epochsGeneratingBoost = 0
          console.log(`Boost is not elegible for this epoch, ${event.user}`)
        }

        lastEpochProcessed = sinceValidationEpoch + 1;
        lastCalculated = endTime.toDate();
        
        await updateUserLastParaboostData(
          user,
          boost,
          sinceValidationEpoch,
          lastEpochProcessed,
          lastCalculated
        );
      } else {
        console.log(`Processing from last epoch (${lastCalculated}) validated for user ${event.user}`)
        // validate boost eligibility since 1 previous epoch
        const startCurrentEpochTimestamp = dayjs(lastCalculated);
        const endCurrentEpochTimestamp = dayjs(lastCalculated).add(28, 'days');
        // calculate the boost of the current epoch for this swap tx
        const stakeEvents = await getUserStakingEvents(
          user,
          startCurrentEpochTimestamp.unix(),
          endCurrentEpochTimestamp.unix(),
        );

        console.log(`Staking events found: ${stakeEvents.length}`)
        console.log(`Staking events: ${stakeEvents}`)

        console.log(`startTime: ${startCurrentEpochTimestamp.toDate()} - endTime: ${endCurrentEpochTimestamp.toDate()}`)

        const balanceAtStartEpoch = await getBalanceAtTimestamp(user, startCurrentEpochTimestamp.unix())

        if (isElegibleForBoost(stakeEvents, balanceAtStartEpoch)) {
          boost = calculateBoostPercentage(lastEpochProcessed);
          console.log(`Current epoch is elegible for ${boost} boost for ${event.user}`)

          epochsGeneratingBoost += 1
        } else {
          // reset boost
          epochsGeneratingBoost = 0
          console.log(`Boost is not elegible for this epoch, ${event.user}`)
        }

        lastEpochProcessed += 1;
        lastCalculated = endCurrentEpochTimestamp.toDate();

        await updateUserLastParaboostData(
          user,
          boost,
          epochsGeneratingBoost,
          lastEpochProcessed,
          lastCalculated
        );
      }
    }
    console.log(`Finished calculating paraboost for user ${event.user}`);

    return boost
}


async function getFirstUserStakedEvent(user: string) {
  return prisma.SePSP2Event.findFirst({
    where: { user },
    orderBy: { blockTimestamp: 'asc' },
  });
}

async function getLastUserParaBoostData(user: string) {
  const result = await prisma.UserParaBoost.findFirst({
    select: {
      paraBoost: true,
      epochsGeneratingBoost: true,
      lastEpochProcessed: true,
      lastCalculated: true
    },
    where: {
      user,
    },
    orderBy: {
      lastCalculated: 'desc',
    },
  });

  return {
    paraBoost: 0,
    epochsGeneratingBoost: 0,
    lastEpochProcessed: 0,
    lastCalculated: null,
    ...result,
  }
}

async function getUserStakingEvents(user: string, startTime: number, endTime: number) {
  return prisma.SePSP2Event.findMany({
    select: {
      amount: true,
      type: true,
    },
    where: {
      user,
      blockTimestamp: {
        gte: new Date(startTime * 1000),
        lte: new Date(endTime * 1000),
      },
    },
  });
}

async function getBalanceAtTimestamp(user: Address, startTimestamp: number): Promise<bigint> {  
  const [ethBlockNumber, opBlockNumber] = await Promise.all([
    getBlockNumberByTimestamp(mainnetClient as PublicClient, startTimestamp),
    getBlockNumberByTimestamp(optimismClient as PublicClient, startTimestamp)
  ])

  const [sePSP2BalanceOnEth, sePSP2BalanceOnOp] = await Promise.all([
    getBalanceAtBlock(mainnetClient as PublicClient, sePSP2, 'balanceOf', MAINNET_SEPSP2_ADDRESS, user, BigInt(ethBlockNumber)),
    getBalanceAtBlock(optimismClient as PublicClient, sePSP2, 'balanceOf', OP_MAINNET_SEPSP2_ADDRESS, user, BigInt(opBlockNumber))
  ])

  // sum all sePSP2 staked on both chains an use it as the overall staked balance
  return sePSP2BalanceOnEth + sePSP2BalanceOnOp
}

function isElegibleForBoost(stakingEvents: any[], balanceAtStartEpoch: bigint) {
  let totalStaked = balanceAtStartEpoch;
  console.log(`totalStaked for user: ${totalStaked}`);

  const requiredStake = 60000n * 10n ** TOKEN_DECIMALS; // 60k PSP

  for (const { amount, type } of stakingEvents) {
    totalStaked += type === 'Deposit' ? BigInt(amount) : -BigInt(amount);
    if (totalStaked < requiredStake) {
      return false;
    }
  }

  return true
}

function calculateBoostPercentage(epoch: number): number {
  if (epoch > 7) return epochToBoostPercentage[7];
  else return epochToBoostPercentage[epoch as keyof typeof epochToBoostPercentage];
}

async function updateUserLastParaboostData(
  user: string,
  paraBoost: number,
  epochsGeneratingBoost: number,
  lastEpochProcessed: number,
  lastCalculated: Date
) {
  return prisma.UserParaBoost.update({
    where: {
      user,
    },
    data: {
      paraBoost,
      epochsGeneratingBoost,
      lastEpochProcessed,
      lastCalculated,
    },
  });
}
