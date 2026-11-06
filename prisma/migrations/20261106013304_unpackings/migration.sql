-- CreateTable
CREATE TABLE "Unpacking" (
    "hash" TEXT NOT NULL,
    "unpacker" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "policy" INTEGER NOT NULL,
    "cutShort" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unpacking_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "Member" (
    "hash" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT,
    "size" INTEGER,
    "mime" TEXT,
    "leftOut" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("hash","position")
);

-- CreateIndex
CREATE INDEX "Member_content_idx" ON "Member"("content");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_hash_fkey" FOREIGN KEY ("hash") REFERENCES "Unpacking"("hash") ON DELETE CASCADE ON UPDATE CASCADE;
