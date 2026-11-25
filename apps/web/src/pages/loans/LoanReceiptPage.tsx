import { useNavigate, useParams } from "react-router";
import { Alert, Button, Card, Center, Group, Loader, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { IconArrowBack, IconPrinter } from "@tabler/icons-react";
import { api, ApiError } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { LetterheadView } from "../../print/LetterheadView";
import { ScaledPreview } from "../../print/ScaledPreview";
import { dayOf } from "../../lib/forms";

/**
 * وصل الإعارة/الإرجاع على صفحة A4 بترويسة المؤسسة المحفوظة، مع خانات التوقيع.
 * يُطبع من المتصفح (حفظ PDF من نافذة الطباعة)؛ توليد PDF من الخادم يأتي في المرحلة 7.
 */
export function LoanReceiptPage() {
  const { t, fmtDate, fmtDateTime, dir } = useI18n();
  const { activeSchool, can } = useAuth();
  const { id = "" } = useParams();
  const nav = useNavigate();
  const sid = activeSchool?.id ?? "";
  const loan = useQuery({ queryKey: ["loan", sid, id], queryFn: () => api.loans!.get(sid, id), enabled: !!sid && !!api.loans && can("loans.view") });
  const branding = useQuery({ queryKey: ["branding", sid], queryFn: () => api.getBranding(sid), enabled: !!sid });

  if (!api.loans) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("loans.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  if (loan.isError) return <Alert color="red">{t(loan.error instanceof ApiError && loan.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>;
  if (!loan.data || !branding.data)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );

  const l = loan.data;
  const lh = branding.data.letterhead;
  const m = lh.marginsMm;
  const hasReturns = l.returns.length > 0;
  const title = hasReturns ? t("receipt.titleReturn") : t("receipt.titleLoan");
  const row = (k: string, v: React.ReactNode) => (
    <tr>
      <th style={{ width: "38%" }}>{k}</th>
      <td>{v}</td>
    </tr>
  );

  return (
    <>
      <Card className="no-print">
        <Group justify="space-between">
          <div>
            <Title order={4}>{title} — <span dir="ltr">{l.number}</span></Title>
            <Text size="sm" c="dimmed">{t("receipt.intro")}</Text>
          </div>
          <Group gap="xs">
            <Button variant="default" leftSection={<IconArrowBack size={16} />} onClick={() => nav("/loans")}>
              {t("receipt.back")}
            </Button>
            {import.meta.env.MODE !== "review" && (
              <Button leftSection={<IconPrinter size={16} />} onClick={() => window.print()} data-testid="print">
                {t("print.print")}
              </Button>
            )}
          </Group>
        </Group>
      </Card>
      <div className="rounded-xl bg-[#dde3ec] p-3 md:p-6 print:bg-white print:p-0">
        <ScaledPreview>
          <div className="a4-stack">
            <section className="a4-page" data-testid="loan-receipt" dir={dir} style={{ padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm` }}>
              <div style={{ marginBottom: "6mm" }}>
                <LetterheadView branding={branding.data} school={activeSchool} />
              </div>
              <h2 className="font-cairo" style={{ textAlign: "center", margin: "0 0 2mm", fontSize: "15pt" }}>{title}</h2>
              <div style={{ textAlign: "center", marginBottom: "5mm", fontSize: "10pt" }}>
                {t("receipt.number")}: <b dir="ltr">{l.number}</b>
              </div>
              <table className="report-table" style={{ marginBottom: "5mm" }}>
                <tbody>
                  {row(t("loans.resource"), `${l.resource.code} — ${l.resource.name}`)}
                  {l.unit && row(t("loans.unit"), <span dir="ltr">{l.unit}</span>)}
                  {row(t("assets.quantity"), l.quantity)}
                  {row(t("loans.borrower"), l.borrowerFr ? `${l.borrower} — ${l.borrowerFr}` : l.borrower)}
                  {row(t("loans.loanedAt"), fmtDateTime(l.loanedAt))}
                  {row(t("loans.dueAt"), fmtDate(dayOf(l.dueAt)))}
                  {l.conditionOut && row(t("loans.conditionOut"), l.conditionOut)}
                  {l.handedOverBy && row(t("receipt.handedOverBy"), l.handedOverBy)}
                  {l.notes && row(t("stock.notes"), l.notes)}
                  {row(t("assets.status"), `${t(`loanStatus.${l.status}`)}${l.lateDays > 0 ? ` — ${t("loans.lateDays", { n: l.lateDays })}` : ""}`)}
                </tbody>
              </table>
              {hasReturns && (
                <>
                  <h3 style={{ fontSize: "11pt", margin: "0 0 2mm" }}>{t("receipt.returns")}</h3>
                  <table className="report-table" style={{ marginBottom: "5mm" }} data-testid="receipt-returns">
                    <thead>
                      <tr>
                        <th>{t("receipt.returnedAt")}</th>
                        <th>{t("assets.quantity")}</th>
                        <th>{t("loans.conditionIn")}</th>
                        <th>{t("receipt.receivedBy")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {l.returns.map((r) => (
                        <tr key={r.id}>
                          <td>{fmtDateTime(r.returnedAt)}</td>
                          <td>{r.quantity}{r.damaged ? ` (${t("receipt.damaged")})` : ""}</td>
                          <td>{r.conditionIn ?? "—"}</td>
                          <td>{r.receivedBy ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {l.outstanding > 0 && <p style={{ margin: "0 0 4mm", fontWeight: 700 }}>{t("loans.outstandingN", { n: l.outstanding })}</p>}
                </>
              )}
              <p style={{ fontSize: "9.5pt", margin: "2mm 0 0" }}>{t(hasReturns ? "receipt.pledgeReturn" : "receipt.pledgeLoan")}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6mm", marginTop: "10mm" }} data-testid="signatures">
                {["receipt.signBorrower", "receipt.signOfficer", "receipt.signDirector"].map((k) => (
                  <div key={k} style={{ border: "0.3mm solid #c9d2df", borderRadius: "1.5mm", height: "32mm", padding: "2mm", fontSize: "9.5pt", fontWeight: 700, textAlign: "center" }}>
                    {t(k)}
                  </div>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              {lh.showFooter && (
                <footer style={{ borderTop: "0.3mm solid #c9d2df", paddingTop: "2mm", fontSize: "8.5pt", color: "#555" }}>{lh.footerText}</footer>
              )}
            </section>
          </div>
        </ScaledPreview>
      </div>
    </>
  );
}
