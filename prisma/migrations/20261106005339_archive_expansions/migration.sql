-- CreateTable
CREATE TABLE "Expansion" (
    "hash" TEXT NOT NULL,
    "expander" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "entries" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expansion_pkey" PRIMARY KEY ("hash","expander","version")
);

-- CreateIndex
CREATE INDEX "Expansion_entries_idx" ON "Expansion" USING GIN ("entries" jsonb_path_ops);
