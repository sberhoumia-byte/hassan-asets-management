import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Button, Card, Group, Loader, SegmentedControl, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { IconArrowBack, IconPrinter } from "@tabler/icons-react";
import { api } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { ReportDocument } from "../../print/ReportDocument";
import { ScaledPreview } from "../../print/ScaledPreview";
import { sampleRows } from "../../print/sampleReport";
import { printPage } from "../../lib/native";

/**
 * معاينة الطباعة: تقرير نموذجي متعدد الصفحات يستعمل الهوية البصرية المحفوظة مركزياً
 * (وليس مسودة الإعدادات)، لإثبات أن الترويسة تنعكس تلقائياً على التقارير.
 */
export function PrintPreviewPage() {
  const { t } = useI18n();
  const { activeSchool } = useAuth();
  const nav = useNavigate();
  const sid = activeSchool?.id;
  const [rows, setRows] = useState("60");
  const q = useQuery({ queryKey: ["branding", sid], queryFn: () => api.getBranding(sid!), enabled: !!sid });

  if (!q.data || !activeSchool) return <Loader />;

  return (
    <>
      <Card className="no-print">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={4}>{t("settings.printPreview")}</Title>
            <Text size="sm" c="dimmed">{t("print.intro")}</Text>
          </div>
          <Group gap="xs">
            <Button variant="default" leftSection={<IconArrowBack size={16} />} onClick={() => nav("/settings/branding")}>
              {t("print.backToBranding")}
            </Button>
            {/* نسخة المراجعة المشتركة تعمل داخل إطار لا يسمح بنافذة الطباعة */}
            {import.meta.env.MODE !== "review" && (
              <Button leftSection={<IconPrinter size={16} />} onClick={printPage} data-testid="print">
                {t("print.print")}
              </Button>
            )}
          </Group>
        </Group>
        <Group mt="md" gap="sm">
          <Text size="sm">{t("print.rows")}</Text>
          <SegmentedControl
            value={rows}
            onChange={setRows}
            data={["5", "30", "60", "120"]}
            data-testid="rows-control"
          />
        </Group>
        <Alert mt="md" variant="light" color="blue">{t("print.pdfNote")}</Alert>
      </Card>
      <div className="rounded-xl bg-[#dde3ec] p-3 md:p-6 print:bg-white print:p-0">
        <ScaledPreview>
          <ReportDocument
            branding={q.data}
            school={activeSchool}
            title={t("print.sampleTitle")}
            columns={[
              { key: "n", label: t("print.col.number"), render: (r) => String(r.n) },
              { key: "item", label: t("print.col.item"), render: () => t("print.sampleCell") },
              { key: "cat", label: t("print.col.category"), render: () => "—" },
              { key: "loc", label: t("print.col.location"), render: () => "—" },
              { key: "st", label: t("print.col.status"), render: () => "—" },
            ]}
            rows={sampleRows(Number(rows))}
            pageLabel={(p, n) => t("print.pageOf", { p, n })}
          />
        </ScaledPreview>
      </div>
    </>
  );
}
