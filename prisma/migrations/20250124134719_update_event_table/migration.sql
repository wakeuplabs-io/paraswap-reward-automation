/*
  Warnings:

  - The primary key for the `Event` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `beneficiary` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `blockTimestamp` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `destAmount` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `destToken` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `orderHash` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `owner` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `partnerFee` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `protocolFee` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `returnAmount` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `srcAmount` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `srcToken` on the `Event` table. All the data in the column will be lost.
  - Added the required column `user` to the `Event` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "type" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "blockNumber" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL PRIMARY KEY,
    "gasUsed" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Event" ("blockNumber", "gasUsed", "transactionHash", "type") SELECT "blockNumber", "gasUsed", "transactionHash", "type" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE UNIQUE INDEX "Event_transactionHash_key" ON "Event"("transactionHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
