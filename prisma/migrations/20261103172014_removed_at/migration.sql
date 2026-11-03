-- AlterTable
ALTER TABLE "File" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "removedAt" TIMESTAMP(3);
