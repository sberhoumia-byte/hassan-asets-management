-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'XLSX');

-- CreateTable
CREATE TABLE "generated_reports" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lang" "Locale" NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "filters" JSONB,
    "subjectId" UUID,
    "rowCount" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "fileId" UUID NOT NULL,
    "letterheadVersion" INTEGER,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generated_reports_schoolId_createdAt_idx" ON "generated_reports"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "generated_reports_schoolId_reportKey_idx" ON "generated_reports"("schoolId", "reportKey");

-- CreateIndex
CREATE UNIQUE INDEX "generated_reports_schoolId_number_key" ON "generated_reports"("schoolId", "number");

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- أرشيف التقارير: إلحاق فقط.
CREATE TRIGGER generated_reports_append_only
  BEFORE UPDATE OR DELETE ON generated_reports
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
