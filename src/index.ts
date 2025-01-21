import { parseAbi } from 'viem';
import { EventFetcher } from './core/EventFetcher';
import { PrismaClient } from '@prisma/client';
import dayjs from 'dayjs';

const prisma = new PrismaClient();

(async () => {
  //   const rpcUrl = "<YOUR_RPC_URL>"; // Replace with your RPC URL
  const contractAddress = '0x0000000000bbf5c5fd284e657f01bd000933c96d'; // Augustus Delta V2 Mainnet address - https://etherscan.io/address/0x0000000000bbf5c5fd284e657f01bd000933c96d
  const abi =
    'event OrderSettled(address indexed owner, address indexed beneficiary, address srcToken, address destToken, uint256 srcAmount, uint256 destAmount, uint256 returnAmount, uint256 protocolFee, uint256 partnerFee, bytes32 indexed orderHash)';

  const eventName = 'OrderSettled'; // Replace with your event name
  const fromBlock = 21490080n; // Replace with your desired starting block
  const toBlock = 21674808n; // Replace with your desired ending block

  const eventFetcher = new EventFetcher({
    contractAddress,
    abi: parseAbi([abi]),
  });

  //   const events = await eventFetcher.fetchEvents(eventName, fromBlock, toBlock);
  const events = await eventFetcher.fetchLogs(eventName, fromBlock, toBlock);

  console.log(`Fetched ${events.length} events, loading into DB`);

  //insert in db
  const batchSize = 1000;
  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);
    await prisma.event.createMany({
      //TODO: FIX TYPING
      data: batch.map((event) => ({
        owner: event.owner as string,
        beneficiary: event.beneficiary as string,
        srcToken: event.srcToken as string,
        destToken: event.destToken as string,
        srcAmount: event.srcAmount.toString(),
        destAmount: event.destAmount.toString(),
        returnAmount: event.returnAmount.toString(),
        protocolFee: event.protocolFee.toString(),
        partnerFee: event.partnerFee.toString(),
        orderHash: event.orderHash as string,
        blockNumber: event.blockNumber.toString(),
        gasUsed: event.gasUsed.toString(),
        transactionHash: event.transactionHash as string,
        type: 'DELTA',
        name: event.name,
        blockTimestamp: dayjs.unix(event.timeStamp).toDate(),
      })),
    });
  }

  console.log('Done!');
})();
