// Get PSP USD values using a query from Dune Analytics and save them in the database

import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';

/**
 * TODO:
 * - Create an execution from a date range using the api (implement execution waiting)
 * - Save last execution metadata (executionId, fromDate, toDate)
 */

const prisma = new PrismaClient();
const DUNE_API_KEY = 'VncnUwAFlENRKXvzXR4BIjXrV3yoYDdv';
const DUNE_QUERY_ID = '4640892';

(async () => {
  try {
    const response = await fetch(
      `https://api.dune.com/api/v1/query/${DUNE_QUERY_ID}/results?limit=15000`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Dune-API-Key': DUNE_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = await response.json();
    //insert in db
    await prisma.pSPUsdValue.createMany({
      data: data.result.rows.map((row) => ({
        date: dayjs(row.timestamp).toDate(),
        value: row.price,
      })),
    });
  } catch (error) {
    console.error(error);
  }
})();
