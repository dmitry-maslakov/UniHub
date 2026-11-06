-- CreateTable
CREATE TABLE "PortalAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "portalUser" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'linked',
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PortalAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalCredential" (
    "accountId" TEXT NOT NULL,
    "sealed" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalCredential_pkey" PRIMARY KEY ("accountId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalAccount_userId_portal_key" ON "PortalAccount"("userId", "portal");

-- AddForeignKey
ALTER TABLE "PortalCredential" ADD CONSTRAINT "PortalCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
