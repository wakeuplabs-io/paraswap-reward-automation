-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "transactionHash" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "gasUsed" TEXT NOT NULL,
    "gasPrice" TEXT NOT NULL DEFAULT '0',
    "ethUsdPrice" REAL NOT NULL DEFAULT 0,
    "pspUsdPrice" REAL NOT NULL DEFAULT 0,
    "totalPSP" TEXT NOT NULL DEFAULT '0',
    "sePSP1AmountEth" TEXT NOT NULL DEFAULT '0',
    "sePSP1AmountOp" TEXT NOT NULL DEFAULT '0',
    "sePSP2AmountEth" TEXT NOT NULL DEFAULT '0',
    "sePSP2AmountOp" TEXT NOT NULL DEFAULT '0',
    "input" TEXT NOT NULL DEFAULT '',
    "decodedFunction" TEXT NOT NULL DEFAULT '',
    "boost" REAL NOT NULL DEFAULT 0,
    "epochActivelyStaking" INTEGER NOT NULL DEFAULT 0,
    "blockNumber" TEXT NOT NULL,
    "blockTimestamp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("blockNumber", "blockTimestamp", "createdAt", "decodedFunction", "ethUsdPrice", "gasPrice", "gasUsed", "input", "pspUsdPrice", "sePSP1AmountEth", "sePSP1AmountOp", "sePSP2AmountEth", "sePSP2AmountOp", "totalPSP", "transactionHash", "type", "user") SELECT "blockNumber", "blockTimestamp", "createdAt", "decodedFunction", "ethUsdPrice", "gasPrice", "gasUsed", "input", "pspUsdPrice", "sePSP1AmountEth", "sePSP1AmountOp", "sePSP2AmountEth", "sePSP2AmountOp", "totalPSP", "transactionHash", "type", "user" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_transactionHash_key" ON "Event"("transactionHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
