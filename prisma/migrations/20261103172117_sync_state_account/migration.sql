-- rows from before accounts belong to the shared one
ALTER TABLE "SyncState" DROP CONSTRAINT "SyncState_pkey",
ADD COLUMN     "account" TEXT NOT NULL DEFAULT 'shared',
ADD CONSTRAINT "SyncState_pkey" PRIMARY KEY ("portal", "account");

ALTER TABLE "SyncState" ALTER COLUMN "account" DROP DEFAULT;
