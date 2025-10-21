/*
  Warnings:

  - A unique constraint covering the columns `[name,city,district]` on the table `Complex` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[complexId,number]` on the table `Unit` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Complex_name_city_district_key" ON "public"."Complex"("name", "city", "district");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_complexId_number_key" ON "public"."Unit"("complexId", "number");
