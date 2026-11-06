-- Catalog's records as versions, seen by accounts through sights (schema
-- catalog.prisma). Each course, post and file becomes a version of itself,
-- under its own id, seen by the shared account, whose view every reader
-- reads: links, events, the search index and the ids clients hold go on as
-- they were. Nothing is dropped but the old columns' keys: they keep what
-- they held, read and written by nothing, until a later migration drops
-- them (CLAUDE.md, Put off).

-- All of it or none: prisma runs a migration's statements one by one, so
-- a failure partway would leave the old columns' keys gone and no
-- triggers, and the migration unable to run again
BEGIN;

-- The old tables, parents first, at once in the strongest mode: the copy
-- below takes every write committed before it, and none comes in between
-- (a weaker lock taken now and raised by the first ALTER would deadlock
-- with an app from before that read a row and goes on to write it). Those
-- writes wait for the commit, and the triggers at the end refuse them.
LOCK TABLE "PortalCourse", "Item", "File" IN ACCESS EXCLUSIVE MODE;

-- CreateTable
CREATE TABLE "CourseVersion" (
    "id" TEXT NOT NULL,
    "portalCourseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "meta" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVersion" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "portalCourseId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "publishedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "portalCourseId" TEXT,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "size" BIGINT,
    "mime" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "contentStale" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSight" (
    "account" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "shownFrom" TIMESTAMP(3) NOT NULL,
    "openFrom" TIMESTAMP(3),
    "hiddenFrom" TIMESTAMP(3),

    CONSTRAINT "CourseSight_pkey" PRIMARY KEY ("account","versionId")
);

-- CreateTable
CREATE TABLE "ItemSight" (
    "account" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "shownFrom" TIMESTAMP(3) NOT NULL,
    "openFrom" TIMESTAMP(3),
    "hiddenFrom" TIMESTAMP(3),

    CONSTRAINT "ItemSight_pkey" PRIMARY KEY ("account","versionId")
);

-- CreateTable
CREATE TABLE "FileSight" (
    "account" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "shownFrom" TIMESTAMP(3) NOT NULL,
    "openFrom" TIMESTAMP(3),
    "hiddenFrom" TIMESTAMP(3),

    CONSTRAINT "FileSight_pkey" PRIMARY KEY ("account","versionId")
);

-- Today's rows, each its own version and the shared account's sight of it:
-- shown and open from when it last changed (the hub kept no earlier time),
-- hidden from when the portal said it's gone. Ids, stamps and content as
-- they were, so the search index's records and fingerprints still match.
INSERT INTO "CourseVersion" ("id", "portalCourseId", "name", "url", "meta", "updatedAt")
SELECT "id", "id", "name", "url", "meta", "updatedAt" FROM "PortalCourse";

INSERT INTO "CourseSight" ("account", "versionId", "open", "shownFrom", "openFrom")
SELECT 'shared', "id", true, "updatedAt", "updatedAt" FROM "PortalCourse";

INSERT INTO "ItemVersion" ("id", "itemId", "portalCourseId", "kind", "title", "url", "publishedAt", "raw", "updatedAt")
SELECT "id", "id", "portalCourseId", "kind", "title", "url", "publishedAt", "raw", "updatedAt" FROM "Item";

INSERT INTO "ItemSight" ("account", "versionId", "open", "shownFrom", "openFrom", "hiddenFrom")
SELECT 'shared', "id", true, s."from", s."from", "removedAt"
FROM "Item", LATERAL (SELECT LEAST("updatedAt", "removedAt") AS "from") s;

INSERT INTO "FileVersion" ("id", "fileId", "portalCourseId", "itemId", "name", "path", "url", "size", "mime", "sourceUpdatedAt", "contentHash", "contentStale", "updatedAt")
SELECT "id", "id", "portalCourseId", "itemId", "name", "path", "url", "size", "mime", "sourceUpdatedAt", "contentHash", "contentStale", "updatedAt" FROM "File";

INSERT INTO "FileSight" ("account", "versionId", "open", "shownFrom", "openFrom", "hiddenFrom")
SELECT 'shared', "id", true, s."from", s."from", "removedAt"
FROM "File", LATERAL (SELECT LEAST("updatedAt", "removedAt") AS "from") s;

-- The old columns' keys go, their values stay; new records leave them null

