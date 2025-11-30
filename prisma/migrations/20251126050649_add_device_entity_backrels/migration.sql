/*
  Warnings:

  - A unique constraint covering the columns `[siteId,deviceKey,entityKey]` on the table `LatestSensor` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `entityKey` to the `LatestSensor` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entityKey` to the `SensorReading` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."LatestSensor_siteId_deviceKey_key";

-- AlterTable
ALTER TABLE "public"."LatestSensor" ADD COLUMN     "entityKey" TEXT NOT NULL,
ADD COLUMN     "stateClass" TEXT,
ADD COLUMN     "unit" TEXT;

-- AlterTable
ALTER TABLE "public"."SensorReading" ADD COLUMN     "entityKey" TEXT NOT NULL,
ADD COLUMN     "rawPayload" JSONB,
ADD COLUMN     "stateClass" TEXT,
ADD COLUMN     "unit" TEXT;

-- CreateTable
CREATE TABLE "public"."DeviceEntity" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceKey" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "deviceClass" TEXT,
    "unit" TEXT,
    "stateClass" TEXT,
    "capabilities" JSONB,
    "haEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeviceEntity_householdId_idx" ON "public"."DeviceEntity"("householdId");

-- CreateIndex
CREATE INDEX "DeviceEntity_siteId_deviceKey_idx" ON "public"."DeviceEntity"("siteId", "deviceKey");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceEntity_siteId_deviceKey_entityKey_key" ON "public"."DeviceEntity"("siteId", "deviceKey", "entityKey");

-- CreateIndex
CREATE UNIQUE INDEX "LatestSensor_siteId_deviceKey_entityKey_key" ON "public"."LatestSensor"("siteId", "deviceKey", "entityKey");

-- CreateIndex
CREATE INDEX "SensorReading_siteId_deviceKey_entityKey_ts_idx" ON "public"."SensorReading"("siteId", "deviceKey", "entityKey", "ts");

-- AddForeignKey
ALTER TABLE "public"."DeviceEntity" ADD CONSTRAINT "DeviceEntity_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceEntity" ADD CONSTRAINT "DeviceEntity_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceEntity" ADD CONSTRAINT "DeviceEntity_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
