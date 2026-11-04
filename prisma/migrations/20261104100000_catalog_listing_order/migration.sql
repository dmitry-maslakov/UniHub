-- the course listings' order, with the portal course first: they replace the
-- portal course indexes, which they cover. NULLS LAST by hand, as the items
-- listing sorts (prisma's schema can't say it)

-- DropIndex
DROP INDEX "Item_portalCourseId_idx";

-- DropIndex
DROP INDEX "File_portalCourseId_idx";

-- CreateIndex
CREATE INDEX "Item_portalCourseId_publishedAt_idx" ON "Item"("portalCourseId", "publishedAt" DESC NULLS LAST);

-- CreateIndex
CREATE INDEX "File_portalCourseId_path_name_idx" ON "File"("portalCourseId", "path", "name");
