/*
  Warnings:

  - A unique constraint covering the columns `[edgeId]` on the table `EdgeNode` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `edgeId` to the `EdgeNode` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."EdgeNode" ADD COLUMN     "edgeId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EdgeNode_edgeId_key" ON "public"."EdgeNode"("edgeId");
