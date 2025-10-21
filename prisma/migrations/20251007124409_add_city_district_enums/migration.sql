-- CreateEnum
CREATE TYPE "public"."City" AS ENUM ('ULAANBAATAR', 'DARKHAN', 'ERDENET', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."District" AS ENUM ('KHAN_UUL', 'BAYANGOL', 'BAYANZURKH', 'SONGINOKHAIRKHAN', 'CHINGELTEI', 'SUKHBAATAR', 'NALAIKH', 'BAGANUUR', 'BAGAKHANGAI', 'NONE');

-- CreateTable
CREATE TABLE "public"."Complex" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" "public"."City" NOT NULL,
    "district" "public"."District" NOT NULL,
    "address" TEXT,
    "centerLat" DOUBLE PRECISION,
    "centerLng" DOUBLE PRECISION,
    "geo" JSONB,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complex_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Block" (
    "id" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floors" INTEGER,
    "entrances" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Entrance" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Unit" (
    "id" TEXT NOT NULL,
    "complexId" TEXT NOT NULL,
    "blockId" TEXT,
    "entranceId" TEXT,
    "number" TEXT NOT NULL,
    "floor" INTEGER,
    "areaSqm" DOUBLE PRECISION,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complex_name_idx" ON "public"."Complex"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_siteId_key" ON "public"."Unit"("siteId");

-- AddForeignKey
ALTER TABLE "public"."Block" ADD CONSTRAINT "Block_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "public"."Complex"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Entrance" ADD CONSTRAINT "Entrance_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "public"."Block"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_complexId_fkey" FOREIGN KEY ("complexId") REFERENCES "public"."Complex"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "public"."Block"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_entranceId_fkey" FOREIGN KEY ("entranceId") REFERENCES "public"."Entrance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "public"."Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
