import { PrismaClient, Event } from '@prisma/client';
import dayjs from 'dayjs';
import { Hex, hexToBigInt, decodeFunctionData, hexToNumber, TransactionReceipt } from 'viem';
import augustusAbi from './abis/augustusV6Abi.json';
import deltaAbi from './abis/deltaAbi.json';

type BatchRequest = {
  jsonrpc: string;
  id: number | string;
  method: string;
  params: any[];
};

type Block = {
  number: string;
  timestamp: string;
  transactions: {
    to: string | null; // `to` can be null for contract creation transactions
    from: string;
    gas: string;
    hash: string;
    blockNumber: string;
    input: string;
  }[];
};

const DELTA_METHOD_ID_ARR = ['0xad180c4e', '0x68a89066'];
const AGUSTUS_METHOD_ID_ARR = ['0xe3ead59e', '0xd85ca173', '0x1a01c532', '0xe37ed256', '0xe8bb3b6c', '0x876a02f6', '0x7f457675', '0xd6ed22e6', '0xa76f4eb6', '0x5e94e28d', '0xda35bb0d'];

const AUGUSTUS_CONTRACT_ADDRESS = '0x6a000f20005980200259b80c5102003040001068'; // Augustus v6.2 Mainnet address
const DELTA_CONTRACT_ADDRESS = '0x0000000000bbf5c5fd284e657f01bd000933c96d'; // Augustus Delta V2 Mainnet address
const FINAL_BLOCK = 21661976;
const INITIAL_BLOCK = 21461472;
const CHUNK_SIZE = 20;
const BATCH_SIZE = 20;
const ALCHEMY_API_KEY = 'API_KEY';
const ALCHEMY_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key

const prismaClient = new PrismaClient();

import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
 
const publicClient = createPublicClient({ 
  chain: mainnet,
  transport: http(ALCHEMY_RPC_URL)
})

export async function getGasRefundTransactions() {
  const receipts: { receipt: TransactionReceipt, blockNumber: BigInt, blockTimestamp: BigInt }[] = [] 

  for (let processingBlockNumber = INITIAL_BLOCK; processingBlockNumber <= FINAL_BLOCK; processingBlockNumber += 1) {
    console.log(`Processing block ${processingBlockNumber}...`);

    const block = await publicClient.getBlock({ blockNumber: BigInt(processingBlockNumber) });

    for (let index = 0; index < block.transactions.length; index++) {
      console.log(`Processing transaction ${index}/${block.transactions.length}...`);

      const txHash = block.transactions[index];
      
      const transaction = await publicClient.getTransaction({ hash: txHash });
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      
      if (![AUGUSTUS_CONTRACT_ADDRESS, DELTA_CONTRACT_ADDRESS].includes(receipt.to ?? "0x")) {
        continue
      }

      if (receipt.status !== "success") {
        continue
      }

      if (!DELTA_METHOD_ID_ARR.includes(transaction.input.slice(0, 10)) && !AGUSTUS_METHOD_ID_ARR.includes(transaction.input.slice(0, 10))) { 
        continue;
      }

      receipts.push({receipt, blockNumber: block.number, blockTimestamp: block.timestamp});
    }
  }

  return receipts;
}


// Function to send a batch request to Alchemy
async function sendBatchRequests(batch: BatchRequest[]): Promise<Block[]> {
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
}

async function getReceipts(txs: any[]): Promise<Map<string, any>> {
  const batch = txs.map((tx) => ({
    jsonrpc: '2.0',
    id: tx.hash,
    method: 'eth_getTransactionReceipt',
    params: [tx.hash],
  }));

  try {
    const response = await fetch(ALCHEMY_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(batch),
    });

    return response
      .json()
      .then((response) =>
        (response as Array<any>).reduce(
          (acc, { result }) => acc.set(result.transactionHash, result),
          new Map<string, any>()
        )
      );
  } catch (error) {
    console.log(error);
    throw error;
  }
}

// Function to decode transaction input data
function decodeTransactionInput({
  to,
  input,
  hash,
}: {
  to: string;
  input: string;
  hash: string;
}): string {
  try {
    const abi =
      to.toLowerCase() === AUGUSTUS_CONTRACT_ADDRESS.toLowerCase()
        ? augustusAbi
        : deltaAbi;

    const { functionName } = decodeFunctionData({
      abi,
      data: input as Hex,
    });

    return functionName;
  } catch (error) {
    console.error('Failed to decode input data from transaction', hash);
    return '';
  }
}

