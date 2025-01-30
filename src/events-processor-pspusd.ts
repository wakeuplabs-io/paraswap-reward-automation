import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';
import dayjsPluginUtc from 'dayjs/plugin/utc';

const prisma = new PrismaClient();

dayjs.extend(dayjsPluginUtc);

(async () => {
  const chunkSize = 5000;
  let skip = 0;
  let hasMore = true;

  const pspPrices = await prisma.pSPUsdValue
    .findMany({
      orderBy: { date: 'asc' },
    })
    .then((prices) =>
      prices.reduce((acc, price) => {
        const date = dayjs(price.date).unix();
        acc.set(date, { date, value: price.value });
        return acc;
      }, new Map<number, { date: number; value: number }>())
    );

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

    const firstDate = dayjs
      .utc(events[0].blockTimestamp * 1000)
      .startOf('minute');
    const lastDate = dayjs
      .utc(events[events.length - 1].blockTimestamp * 1000)
      .startOf('minute');

    console.log(
      events[0].blockTimestamp,
      firstDate.toDate(),
      firstDate.unix(),
      lastDate.toDate(),
      lastDate.unix(),
      events[events.length - 1].blockTimestamp
    );

    const toUpdate = await Promise.all(
      events.map((event) => {
        return new Promise((resolve, reject) => {
          const eventDate = dayjs
            .utc(event.blockTimestamp * 1000)
            .startOf('minute');

          const eventDateUnix = eventDate.unix();

          let pspValue = pspPrices.get(eventDate.unix());
          if (!pspValue) {
            console.log(
              `No PSP value for ${eventDateUnix} / ${eventDate.toDate()} finding closest value`
            );
            const pspPricesList = Array.from(pspPrices.values());
            pspValue = pspPricesList.find(
              (price) => eventDate.unix() <= price.date
            );
            if (!pspValue) {
              console.log(
                `No PSP value for ${eventDate.toDate()} using last value`
              );
              pspValue = pspPricesList[pspPricesList.length - 1];
            } else {
              console.log(`Using PSP value from date ${pspValue.date}`);
            }
          } else {
            console.log(`PSP value found from date ${eventDate.toDate()}`);
          }

          resolve({
            transactionHash: event.transactionHash,
            eventDate: eventDateUnix,
            pspDate: pspValue?.date,
            pspValue: pspValue?.value,
          });
        });
      })
    );

    await prisma.$transaction(
      toUpdate.map((event) =>
        prisma.event.update({
          where: { transactionHash: event.transactionHash },
          data: { pspUsdPrice: event.pspValue },
        })
      )
    );

    skip += chunkSize;
  }

  console.log('done');
})();
