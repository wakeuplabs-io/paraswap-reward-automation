import { PrismaClient, Event as ParaSwapEvent } from '@prisma/client';
import { encodeFunctionData, hexToBigInt, numberToHex } from 'viem';

import sePSP1Abi from './abis/sePSP1.json';
import dayjs from 'dayjs';

const ALCHEMY_API_KEY = 'API_KEY';
const ALCHEMY_MAINNET_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key
const SEPSP1_CONTRACT_ADDRESS = '0x716fBC68E0c761684D9280484243FF094CC5FfAB'; // sePSP1 - mainnet https://etherscan.io/address/0x716fBC68E0c761684D9280484243FF094CC5FfAB

async function sendBatchRequests(url: string, batch: any[]): Promise<any[]> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(batch),
  });

  const results = await response.json();
  //check if the response is ok
  const resultWithError = results.find((result) => !!result.error);
  if (resultWithError) {
    throw new Error(resultWithError.error.message);
  }

  return results.map((res) => res.result || null);
}

async function fetchSePSP1Balances(
  events: ParaSwapEvent[]
): Promise<Map<string, bigint>> {
  const batch = events.map((event) => ({
    method: 'eth_call',
    params: [
      {
        to: SEPSP1_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: sePSP1Abi,
          functionName: 'balanceOf',
          args: [event.user],
        }),
      },
      numberToHex(BigInt(event.blockNumber)), // Block tag (can also use a specific block number)
    ],
  }));

  const results = await sendBatchRequests(ALCHEMY_MAINNET_RPC_URL, batch);

  return events.reduce((acc, event, idx) => {
    acc.set(
      event.transactionHash,
      idx < results.length && results[idx] ? hexToBigInt(results[idx]) : 0n
    );
    return acc;
  }, new Map<string, bigint>());
}

const prisma = new PrismaClient();

(async () => {
  const chunkSize = 100;
  let skip = 0;
  let hasMore = true;

  console.log('Start', dayjs().toDate());

  while (hasMore) {
    const events = await prisma.event.findMany({
      skip,
      take: chunkSize,
      orderBy: { blockTimestamp: 'asc' },
    });

    if (events.length === 0) {
      hasMore = false;
      break;
    }

    const sePSP1Balances = await fetchSePSP1Balances(events);

    await prisma.$transaction(
      events.map((event) =>
        prisma.event.update({
          where: { transactionHash: event.transactionHash },
          data: {
            sePSP1AmountEth: (
              sePSP1Balances.get(event.transactionHash) ?? 0n
            ).toString(),
          },
        })
      )
    );

    //wait 1000ms to avoid rate limit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    skip += chunkSize;
    console.log('processed', skip);
  }

  console.log('done', dayjs().toDate());
})();
