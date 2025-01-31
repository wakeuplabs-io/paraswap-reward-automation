import { PrismaClient, Event as ParaSwapEvent } from '@prisma/client';
import { encodeFunctionData, hexToBigInt, numberToHex } from 'viem';

import sePSP2Abi from './abis/sePSP2.json';
import dayjs from 'dayjs';

const ALCHEMY_API_KEY = 'API_KEY';
const ALCHEMY_MAINNET_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key
const SEPSP2_CONTRACT_ADDRESS = '0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485'; // sePSP2 - mainnet https://etherscan.io/address/0x593F39A4Ba26A9c8ed2128ac95D109E8e403C485

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

async function fetchSePSP2Balances(
  events: ParaSwapEvent[]
): Promise<Map<string, bigint>> {
  const batch = events.map((event) => ({
    method: 'eth_call',
    params: [
      {
        to: SEPSP2_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: sePSP2Abi,
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

    const sePSP2Balances = await fetchSePSP2Balances(events);

    await prisma.$transaction(
      events.map((event) =>
        prisma.event.update({
          where: { transactionHash: event.transactionHash },
          data: {
            sePSP2AmountEth: (
              sePSP2Balances.get(event.transactionHash) ?? 0n
            ).toString(),
          },
        })
      )
    );

    //wait 1s to avoid rate limit
    await new Promise((resolve) => setTimeout(resolve, 1000));

    skip += chunkSize;
    console.log('processed', skip);
  }

  console.log('done', dayjs().toDate());
})();
