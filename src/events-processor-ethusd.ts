import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import dayjsPluginUtc from 'dayjs/plugin/utc';

const ALCHEMY_API_KEY = 'API_KEY';
const ALCHEMY_PRICES_API = `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/historical`;

const prisma = new PrismaClient();

dayjs.extend(dayjsPluginUtc);

async function fetchEthPrices(start: number, end: number) {
  let from = dayjs(start * 1000);
  let to = from.add(6, 'day').endOf('day');
  const endDate = dayjs(end * 1000);

  const ethPrices: { date: number; value: number }[] = [];

  while (from.isBefore(endDate)) {
    const response = await fetch(ALCHEMY_PRICES_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        symbol: 'ETH',
        startTime: from.unix(),
        endTime: to.unix(),
        interval: '5m',
      }),
    });

    const results = await response.json();

    ethPrices.push(
      ...results.data.map((result) => ({
        date: dayjs(result.timestamp).unix(),
        value: Number(result.value),
      }))
    );

    from = to.add(1, 'day').startOf('day');
    to = from.add(6, 'day').endOf('day');
  }

  return ethPrices;
}

(async () => {
  const chunkSize = 5000;
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
      break;
    }

    console.log('Fetching ETH Prices');
    const ethPrices = await fetchEthPrices(
      events[0].blockTimestamp,
      events[events.length - 1].blockTimestamp
    );

    console.log('Finished fetching prices');

    const toUpdate = await Promise.all(
      events.map((event) => {
        return new Promise((resolve, reject) => {
          const eventDate = dayjs.utc(event.blockTimestamp * 1000);
          let ethPrice = ethPrices.find(
            (price) => eventDate.unix() <= price.date
          );
          if (!ethPrice) {
            console.log(
              `No ETH price for ${eventDate.unix()}, using last value`
            );
            ethPrice = ethPrices[ethPrices.length - 1];
          }

          resolve({
            transactionHash: event.transactionHash,
            eventDate: event.blockTimestamp,
            ethPrice: ethPrice,
          });
        });
      })
    );

    await prisma.$transaction(
      toUpdate.map((event) =>
        prisma.event.update({
          where: { transactionHash: event.transactionHash },
          data: { ethUsdPrice: event.ethPrice.value },
        })
      )
    );

    skip += chunkSize;
    console.log('processed', skip);
  }

  console.log('done');
})();
