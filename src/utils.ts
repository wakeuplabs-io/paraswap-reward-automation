import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { Address, PublicClient } from 'viem';
export function getEpochsDates(
  fromDate: Date,
  lastEpoch: number,
  epochLimit: number = 7
) {
  dayjs.extend(utc);
  let startDate = dayjs(fromDate).utc().startOf('day');
  const epochsDates = [];
  let currentEpoch = lastEpoch;
  while (currentEpoch > lastEpoch - epochLimit) {
    epochsDates.push({
      number: currentEpoch,
      to: startDate.toDate(),
      from: startDate.subtract(28, 'day').startOf('day').toDate(),
    });
    startDate = startDate.subtract(29, 'day').endOf('day');
    currentEpoch--;
  }

  return epochsDates;
}
/**
 * Fetches the address balance from token contract at a specific block
 * @returns
 */
export async function getBalanceAtBlock(
  web3Client: PublicClient,
  abi: any,
  functionName: string,
  contractAddress: Address,
  address: string,
  blockNumber: bigint,
  ...args: any[]
): Promise<bigint> {
  const result = await web3Client.readContract({
    address: contractAddress,
    abi,
    functionName,
    args: [address, ...args],
    blockNumber,
  });

  return result as Promise<bigint>;
}

export async function getBlockNumberByTimestamp(
  client: PublicClient,
  timestamp: number,
  highBlock?: number,
  lowBlock?: number
): Promise<number> {
  let high = highBlock ?? 0;
  if (highBlock === 0) {
    let latestBlock = await client.getBlock({ blockTag: 'latest' });
    high = Number(latestBlock.number);
  }

  let low = lowBlock ?? 0;

  while (low <= high) {
    let mid = Math.floor((low + high) / 2);
    let midBlock = await client.getBlock({ blockNumber: BigInt(mid) });

    const blockTimestamp = Number(midBlock.timestamp);

    if (blockTimestamp < timestamp) {
      low = mid + 1;
    } else if (blockTimestamp > timestamp) {
      high = mid - 1;
    } else {
      return Number(midBlock.number);
    }
  }

  return high; // Returns the block number with the closest timestamp before the given timestamp
}
