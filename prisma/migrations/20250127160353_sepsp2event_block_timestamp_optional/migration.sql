/*
  Warnings:

  - You are about to drop the `sePSP2Event` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "sePSP2Event";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "SePSP2Event" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chain" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "blockTimestamp" DATETIME
);
