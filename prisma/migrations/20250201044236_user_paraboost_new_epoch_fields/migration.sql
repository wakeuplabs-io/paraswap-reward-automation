-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserParaBoost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL,
    "paraBoost" REAL NOT NULL,
    "epochsGeneratingBoost" INTEGER NOT NULL DEFAULT 0,
    "lastEpochProcessed" INTEGER NOT NULL DEFAULT 0,
    "lastCalculated" DATETIME NOT NULL
);
INSERT INTO "new_UserParaBoost" ("id", "lastCalculated", "paraBoost", "user") SELECT "id", "lastCalculated", "paraBoost", "user" FROM "UserParaBoost";
DROP TABLE "UserParaBoost";
ALTER TABLE "new_UserParaBoost" RENAME TO "UserParaBoost";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
