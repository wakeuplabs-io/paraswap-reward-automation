/*
  Warnings:

  - A unique constraint covering the columns `[user]` on the table `UserParaBoost` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "UserParaBoost_user_key" ON "UserParaBoost"("user");
