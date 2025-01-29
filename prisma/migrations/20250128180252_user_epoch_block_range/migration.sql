/*
  Warnings:

  - Added the required column `fromBlock` to the `UserEpochBalance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `toBlock` to the `UserEpochBalance` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserEpochBalance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "from" DATETIME NOT NULL,
    "to" DATETIME NOT NULL,
    "fromBlock" TEXT NOT NULL,
    "toBlock" TEXT NOT NULL,
    "sePSP2Balance" TEXT NOT NULL,
    "pspBalance" TEXT NOT NULL,
    "wethBalance" TEXT NOT NULL,
    "eventsIds" TEXT NOT NULL
);
INSERT INTO "new_UserEpochBalance" ("epoch", "eventsIds", "from", "id", "pspBalance", "sePSP2Balance", "to", "user", "wethBalance") SELECT "epoch", "eventsIds", "from", "id", "pspBalance", "sePSP2Balance", "to", "user", "wethBalance" FROM "UserEpochBalance";
DROP TABLE "UserEpochBalance";
ALTER TABLE "new_UserEpochBalance" RENAME TO "UserEpochBalance";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
