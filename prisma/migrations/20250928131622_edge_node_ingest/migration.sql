-- CreateEnum
CREATE TYPE "public"."EdgeStatus" AS ENUM ('online', 'offline');

-- CreateEnum
CREATE TYPE "public"."CommandStatus" AS ENUM ('queued', 'sent', 'acked', 'failed', 'timeout');

-- CreateTable
CREATE TABLE "public"."EdgeNode" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT,
    "secretHash" TEXT,
    "baseUrl" TEXT,
    "status" "public"."EdgeStatus" NOT NULL DEFAULT 'offline',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EdgeCommand" (
    "id" TEXT NOT NULL,
    "edgeId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."CommandStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),

    CONSTRAINT "EdgeCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SensorReading" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "type" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LatestSensor" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "type" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatestSensor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EdgeNode_householdId_key" ON "public"."EdgeNode"("householdId");

-- CreateIndex
CREATE INDEX "EdgeNode_status_lastSeenAt_idx" ON "public"."EdgeNode"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "EdgeCommand_edgeId_status_createdAt_idx" ON "public"."EdgeCommand"("edgeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SensorReading_householdId_deviceKey_ts_idx" ON "public"."SensorReading"("householdId", "deviceKey", "ts");

-- CreateIndex
CREATE INDEX "SensorReading_householdId_ts_idx" ON "public"."SensorReading"("householdId", "ts");

-- CreateIndex
CREATE INDEX "LatestSensor_householdId_updatedAt_idx" ON "public"."LatestSensor"("householdId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LatestSensor_householdId_deviceKey_key" ON "public"."LatestSensor"("householdId", "deviceKey");

-- AddForeignKey
ALTER TABLE "public"."EdgeNode" ADD CONSTRAINT "EdgeNode_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EdgeCommand" ADD CONSTRAINT "EdgeCommand_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "public"."EdgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SensorReading" ADD CONSTRAINT "SensorReading_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LatestSensor" ADD CONSTRAINT "LatestSensor_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
