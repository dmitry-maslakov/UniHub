-- Keys made before they expired by default: they get the same 90 days,
-- counted from now
UPDATE "apikey" SET "expiresAt" = now() + interval '90 days' WHERE "expiresAt" IS NULL;
