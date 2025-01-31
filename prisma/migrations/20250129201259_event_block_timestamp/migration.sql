/*
  Warnings:

  - You are about to alter the column `blockTimestamp` on the `Event` table. The data in that column could be lost. The data in that column will be cast from `DateTime` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "transactionHash" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL DEFAULT '0',
    "ethUsdPrice" INTEGER NOT NULL DEFAULT 0,
    "pspUsdPrice" INTEGER NOT NULL DEFAULT 0,
    "totalPSP" TEXT NOT NULL DEFAULT '0',
    "sePSP1Amount" TEXT NOT NULL DEFAULT '0',
    "sePSP2Amount" TEXT NOT NULL DEFAULT '0',
    "input" TEXT NOT NULL DEFAULT '',
    "decodedFunction" TEXT NOT NULL DEFAULT '',
    "blockNumber" TEXT NOT NULL,
    "blockTimestamp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("blockNumber", "blockTimestamp", "createdAt", "decodedFunction", "ethUsdPrice", "gasPrice", "gasUsed", "input", "pspUsdPrice", "sePSP1Amount", "sePSP2Amount", "totalPSP", "transactionHash", "type", "user") SELECT "blockNumber", "blockTimestamp", "createdAt", "decodedFunction", "ethUsdPrice", "gasPrice", "gasUsed", "input", "pspUsdPrice", "sePSP1Amount", "sePSP2Amount", "totalPSP", "transactionHash", "type", "user" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_transactionHash_key" ON "Event"("transactionHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
