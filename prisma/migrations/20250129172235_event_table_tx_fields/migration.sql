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
    "blockTimestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("blockNumber", "createdAt", "gasUsed", "transactionHash", "type", "user") SELECT "blockNumber", "createdAt", "gasUsed", "transactionHash", "type", "user" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_transactionHash_key" ON "Event"("transactionHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
