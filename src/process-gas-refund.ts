import { Event, PrismaClient } from '@prisma/client';
import csv from 'csv-parser';
import fs from 'fs';

const AUGUSTUS_CONTRACT_ADDRESS = '0x6a000f20005980200259b80c5102003040001068'; // Augustus v6.2 Mainnet address
const DELTA_CONTRACT_ADDRESS = '0x0000000000bbf5c5fd284e657f01bd000933c96d'; // Augustus Delta V2 Mainnet address

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

async function processEvents(events: Event[]) {}

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

  processEvents(dbAugustusEvents);
  console.log('asd');
})();
