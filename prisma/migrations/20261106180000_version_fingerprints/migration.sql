-- a hash of each version a user's account saw, so the accounts that see a
-- record alike share one: only added, the shared account's stay null
-- AlterTable
ALTER TABLE "CourseVersion" ADD COLUMN     "fingerprint" TEXT;

-- AlterTable
ALTER TABLE "FileVersion" ADD COLUMN     "fingerprint" TEXT;

-- AlterTable
ALTER TABLE "ItemVersion" ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CourseVersion_portalCourseId_fingerprint_key" ON "CourseVersion"("portalCourseId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_fileId_fingerprint_key" ON "FileVersion"("fileId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ItemVersion_itemId_fingerprint_key" ON "ItemVersion"("itemId", "fingerprint");
