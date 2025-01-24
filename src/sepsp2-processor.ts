// Import the necessary modules from viem
import { Prisma, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import {
  Address,
  Chain,
  createPublicClient,
  getAddress,
  hexToBigInt,
  http,
  parseAbiItem,
  PublicClient,
} from 'viem';
import { mainnet, optimism } from 'viem/chains';

type ChainConfig = {
  chain: Chain;
  name: string;
  contractAddress: Address;
};

type SePSP2EventToInsert = Omit<Prisma.sePSP2EventCreateInput, 'chain'>;

function getChainConfig(chain: string): ChainConfig {
  switch (chain) {
    case 'mainnet':
      return {
        chain: mainnet,
        name: 'mainnet',
        contractAddress: '0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485', // sePSP2 - mainnet https://etherscan.io/address/0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485
      };
    case 'optimism':
      return {
        chain: optimism,
        name: 'optimism',
        contractAddress: '0x26Ee65874f5DbEfa629EB103E7BbB2DEAF4fB2c8', // sePSP2 - optimism https://optimistic.etherscan.io/address/0x26Ee65874f5DbEfa629EB103E7BbB2DEAF4fB2c8
      };
    default:
      throw new Error(`Unknown chain: ${chain}`);
  }
}

// const transferEventAbi = parseAbiItem({
//   type: 'event',
//   name: 'Transfer',
//   inputs: [
//     { name: 'from', type: 'address', indexed: true },
//     { name: 'to', type: 'address', indexed: true },
//     { name: 'value', type: 'uint256', indexed: false },
//   ],
// });
// const withdrawEventAbi = parseAbiItem({
//   type: 'event',
//   name: 'Withdraw',
//   inputs: [
//     { name: 'owner', type: 'address', indexed: true },
//     { name: 'amount', type: 'uint256', indexed: false },
//   ],
// });

const prisma = new PrismaClient();

// Function to fetch Transfer events for a specific wallet within a block range
async function fetchTransferEventsInRange(
  walletAddress: Address | Address[],
  fromBlock: bigint,
  toBlock: bigint,
  client: PublicClient,
  contractAddress: Address
): Promise<SePSP2EventToInsert[]> {
  try {
    const abi = parseAbiItem(
      'event Transfer(address indexed from, address indexed to, uint256 value)'
    );

    const [transfersIn, transfersOut] = await Promise.all([
      client
        .getLogs({
          address: contractAddress,
          fromBlock: fromBlock,
          toBlock: toBlock,
          event: abi,
          args: {
            to: walletAddress,
          },
        })
        .then((logs) =>
          logs.map((log) => ({
            type: 'TransferIn',
            user: log.args.to!,
            amount: log.args.value?.toString() ?? '0',
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber.toString(),
            blockTimestamp: dayjs
              .unix(Number(hexToBigInt((log as any)['blockTimestamp'])))
              .toDate(),
          }))
        ),
      client
        .getLogs({
          address: contractAddress,
          fromBlock: fromBlock,
          toBlock: toBlock,
          event: abi,
          args: {
            from: walletAddress,
          },
        })
        .then((logs) =>
          logs.map((log) => ({
            type: 'TransferOut',
            user: log.args.from!,
            amount: log.args.value?.toString() ?? '0',
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber.toString(),
            blockTimestamp: dayjs
              .unix(Number(hexToBigInt((log as any)['blockTimestamp'])))
              .toDate(),
          }))
        ),
    ]);

    return [...transfersIn, ...transfersOut];
  } catch (error) {
    console.error(
      `Error fetching Transfer events from block ${fromBlock} to ${toBlock}:`,
      error
    );
    throw error;
  }
}

// Function to fetch Withdraw events for a specific wallet within a block range
async function fetchWithdrawEventsInRange(
  walletAddress: Address | Address[],
  fromBlock: bigint,
  toBlock: bigint,
  client: PublicClient,
  contractAddress: Address
): Promise<SePSP2EventToInsert[]> {
  try {
    const logs = await client.getLogs({
      address: contractAddress,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
      event: parseAbiItem(
        'event Withdraw(int256 indexed id, address indexed owner, uint256 amount)'
      ),
      args: {
        owner: walletAddress,
      },
    });

    return logs.map((log) => ({
      type: 'Withdraw',
      user: log.args.owner!,
      amount: log.args.amount?.toString() ?? '0',
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber.toString(),
      blockTimestamp: dayjs
        .unix(Number(hexToBigInt((log as any)['blockTimestamp'])))
        .toDate(),
    }));
  } catch (error) {
    console.error(
      `Error fetching Withdraw events from block ${fromBlock} to ${toBlock}:`,
      error
    );
    throw error;
  }
}

// Function to fetch events in chunks of 1000 blocks
async function fetchEvents(
  walletAddress: Address | Address[],
  startBlock: bigint,
  endBlock: bigint,
  client: PublicClient,
  contractAddress: Address,
  cooldown: number
): Promise<SePSP2EventToInsert[]> {
  const chunkSize = 10000n; // 10k blocks per chunk
  let currentBlock = startBlock;
  const transferEvents = [];
  const withdrawEvents = [];

  while (currentBlock <= endBlock) {
    const toBlock =
      currentBlock + chunkSize - 1n > endBlock
        ? endBlock
        : currentBlock + chunkSize - 1n;

    console.log(`Fetching events from block ${currentBlock} to ${toBlock}...`);

    try {
      const transferLogs = await fetchTransferEventsInRange(
        walletAddress,
        currentBlock,
        toBlock,
        client,
        contractAddress
      );
      transferEvents.push(...transferLogs);
    } catch (error) {
      console.error(
        `Error fetching Transfer events for block range ${currentBlock}-${toBlock}:`,
        error
      );
    }

    try {
      const withdrawLogs = await fetchWithdrawEventsInRange(
        walletAddress,
        currentBlock,
        toBlock,
        client,
        contractAddress
      );
      withdrawEvents.push(...withdrawLogs);
    } catch (error) {
      console.error(
        `Error fetching Withdraw events for block range ${currentBlock}-${toBlock}:`,
        error
      );
    }

    currentBlock += chunkSize;

    //wait 1s between chunks
    if (cooldown > 0) {
      console.log(`${cooldown}ms cooldown...`);
      await new Promise((resolve) => setTimeout(resolve, cooldown));
    }
  }

  return [...transferEvents, ...withdrawEvents];
}

async function getUsersWithOrders(): Promise<Address[]> {
  return prisma.event
    .findMany({
      distinct: ['beneficiary'],
      select: {
        beneficiary: true,
      },
    })
    .then((users) => users.map((user) => getAddress(user.beneficiary)));
}

// Example usage
(async () => {
  const args = process.argv.findIndex((arg) => arg === '--chain');
  const chain = args > -1 ? process.argv[args + 1] : 'mainnet';

  console.log(`Processing events for chain: ${chain}`);

  const chainConfig = getChainConfig(chain);

  // Initialize the viem client
  const client = createPublicClient({
    chain: chainConfig.chain,
    transport: http(),
  });

  const startBlock = 20286706n; // 7 epochs before the end block, each epoch is 28 days
  const endBlock = 21683472n; // Replace with the ending block number
  // const startBlock = endBlock - 100000n;

  // retrieve all users that have an order
  console.log('Retrieving users with orders...');
  const users = await getUsersWithOrders();
  console.log('Users with orders:', users.length);
  let totalProcessed = 0;
  let allEvents: SePSP2EventToInsert[] = [];
  const chunkSize = 1000;
  for (let i = 0; i < users.length; i += chunkSize) {
    const chunk = users.slice(i, i + chunkSize);
    console.log('chunk', chunk.length);
    const events = await fetchEvents(
      chunk,
      startBlock,
      endBlock,
      client,
      chainConfig.contractAddress,
      chainConfig.name === 'mainnet' ? 0 : 5000
    );
    totalProcessed += chunk.length;
    allEvents = allEvents.concat(events);
    console.log(`Processed ${totalProcessed}/${users.length} users`);
  }

  console.log('Total events to insert:', allEvents.length);
  await prisma.sePSP2Event.createMany({
    data: allEvents.map((event) => ({
      ...event,
      chain: chainConfig.name,
    })),
  });

  console.log('done');
})();
