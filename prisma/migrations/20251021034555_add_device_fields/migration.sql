/*
  Warnings:

  - You are about to drop the column `room` on the `Device` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Device" DROP COLUMN "room",
ADD COLUMN     "deviceClass" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "floorId" TEXT,
ADD COLUMN     "pos" JSONB,
ADD COLUMN     "roomId" TEXT;

-- AlterTable
ALTER TABLE "public"."LatestSensor" ADD COLUMN     "deviceClass" TEXT,
ADD COLUMN     "domain" TEXT;

-- AlterTable
ALTER TABLE "public"."SensorReading" ADD COLUMN     "deviceClass" TEXT,
ADD COLUMN     "domain" TEXT;
