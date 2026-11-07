-- Since when each user's account's view shows (catalog.prisma): from what
-- its sights say for the accounts there are, the time its first course
-- showed from, so none of them runs as a first again. The shared account
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
