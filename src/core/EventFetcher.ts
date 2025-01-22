import {
  Abi,
  AbiEvent,
  Address,
  PublicClient,
  createPublicClient,
  hexToBigInt,
  http,
  parseAbiItem,
} from 'viem';
import { mainnet } from 'viem/chains';

type EventFetcherOptions = {
  rpcUrl?: string;
  contractAddress: Address;
  abi: Abi;
};

export class EventFetcher {
  // Create a client
  private contractAddress: Address;
  private client: PublicClient;
  private options: EventFetcherOptions;

  constructor(options: EventFetcherOptions) {
    this.options = options;
    this.contractAddress = options.contractAddress;
    this.client = createPublicClient({
      chain: mainnet,
      transport: options.rpcUrl ? http(options.rpcUrl) : http(),
    });
  }

  async fetchEvents(eventName: string, fromBlock: bigint, toBlock: bigint) {
    const step = 1000n; // Block range per request
    let currentFromBlock = fromBlock;
    let events: any[] = [];

    while (currentFromBlock <= toBlock) {
      const currentToBlock =
        currentFromBlock + step - 1n > toBlock
          ? toBlock
          : currentFromBlock + step - 1n;
      console.log(
        `Fetching events from block ${currentFromBlock} to ${currentToBlock}`
      );

      try {
        const chunkEvents = await this.client.getContractEvents({
          address: this.contractAddress,
          abi: this.options.abi,
          eventName,
          fromBlock: currentFromBlock,
          toBlock: currentToBlock,
        });
        events = events.concat(chunkEvents);
      } catch (error) {
        console.error(
          `Error fetching events between blocks ${currentFromBlock} and ${currentToBlock}:`,
          error
        );
      }

      currentFromBlock += step;
    }

    return events;
  }

  async fetchLogs(eventName: string, fromBlock: bigint, toBlock: bigint) {
    const step = 1000n; // Block range per request
    let currentFromBlock = fromBlock;
    let events: any[] = [];

    const eventAbi = this.options.abi.find(
      (item) => item.type === 'event' && item.name === eventName
    ) as AbiEvent;

    while (currentFromBlock <= toBlock) {
      const currentToBlock =
        currentFromBlock + step - 1n > toBlock
          ? toBlock
          : currentFromBlock + step - 1n;
      console.log(
        `Fetching Logs from block ${currentFromBlock} to ${currentToBlock}`
      );

      try {
        const chunkEvents = await this.client.getLogs({
          address: this.contractAddress,
          event: eventAbi, //parseAbiItem([eventAbi]),
          fromBlock: currentFromBlock,
          toBlock: currentToBlock,
        });

        const newEvents = await Promise.all(
          chunkEvents.map(async (event) => {
            const transactionReceipt = await this.client.getTransactionReceipt({
              hash: event.transactionHash,
            });
            return {
              ...event.args,
              name: event.eventName,
              blockNumber: transactionReceipt.blockNumber,
              transactionHash: event.transactionHash,
              gasUsed: transactionReceipt.gasUsed,
              timeStamp: Number(hexToBigInt((event as any)['blockTimestamp'])),
            };
          })
        );
        events = events.concat(newEvents);
      } catch (error) {
        console.error(
          `Error fetching events between blocks ${currentFromBlock} and ${currentToBlock}:`,
          error
        );
      }

      currentFromBlock += step;
    }

    return events;
  }
}
