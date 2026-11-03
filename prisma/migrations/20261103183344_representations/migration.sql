-- CreateTable
CREATE TABLE "Representation" (
    "hash" TEXT NOT NULL,
    "processor" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Representation_pkey" PRIMARY KEY ("hash","processor","version")
);
