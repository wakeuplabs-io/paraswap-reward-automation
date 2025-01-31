import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PublicClient } from 'viem';
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
export async function getBalanceAtBlock(web3Client: PublicClient, abi: any, functionName: string, contractAddress: string, address: string, blockNumber: BigInt, ...args: any[]) {
  return web3Client.readContract({
    address: contractAddress,
    abi,
    functionName,
    args: [address, ...args],
    blockNumber,
  })
}