async function performBatchRequest(
  batchBlockNumbers: number[]
): Promise<Event[]> {
  const batch = batchBlockNumbers.map((blockNumber) => ({
    jsonrpc: '2.0',
    id: blockNumber,
    method: 'eth_getBlockByNumber',
    params: [`0x${blockNumber.toString(16)}`, true], // true to include full transaction objects
  }));

  try {
    const blocks = await sendBatchRequests(batch);

    const txs = blocks
      .filter((block) => block && block.transactions) // Filter out null blocks or missing data
      .flatMap((block) =>
        block.transactions
          .filter(
            (tx) =>
              tx.to &&
              [
                AUGUSTUS_CONTRACT_ADDRESS.toLowerCase(),
                DELTA_CONTRACT_ADDRESS.toLowerCase(),
              ].includes(tx.to.toLowerCase())
          )
          .map((tx) => ({
            ...tx,
            blockTimestamp: block.timestamp,
          }))
      );

    if (txs.length === 0) {
      return [];
    }

    // cooldown 500 ms
    await new Promise((resolve) => setTimeout(resolve, 1000));
    //get the receipt request for each transaction
    const receipts = await getReceipts(txs);

    return txs.map((tx) => {
      const receipt = receipts.get(tx.hash);
      return {
        transactionHash: tx.hash,
        user: tx.from,
        type:
          tx.to!.toLowerCase() === AUGUSTUS_CONTRACT_ADDRESS.toLowerCase()
            ? 'Augustus'
            : 'Delta',
        gasUsed: hexToBigInt(receipt.gasUsed as Hex).toString(), // Use `gas` instead of `gasUsed`
        gasPrice: hexToBigInt(receipt.effectiveGasPrice as Hex).toString(),
        ethUsdPrice: 0,
        pspUsdPrice: 0,
        totalPSP: '0',
        sePSP1Amount: '0',
        sePSP2Amount: '0',
        blockNumber: hexToBigInt(receipt.blockNumber as Hex).toString(),
        input: tx.input,
        decodedFunction: decodeTransactionInput(tx),
        blockTimestamp: hexToNumber(tx.blockTimestamp as Hex),
        createdAt: dayjs().toDate(),
      };
    });
  } catch (error) {
    console.log(
      'Failed batch request:',
      batchBlockNumbers[0],
      batchBlockNumbers[batchBlockNumbers.length - 1]
    );
    console.error('Error:', error);
    return [];
  }
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

  const batchRequests = [];

  console.log('Last block to fetch:', blockNumbers[blockNumbers.length - 1]);

  // Split blockNumbers into batches of BATCH_SIZE
  for (let i = 0; i < blockNumbers.length; i += BATCH_SIZE) {
    const batchBlockNumbers = blockNumbers.slice(i, i + BATCH_SIZE);
    batchRequests.push(
      new Promise<Event[]>(async (resolve, reject) => {
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
  const chunkRanges = Array.from(
    { length: Math.ceil((endBlock - startBlock + 1) / CHUNK_SIZE) },
    (_, i) => [
      startBlock + i * CHUNK_SIZE,
      Math.min(startBlock + (i + 1) * CHUNK_SIZE - 1, endBlock),
    ]
  );

  let totalTransactionsSaved = 0;

  for (const [startBlock, endBlock] of chunkRanges) {
    console.log(`Fetching blocks from ${startBlock} to ${endBlock}...`);
    const blockRangeTransactions = await getTransactionsForBlockRange(
      startBlock,
      endBlock
    );
    totalTransactionsSaved += blockRangeTransactions.length;
  }

  console.log(`Total transactions saved: ${totalTransactionsSaved}`);
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

    if (lastProcessedBlock && lastProcessedBlock >= FINAL_BLOCK) {
      console.log(`Last processed block is ${lastProcessedBlock}, skipping...`);
      return;
    }

    const startBlock = Number(lastProcessedBlock ?? INITIAL_BLOCK);

    console.log(
      `Starting from block ${startBlock} to block ${FINAL_BLOCK} - ${dayjs().toString()}`
    );
    console.log('Total blocks to fetch:', FINAL_BLOCK - startBlock + 1);

    await getContractTransactions(startBlock, FINAL_BLOCK);
    console.log('Saving last block number to DB...');
    await prismaClient.metadata.create({
      data: {
        type: 'lastBlock',
        name: 'EVENTS_LAST_BLOCK',
        value: (FINAL_BLOCK + 1).toString(),
      },
    });
    console.log(`Done - ${dayjs().toString()}`);
  } catch (error) {
    console.error('Error:', error);
  }
})();
