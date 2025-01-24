import { PrismaClient, Event } from '@prisma/client';
import dayjs from 'dayjs';
import { Hex, hexToBigInt, hexToString } from 'viem';

type AugustusEvent = Pick<
  Event,
  'user' | 'type' | 'gasUsed' | 'transactionHash' | 'blockNumber'
>;

type BatchRequest = {
  jsonrpc: string;
  id: number | string;
  method: string;
  params: any[];
};

type Block = {
  number: string;
  receipts: {
    to: string;
    from: string;
    gasUsed: string;
    transactionHash: string;
    blockNumber: string;
  }[];
};

const AUGUSTUS_CONTRACT_ADDRESS = '0x6a000f20005980200259b80c5102003040001068'; // Augustus v6.2 Mainnet address - https://etherscan.io/address/0x6a000f20005980200259b80c5102003040001068
const DELTA_CONTRACT_ADDRESS = '0x0000000000bbf5c5fd284e657f01bd000933c96d'; // Augustus Delta V2 Mainnet address - https://etherscan.io/address/0x0000000000bbf5c5fd284e657f01bd000933c96d
const FINAL_BLOCK = 21690635; // Replace with your final block Jan 23-2025 11:59:49 PM
// const INITIAL_BLOCK = 21690635 - 100; // Replace with your final block Jan 23-2025 11:59:49 PM
const INITIAL_BLOCK = 21683472; // Replace with your initial block Jan 23-2025 12:00:00 AM
const CHUNK_SIZE = 1000;
const BATCH_SIZE = 200;
const ALCHEMY_API_KEY = '<API-KEY>';
const ALCHEMY_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key

const prismaClient = new PrismaClient();

// Function to send a batch request to Alchemy
async function sendBatchRequests(batch: BatchRequest[]): Promise<Block[]> {
  try {
    const response = await fetch(ALCHEMY_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(batch),
    });

    const results = await response.json();
    return results.map((res) => res.result || null);
  } catch (error) {
    console.error('Batch request error:', error);
    return [];
  }
}

async function performBatchRequest(
  batchBlockNumbers: number[]
): Promise<AugustusEvent[]> {
  const batch = batchBlockNumbers.map((blockNumber) => ({
    jsonrpc: '2.0',
    id: blockNumber,
    // method: 'eth_getBlockReceipts',
    // params: [`0x${blockNumber.toString(16)}`],
    method: 'alchemy_getTransactionReceipts',
    params: [
      {
        blockNumber: `0x${blockNumber.toString(16)}`,
      },
    ],
  }));

  const blocks = await sendBatchRequests(batch);

  return blocks
    .filter((block) => block && block.receipts) // Filter out null blocks or missing data
    .flatMap((block) => block.receipts) // Flatten all transactions
    .filter(
      (tx) =>
        tx.to &&
        [
          AUGUSTUS_CONTRACT_ADDRESS.toLowerCase(),
          DELTA_CONTRACT_ADDRESS.toLowerCase(),
        ].includes(tx.to.toLowerCase())
    )
    .map((tx) => ({
      user: tx.from,
      type:
        tx.to.toLowerCase() === AUGUSTUS_CONTRACT_ADDRESS.toLowerCase()
          ? 'Augustus'
          : 'Delta',
      gasUsed: hexToBigInt(tx.gasUsed as Hex).toString(),
      transactionHash: tx.transactionHash,
      blockNumber: hexToBigInt(tx.blockNumber as Hex).toString(),
    }));
}

// Function to retrieve transactions for a range of blocks using batch requests
async function getTransactionsForBlockRange(
  startBlock: number,
  endBlock: number
) {
  const blockNumbers = Array.from(
    { length: endBlock - startBlock + 1 },
    (_, i) => startBlock + i
  );

  // let transactions: AugustusTransaction[] = [];
  // let transactions: AugustusEvent[] = [];

  const batchRequests = [];

  // Split blockNumbers into batches of BATCH_SIZE
  for (let i = 0; i < blockNumbers.length; i += BATCH_SIZE) {
    const batchBlockNumbers = blockNumbers.slice(i, i + BATCH_SIZE);
    batchRequests.push(
      new Promise<AugustusEvent[]>(async (resolve, reject) => {
        // console.log(`Fetching ${i}/${blockNumbers.length}`);
        const batchTransactions = await performBatchRequest(batchBlockNumbers);
        resolve(batchTransactions);
      })
    );
  }

  const transactionBatches = await Promise.all(batchRequests);
  const transactions = transactionBatches.flat();

  console.log(
    `Retrieved ${transactions.length} transactions sent to the contract. Saving to DB...`
  );

  await prismaClient.event.createMany({
    data: transactions,
  });

  console.log(`Done saving ${transactions.length} transactions to DB`);

  return transactions;
}

// Main function to iterate through chunks
async function getContractTransactions(startBlock: number, endBlock: number) {
  // let allTransactions: AugustusTransaction[] = [];

  const chunkRanges = Array.from(
    { length: Math.ceil((endBlock - startBlock + 1) / CHUNK_SIZE) },
    (_, i) => [
      startBlock + i * CHUNK_SIZE,
      Math.min(startBlock + (i + 1) * CHUNK_SIZE - 1, endBlock),
    ]
  );

  // console.log(chunkRanges);

  for (const [startBlock, endBlock] of chunkRanges) {
    console.log(`Fetching blocks from ${startBlock} to ${endBlock}...`);
    await getTransactionsForBlockRange(startBlock, endBlock);
  }
}

// Execute the script
(async () => {
  try {
    console.log('Fetching last block number from DB...');
    const lastBlock = await prismaClient.metadata.findFirst({
      where: {
        type: 'lastBlock',
        name: 'EVENTS_LAST_BLOCK',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const lastProcessedBlock = lastBlock?.value && Number(lastBlock?.value);

    //TODO: IMPROVE THIS LOGIC
    if (lastProcessedBlock && lastProcessedBlock >= FINAL_BLOCK) {
      console.log(`Last processed block is ${lastProcessedBlock}, skipping...`);
      return;
    }

    const startBlock = lastProcessedBlock ?? INITIAL_BLOCK;

    console.log(`Starting from block ${startBlock} - ${dayjs().toString()}`);

    await getContractTransactions(Number(startBlock), FINAL_BLOCK);
    console.log('Saving last block number to DB...');
    await prismaClient.metadata.create({
      data: {
        type: 'lastBlock',
        name: 'EVENTS_LAST_BLOCK',
        value: FINAL_BLOCK.toString(),
      },
    });
    console.log(`Done - ${dayjs().toString()}`);
  } catch (error) {
    console.error('Error:', error);
  }
})();
