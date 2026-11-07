-- Since when each user's account's view shows (catalog.prisma): from what
-- its sights say for the accounts there are, the time its first course
-- showed from, and for the linked ones without a sight (a listing of none
-- shows too) the time of this migration, so none of them runs as a first
-- again. The shared account
-- has none: it shows everything at once.
-- CreateTable
CREATE TABLE "AccountView" (
    "account" TEXT NOT NULL,
    "shownFrom" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountView_pkey" PRIMARY KEY ("account")
);

INSERT INTO "AccountView" ("account", "shownFrom")
SELECT "account", MIN("shownFrom") FROM "CourseSight"
WHERE "account" <> 'shared'
GROUP BY "account";

INSERT INTO "AccountView" ("account", "shownFrom")
SELECT "id", NOW() FROM "PortalAccount" WHERE "status" = 'linked'
ON CONFLICT DO NOTHING;
