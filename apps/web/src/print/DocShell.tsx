import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Group, Text, Title } from "@mantine/core";
import { IconArrowBack, IconPrinter } from "@tabler/icons-react";
import type { Branding, School } from "../api/types";
import { useI18n } from "../i18n";
import { LetterheadView } from "./LetterheadView";
import { ScaledPreview } from "./ScaledPreview";

/** شريط الوثيقة (رجوع + طباعة من المتصفح). توليد PDF من الخادم يأتي في المرحلة 7. */
export function DocToolbar({ title, intro, back }: { title: ReactNode; intro: string; back: string }) {
  const { t } = useI18n();
  const nav = useNavigate();
  return (
    <Card className="no-print">
      <Group justify="space-between">
        <div>
          <Title order={4}>{title}</Title>
          <Text size="sm" c="dimmed">{intro}</Text>
        </div>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconArrowBack size={16} />} onClick={() => nav(back)}>
            {t("doc.back")}
          </Button>
          {import.meta.env.MODE !== "review" && (
            <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()} data-testid="print">
              {t("print.print")}
            </Button>
          )}
        </Group>
      </Group>
    </Card>
  );
}

/** صفحة A4 واحدة بترويسة المؤسسة وعنوان ورقم، وتذييل الهوية البصرية. */
export function A4Sheet({ branding, school, title, number, children, testId, letterhead = true }: { branding: Branding; school?: School; title?: string; number?: string; children: ReactNode; testId?: string; letterhead?: boolean }) {
  const { t, dir } = useI18n();
  const lh = branding.letterhead;
  const m = lh.marginsMm;
  return (
    <section className="a4-page" data-testid={testId} dir={dir} style={{ padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm` }}>
      {letterhead && (
        <div style={{ marginBottom: "6mm" }}>
          <LetterheadView branding={branding} school={school} />
        </div>
      )}
      {title && <h2 className="font-cairo" style={{ textAlign: "center", margin: "0 0 2mm", fontSize: "15pt" }}>{title}</h2>}
      {number && (
        <div style={{ textAlign: "center", marginBottom: "5mm", fontSize: "10pt" }}>
          {t("doc.number")}: <b dir="ltr">{number}</b>
        </div>
      )}
      {children}
      <div style={{ flex: 1 }} />
      {lh.showFooter && <footer style={{ borderTop: "0.3mm solid #c9d2df", paddingTop: "2mm", fontSize: "8.5pt", color: "#555" }}>{lh.footerText}</footer>}
    </section>
  );
}

export function A4Frame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl bg-[#dde3ec] p-3 md:p-6 print:bg-white print:p-0">
      <ScaledPreview>
        <div className="a4-stack">{children}</div>
      </ScaledPreview>
    </div>
  );
}

/** خانات توقيع الأطراف. */
export function Signatures({ keys }: { keys: string[] }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${keys.length}, 1fr)`, gap: "6mm", marginTop: "10mm" }} data-testid="signatures">
      {keys.map((k) => (
        <div key={k} style={{ border: "0.3mm solid #c9d2df", borderRadius: "1.5mm", height: "32mm", padding: "2mm", fontSize: "9.5pt", fontWeight: 700, textAlign: "center" }}>
          {t(k)}
        </div>
      ))}
    </div>
  );
}

export function KvTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <table className="report-table" style={{ marginBottom: "5mm" }}>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th style={{ width: "38%" }}>{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
