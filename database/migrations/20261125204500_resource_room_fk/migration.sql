-- المرحلة 5: ربط الصنف الكمي من الوسائل التعليمية بفضاء تخزينه
ALTER TABLE "educational_resources" ADD CONSTRAINT "educational_resources_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
