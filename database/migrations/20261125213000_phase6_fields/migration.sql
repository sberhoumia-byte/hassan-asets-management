-- AlterTable
ALTER TABLE "delivery_items" ADD COLUMN     "postedAs" TEXT,
ADD COLUMN     "postedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "photoFileId" UUID;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_photoFileId_fkey" FOREIGN KEY ("photoFileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

