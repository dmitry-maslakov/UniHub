/*
  Warnings:

  - You are about to drop the `CourseSource` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "CourseSource" DROP CONSTRAINT "CourseSource_courseId_fkey";

-- DropTable
DROP TABLE "CourseSource";

-- CreateTable
CREATE TABLE "PortalCourse" (
    "id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "meta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "portalCourseId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "portalCourseId" TEXT,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "size" INTEGER,
    "mime" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalCourse_portal_externalId_key" ON "PortalCourse"("portal", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_portal_externalId_key" ON "Item"("portal", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "File_portal_externalId_key" ON "File"("portal", "externalId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
