-- CreateTable
CREATE TABLE "UserParaBoost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user" TEXT NOT NULL,
    "paraBoost" REAL NOT NULL,
    "lastCalculated" DATETIME NOT NULL
);
