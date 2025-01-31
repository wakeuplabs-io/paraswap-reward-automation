import { OptimismBlock, PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';

const ETHERSCAN_API_KEY = 'API_KEY';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBlockByTimestamp(timestamp: number): Promise<number> {
  const response = await fetch(
    `https://api.etherscan.io/v2/api?chainid=10&module=block&action=getblocknobytime&timestamp=${timestamp}&closest=after&apikey=${ETHERSCAN_API_KEY}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    }
  );

  const result = await response.json();
  //check if the response is ok
  if (result.message !== 'OK') {
    throw new Error(result.message);
  }

  return Number(result.result) ?? 0;
}

const prisma = new PrismaClient();

(async () => {
  const blockTimestampsSet = new Set<number>();

  (
    await prisma.event.findMany({
      distinct: ['blockTimestamp'],
      select: {
        blockTimestamp: true,
      },
      orderBy: {
        blockTimestamp: 'asc',
      },
    })
  ).forEach((event) =>
    // keep timestamps with precision of hour
    blockTimestampsSet.add(
      dayjs(event.blockTimestamp * 1000)
        .startOf('hour')
        .unix()
    )
  );

  const blockTimestamps = Array.from(blockTimestampsSet);
  const opBlocks: Pick<OptimismBlock, 'number' | 'timestamp'>[] = [];
  const chunk = 5;
  let requestCount = 0;

  while (requestCount < blockTimestamps.length) {
    const batch = blockTimestamps.slice(requestCount, requestCount + chunk);
    const results = await Promise.all(
      batch.map((timestamp) => fetchBlockByTimestamp(timestamp))
    );

    opBlocks.push(
      ...results.map((blockNumber, idx) => ({
        number: blockNumber,
        timestamp: batch[idx],
      }))
    );

    await delay(1000);

    requestCount += chunk;
    console.log(`Fetched ${requestCount} / ${blockTimestamps.length}`);
  }

  await prisma.optimismBlock.deleteMany();
  await prisma.optimismBlock.createMany({
    data: opBlocks,
  });

  console.log('done');
})();
