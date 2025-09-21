/*
  Warnings:

  - A unique constraint covering the columns `[siteId]` on the table `EdgeNode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[siteId,deviceKey]` on the table `LatestSensor` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[siteId,name]` on the table `Room` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `siteId` to the `Device` table without a default value. This is not possible if the table is not empty.
  - Added the required column `siteId` to the `EdgeNode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `siteId` to the `LatestSensor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `siteId` to the `Room` table without a default value. This is not possible if the table is not empty.
  - Added the required column `siteId` to the `SensorReading` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."EdgeNode_householdId_key";

-- DropIndex
DROP INDEX "public"."LatestSensor_householdId_deviceKey_key";

-- DropIndex
DROP INDEX "public"."LatestSensor_householdId_updatedAt_idx";

-- DropIndex
DROP INDEX "public"."Room_householdId_name_key";

-- DropIndex
DROP INDEX "public"."SensorReading_householdId_deviceKey_ts_idx";

-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "siteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."EdgeNode" ADD COLUMN     "siteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."LatestSensor" ADD COLUMN     "edgeId" TEXT,
ADD COLUMN     "siteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "siteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."SensorReading" ADD COLUMN     "edgeId" TEXT,
ADD COLUMN     "siteId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."Site" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_householdId_name_key" ON "public"."Site"("householdId", "name");

-- CreateIndex
CREATE INDEX "Device_siteId_idx" ON "public"."Device"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "EdgeNode_siteId_key" ON "public"."EdgeNode"("siteId");

-- CreateIndex
CREATE INDEX "EdgeNode_householdId_idx" ON "public"."EdgeNode"("householdId");

-- CreateIndex
CREATE INDEX "LatestSensor_siteId_updatedAt_idx" ON "public"."LatestSensor"("siteId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LatestSensor_siteId_deviceKey_key" ON "public"."LatestSensor"("siteId", "deviceKey");

-- CreateIndex
CREATE INDEX "Room_householdId_idx" ON "public"."Room"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_siteId_name_key" ON "public"."Room"("siteId", "name");

-- CreateIndex
CREATE INDEX "SensorReading_siteId_deviceKey_ts_idx" ON "public"."SensorReading"("siteId", "deviceKey", "ts");

-- CreateIndex
CREATE INDEX "SensorReading_householdId_siteId_ts_idx" ON "public"."SensorReading"("householdId", "siteId", "ts");

-- CreateIndex
CREATE INDEX "SensorReading_householdId_edgeId_deviceKey_ts_idx" ON "public"."SensorReading"("householdId", "edgeId", "deviceKey", "ts");

-- AddForeignKey
ALTER TABLE "public"."Site" ADD CONSTRAINT "Site_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EdgeNode" ADD CONSTRAINT "EdgeNode_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensorReading" ADD CONSTRAINT "SensorReading_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensorReading" ADD CONSTRAINT "SensorReading_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "public"."EdgeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LatestSensor" ADD CONSTRAINT "LatestSensor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LatestSensor" ADD CONSTRAINT "LatestSensor_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "public"."EdgeNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
