-- CreateEnum
CREATE TYPE "public"."DeviceType" AS ENUM ('light', 'thermostat', 'door_lock', 'camera', 'sensor', 'fan', 'tv', 'air_conditioner');

-- CreateEnum
CREATE TYPE "public"."DeviceStatus" AS ENUM ('online', 'offline', 'maintenance');

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."DeviceType" NOT NULL,
    "room" TEXT,
    "status" "public"."DeviceStatus" NOT NULL DEFAULT 'offline',
    "isOn" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB,
    "lastActive" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Room" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceControl" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceControl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_householdId_idx" ON "public"."Device"("householdId");

-- CreateIndex
CREATE INDEX "Device_type_idx" ON "public"."Device"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Room_householdId_name_key" ON "public"."Room"("householdId", "name");

-- CreateIndex
CREATE INDEX "DeviceControl_deviceId_idx" ON "public"."DeviceControl"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceControl_userId_idx" ON "public"."DeviceControl"("userId");

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceControl" ADD CONSTRAINT "DeviceControl_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
