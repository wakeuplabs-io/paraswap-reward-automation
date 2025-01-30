import { PrismaClient } from '@prisma/client';

import sePSP1Abi from './abis/sePSP1.json';
import { encodeFunctionData, hexToBigInt, numberToHex } from 'viem';

const ALCHEMY_API_KEY = 'API_KEY';
const ALCHEMY_MAINNET_RPC_URL = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key
const ALCHEMY_OP_RPC_URL = `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`; // Replace with your Alchemy API key
const SEPSP1_CONTRACT_ADDRESS = '0x716fBC68E0c761684D9280484243FF094CC5FfAB'; // sePSP1 - mainnet https://etherscan.io/address/0x716fBC68E0c761684D9280484243FF094CC5FfAB

async function sendBatchRequests(batch: any[]): Promise<any[]> {
  const response = await fetch(ALCHEMY_MAINNET_RPC_URL, {
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

const prisma = new PrismaClient();

(async () => {
  const chunkSize = 1000;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const events = await prisma.event.findMany({
      skip,
      take: chunkSize,
      orderBy: { blockTimestamp: 'asc' },
    });

    if (events.length === 0) {
      hasMore = false;
      //   break;
    }

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

    const results = await sendBatchRequests(batch);

    const toUpdate = events.map((event, idx) => {
      return {
        transactionHash: event.transactionHash,
        date: event.blockTimestamp,
        user: event.user,
        sePSP1Balance:
          idx < results.length && results[idx] ? hexToBigInt(results[idx]) : 0n,
      };
    });

    await prisma.$transaction(
      toUpdate.map((event) =>
        prisma.event.update({
          where: { transactionHash: event.transactionHash },
          data: { sePSP1AmountEth: event.sePSP1Balance.toString() },
        })
      )
    );

    skip += chunkSize;
    console.log('processed', skip);
  }

  console.log('done');
})();
