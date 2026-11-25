import { useParams } from "react-router";
import { Alert, Center, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type InventoryLine } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { fmtQty } from "../../lib/forms";
import { A4Frame, A4Sheet, DocToolbar, KvTable, Signatures } from "../../print/DocShell";
import { ReportDocument } from "../../print/ReportDocument";

/**
 * محضر الجرد على A4: ملخص الدورة والأعداد والفروقات حسب النوع، ملاحظات المحضر، وخانات التوقيع؛
 * ثم جدول تفصيلي للفروقات موزع على صفحات بنفس الترويسة.
 */
export function InventoryReportPage() {
  const { t, fmtDate, fmtDateTime } = useI18n();
  const { activeSchool, can } = useAuth();
  const { id = "" } = useParams();
  const sid = activeSchool?.id ?? "";
  const on = !!sid && !!api.inventory && can("inventory.view");
  const s = useQuery({ queryKey: ["inv-session", sid, id], queryFn: () => api.inventory!.get(sid, id), enabled: on });
  const d = useQuery({ queryKey: ["inv-disc", sid, id], queryFn: () => api.inventory!.discrepancies(sid, id), enabled: on });
  const branding = useQuery({ queryKey: ["branding", sid], queryFn: () => api.getBranding(sid), enabled: !!sid });

  if (!api.inventory) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("inventory.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  if (s.isError) return <Alert color="red">{t(s.error instanceof ApiError && s.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>;
  if (!s.data || !d.data || !branding.data)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  const x = s.data;
  const disc = d.data;
  const kinds = ["missing", "misplaced", "surplus", "unexpected", "notCounted", "condition"] as const;
  const detail: { kind: string; l: InventoryLine }[] = kinds.flatMap((k) => disc[k].map((l) => ({ kind: k, l })));
  const title = t("invReport.title", { type: t(`invType.${x.type}`) });
  const final = ["VALIDATED", "CLOSED", "ARCHIVED"].includes(x.status);
  return (
    <>
      <DocToolbar title={<>{title} — <span dir="ltr">{x.number}</span></>} intro={t("invReport.intro")} back={`/inventory/${id}`} serverPdf={{ kind: "inventory", id }} />
      {!final && <Alert color="orange" variant="light" className="no-print">{t("invReport.draftWarning")}</Alert>}
      <A4Frame>
        <A4Sheet branding={branding.data} school={activeSchool} title={title} number={x.number} testId="inv-report-doc">
          <KvTable
            rows={[
              [t("inv.period"), `${fmtDate(`${x.startDate}T12:00:00`)} — ${fmtDate(`${x.endDate}T12:00:00`)}`],
              [t("inv.scope"), x.rooms.length ? x.rooms.map((r) => r.label).join("، ") : t("inv.wholeSchool")],
              [t("inv.includesStock"), x.includesStock ? t("common.yes") : t("common.no")],
              [t("inv.assignees"), x.assignees.map((a) => a.name).join("، ") || "—"],
              [t("assets.status"), t(`invStatus.${x.status}`)],
              [t("inv.countedLines"), t("inv.countedOf", { c: disc.totals.counted, n: disc.totals.lines })],
              ...kinds.map((k): [string, React.ReactNode] => [t(`invDisc.${k}`), disc[k].length]),
              ...(x.validatedBy ? [[t("invReport.validatedBy"), `${x.validatedBy}${x.validatedAt ? ` — ${fmtDateTime(x.validatedAt)}` : ""}`] as [string, React.ReactNode]] : []),
            ]}
          />
          <h3 style={{ fontSize: "11pt", margin: "0 0 2mm" }}>{t("inv.reportNotes")}</h3>
          <div style={{ border: "0.3mm solid #c9d2df", borderRadius: "1.5mm", minHeight: "25mm", padding: "2mm", fontSize: "10pt", whiteSpace: "pre-wrap" }} data-testid="inv-report-notes-view">
            {x.reportNotes ?? ""}
          </div>
          <Signatures keys={["invReport.signCommittee", "invReport.signOfficer", "receipt.signDirector"]} />
        </A4Sheet>
      </A4Frame>
      {detail.length > 0 && (
        <div className="rounded-xl bg-[#dde3ec] p-3 md:p-6 print:bg-white print:p-0">
          <ReportDocument
            branding={branding.data}
            school={activeSchool}
            title={t("invReport.detailTitle")}
            rows={detail}
            pageLabel={(p, n) => t("print.pageOf", { p, n })}
            columns={[
              { key: "kind", label: t("inv.issues"), render: (r) => t(`invDisc.${r.kind}`) },
              { key: "ref", label: t("inv.ref"), render: (r) => r.l.ref },
              { key: "name", label: t("inv.item"), render: (r) => r.l.name },
              { key: "exp", label: t("inv.expected"), render: (r) => fmtQty(r.l.expectedQty) },
              { key: "cnt", label: t("inv.counted"), render: (r) => (r.l.countedQty === undefined ? "—" : fmtQty(r.l.countedQty)) },
              { key: "room", label: t("inv.foundRoom"), render: (r) => (r.kind === "condition" ? (r.l.conditionFound ?? "") : (r.l.foundRoom ?? r.l.expectedRoom ?? "—")) },
            ]}
          />
        </div>
      )}
    </>
  );
}
