-- The site a portal's records and users' accounts come from, for a portal
-- each school runs on a site of its own (schema catalog.prisma and
-- accounts.prisma): '' on every row for now. A record is the portal's by
-- its site and its id from here on. The worker stamps the canvas rows that
-- are there with CANVAS_URL's origin as it starts (README, Canvas).

-- All of it or none, as prisma runs a migration's statements one by one
BEGIN;

-- AlterTable: a default that needs no rewrite of the rows
ALTER TABLE "PortalCourse" ADD COLUMN "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Item" ADD COLUMN "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "File" ADD COLUMN "instance" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PortalAccount" ADD COLUMN "instance" TEXT NOT NULL DEFAULT '';

-- CreateIndex, before the old keys go, so a record is never without one
CREATE UNIQUE INDEX "PortalCourse_portal_instance_externalId_key" ON "PortalCourse"("portal", "instance", "externalId");
CREATE UNIQUE INDEX "Item_portal_instance_externalId_key" ON "Item"("portal", "instance", "externalId");
CREATE UNIQUE INDEX "File_portal_instance_externalId_key" ON "File"("portal", "instance", "externalId");

-- DropIndex
DROP INDEX "PortalCourse_portal_externalId_key";
DROP INDEX "Item_portal_externalId_key";
DROP INDEX "File_portal_externalId_key";

-- The triggers of 20261106120000_catalog_versions refused every update of
-- a record, as the app since only inserts its ids: they refuse an update of
-- any column but its site now, and let the stamping of a record's instance
-- through, the one update this app makes.
DROP TRIGGER "PortalCourse_in_versions" ON "PortalCourse";
CREATE TRIGGER "PortalCourse_in_versions"
  BEFORE UPDATE OF "id", "portal", "externalId", "name", "url", "meta", "updatedAt" ON "PortalCourse"
  FOR EACH ROW EXECUTE FUNCTION "catalog_in_versions"();

DROP TRIGGER "Item_in_versions" ON "Item";
CREATE TRIGGER "Item_in_versions"
  BEFORE UPDATE OF "id", "portal", "externalId", "portalCourseId", "kind", "title", "url", "publishedAt", "raw", "removedAt", "updatedAt" ON "Item"
  FOR EACH ROW EXECUTE FUNCTION "catalog_in_versions"();

DROP TRIGGER "File_in_versions" ON "File";
CREATE TRIGGER "File_in_versions"
  BEFORE UPDATE OF "id", "portal", "externalId", "portalCourseId", "itemId", "name", "path", "url", "size", "mime", "sourceUpdatedAt", "contentHash", "contentStale", "removedAt", "updatedAt" ON "File"
  FOR EACH ROW EXECUTE FUNCTION "catalog_in_versions"();

COMMIT;
