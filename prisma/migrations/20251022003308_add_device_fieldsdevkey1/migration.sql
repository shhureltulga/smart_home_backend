/*
  Warnings:

  - A unique constraint covering the columns `[householdId,deviceKey]` on the table `Device` will be added. If there are existing duplicate values, this will fail.
  - Made the column `deviceKey` on table `Device` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."Device" ALTER COLUMN "deviceKey" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Device_householdId_deviceKey_key" ON "public"."Device"("householdId", "deviceKey");