-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_itemId_fkey";

-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_portalCourseId_fkey";

-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_portalCourseId_fkey";

-- DropIndex
DROP INDEX "File_contentHash_idx";

-- DropIndex
DROP INDEX "File_itemId_idx";

-- DropIndex
DROP INDEX "File_portalCourseId_path_name_idx";

-- DropIndex
DROP INDEX "Item_portalCourseId_publishedAt_idx";

-- AlterTable
ALTER TABLE "File" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "kind" DROP NOT NULL,
ALTER COLUMN "raw" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PortalCourse" ALTER COLUMN "name" DROP NOT NULL,
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "CourseVersion_portalCourseId_idx" ON "CourseVersion"("portalCourseId");

-- CreateIndex
CREATE INDEX "ItemVersion_itemId_idx" ON "ItemVersion"("itemId");

-- CreateIndex: NULLS LAST by hand, as the items listing sorts
CREATE INDEX "ItemVersion_portalCourseId_publishedAt_idx" ON "ItemVersion"("portalCourseId", "publishedAt" DESC NULLS LAST);

-- CreateIndex
CREATE INDEX "FileVersion_fileId_idx" ON "FileVersion"("fileId");

-- CreateIndex
CREATE INDEX "FileVersion_portalCourseId_path_name_idx" ON "FileVersion"("portalCourseId", "path", "name");

-- CreateIndex
CREATE INDEX "FileVersion_itemId_idx" ON "FileVersion"("itemId");

-- CreateIndex
CREATE INDEX "FileVersion_contentHash_idx" ON "FileVersion"("contentHash");

-- CreateIndex
CREATE INDEX "CourseSight_versionId_idx" ON "CourseSight"("versionId");

-- CreateIndex
CREATE INDEX "ItemSight_versionId_idx" ON "ItemSight"("versionId");

-- CreateIndex
CREATE INDEX "FileSight_versionId_idx" ON "FileSight"("versionId");

-- AddForeignKey
ALTER TABLE "CourseVersion" ADD CONSTRAINT "CourseVersion_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVersion" ADD CONSTRAINT "ItemVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVersion" ADD CONSTRAINT "ItemVersion_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_portalCourseId_fkey" FOREIGN KEY ("portalCourseId") REFERENCES "PortalCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSight" ADD CONSTRAINT "CourseSight_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CourseVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemSight" ADD CONSTRAINT "ItemSight_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ItemVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileSight" ADD CONSTRAINT "FileSight_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "FileVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The app from before keeps running while this applies (README, Deploy),
-- and would go on writing records to the old columns, where nothing reads
-- them: what it writes there is refused instead, as a write conflict (its
-- connectors try again later, by then the new app's). Its reads go on.
-- The new app only inserts a record's ids, never its old columns, and
-- never updates one.
CREATE FUNCTION "catalog_in_versions"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'serialization_failure',
    MESSAGE = format('%s: catalog keeps records in versions now, try again', TG_TABLE_NAME);
END $$;

CREATE TRIGGER "PortalCourse_in_versions" BEFORE UPDATE ON "PortalCourse"
  FOR EACH ROW EXECUTE FUNCTION "catalog_in_versions"();
CREATE TRIGGER "PortalCourse_new_in_versions" BEFORE INSERT ON "PortalCourse"
  FOR EACH ROW WHEN (NEW."name" IS NOT NULL) EXECUTE FUNCTION "catalog_in_versions"();
CREATE TRIGGER "Item_in_versions" BEFORE UPDATE ON "Item"
  FOR EACH ROW EXECUTE FUNCTION "catalog_in_versions"();
CREATE TRIGGER "Item_new_in_versions" BEFORE INSERT ON "Item"
  FOR EACH ROW WHEN (NEW."kind" IS NOT NULL) EXECUTE FUNCTION "catalog_in_versions"();
CREATE TRIGGER "File_in_versions" BEFORE UPDATE ON "File"
  FOR EACH ROW EXECUTE FUNCTION "catalog_in_versions"();
CREATE TRIGGER "File_new_in_versions" BEFORE INSERT ON "File"
  FOR EACH ROW WHEN (NEW."name" IS NOT NULL) EXECUTE FUNCTION "catalog_in_versions"();

COMMIT;
