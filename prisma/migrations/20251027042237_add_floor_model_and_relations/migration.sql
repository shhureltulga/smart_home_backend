-- AlterTable
ALTER TABLE "public"."Room" ADD COLUMN     "floorId" TEXT;

-- CreateTable
CREATE TABLE "public"."Floor" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "level" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "haFloorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Floor_siteId_idx" ON "public"."Floor"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_siteId_name_key" ON "public"."Floor"("siteId", "name");

-- CreateIndex
CREATE INDEX "Device_floorId_idx" ON "public"."Device"("floorId");

-- CreateIndex
CREATE INDEX "Room_floorId_idx" ON "public"."Room"("floorId");

-- AddForeignKey
ALTER TABLE "public"."Floor" ADD CONSTRAINT "Floor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "public"."Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "public"."Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
