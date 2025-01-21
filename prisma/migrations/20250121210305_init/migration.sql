-- CreateTable
CREATE TABLE "Event" (
    "orderHash" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "beneficiary" TEXT NOT NULL,
    "srcToken" TEXT NOT NULL,
    "destToken" TEXT NOT NULL,
    "srcAmount" TEXT NOT NULL,
    "destAmount" TEXT NOT NULL,
    "returnAmount" TEXT NOT NULL,
    "protocolFee" TEXT NOT NULL,
    "partnerFee" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockTimestamp" DATETIME NOT NULL,
    "gasUsed" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Event_orderHash_key" ON "Event"("orderHash");
