import { Event, PrismaClient } from '@prisma/client';
import csv from 'csv-parser';
import fs from 'fs';
import { calculateParaBoost } from './paraboost-score';

const AUGUSTUS_CONTRACT_ADDRESS = '0x6a000f20005980200259b80c5102003040001068'; // Augustus v6.2 Mainnet address
const DELTA_CONTRACT_ADDRESS = '0x0000000000bbf5c5fd284e657f01bd000933c96d'; // Augustus Delta V2 Mainnet address
const SEPSP2_PSP_RATIO = 0.1097661868;

async function readParaSwapEvents(filePath: string) {
  return new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('error', (error) => reject(error))
      .on('end', () => resolve(results));
  });
}

const prisma = new PrismaClient();

async function processEvents(events: Event[]) {
  const toUpdate = [];

  for (const event of events) {
    try {
      const ethUsdPrice = BigInt(Math.round(event.ethUsdPrice * 10 ** 10));

      // gasUsedChainCurrency = gasUsed * gasPrice * 10^18 / 10^18
      const gasUsedChainCurrency =
        (BigInt(event.gasUsed) * BigInt(event.gasPrice) * BigInt(10 ** 18)) /
        BigInt(10 ** 18);
      // gasUsedUSD = gasUsedChainCurrency * ethUsdPrice / 10^18
      const gasUsedUSD =
        Number((gasUsedChainCurrency * ethUsdPrice) / BigInt(10 ** 18)) /
        10 ** 10;

      const sePSP1ETH = BigInt(event.sePSP1AmountEth);
      const sePSP1OP = BigInt(event.sePSP1AmountOp);
      const sePSP2PSPETH =
        (BigInt(event.sePSP2AmountEth) * BigInt(0.8 * 10 ** 18)) /
        BigInt(SEPSP2_PSP_RATIO * 10 ** 18);
      const sePSP2PSPOP =
        (BigInt(event.sePSP2AmountOp) * BigInt(0.8 * 10 ** 18)) /
        BigInt(SEPSP2_PSP_RATIO * 10 ** 18);

      const score =
        sePSP1ETH +
        sePSP1OP +
        ((sePSP2PSPETH + sePSP2PSPOP) * BigInt(2.5 * 10 ** 18)) /
          BigInt(10 ** 18);

      const boost = await calculateParaBoost(event);

      toUpdate.push(
        prisma.event.update({
          where: { transactionHash: event.transactionHash },
          data: {
            gasUsedChainCurrency: gasUsedChainCurrency.toString(),
            gasUsedUSD: gasUsedUSD,
            totalPSP: (
              sePSP1ETH +
              sePSP1OP +
              sePSP2PSPETH +
              sePSP2PSPOP
            ).toString(),
            score: score.toString(),
            boost,
          },
        })
      );
    } catch (error) {
      console.log(error);
    }
  }

  await prisma.$transaction(toUpdate);
}

(async () => {
  const results = await readParaSwapEvents('./src/tx_epoch26.csv');
  const augustusEvents = results
    .filter(
      (result) =>
        result.chainId === '1' &&
        (result.contract === DELTA_CONTRACT_ADDRESS ||
          result.contract === AUGUSTUS_CONTRACT_ADDRESS) &&
        result.status === 'validated'
    )
    .map((result) => ({
      hash: result.hash,
      timestamp: Number(result.timestamp.replace(/,/g, '')),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const dbAugustusEvents = await prisma.event.findMany({
    where: {
      transactionHash: {
        in: augustusEvents.map((event) => event.hash),
      },
    },
  });

  console.log('dvd', dbAugustusEvents[0])

  processEvents(dbAugustusEvents);
})();
