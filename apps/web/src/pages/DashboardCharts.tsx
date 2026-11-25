import { Card, Skeleton, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { IconChartPie } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { ChartFrame, HBars, MonthBars, StackedRows } from "../components/Charts";
import { useI18n } from "../i18n";

const KEYS = ["assetsByCategory", "stockStatus", "resourcesDistribution", "loansStatus", "acquisitions", "maintenance", "inventoryResults"] as const;

function Empty({ note }: { note?: string }) {
  const { t } = useI18n();
  return (
    <div className="h-40 rounded-lg border border-dashed border-[var(--line)] bg-[#fafbfd] grid place-items-center text-center p-3">
      <div>
        <IconChartPie size={28} color="#9aa7ba" />
        <Text size="sm" c="dimmed">{t("dash.charts.empty")}</Text>
        {note && <Text size="xs" c="dimmed">{note}</Text>}
      </div>
    </div>
  );
}

/**
 * الرسوم البيانية للوحة القيادة: بيانات حقيقية من الخادم (GET dashboard/charts).
 * في وضع المراجعة المحلي لا توجد بيانات فتُعرض رسالة «متاح مع الخادم فقط».
 */
export function DashboardCharts({ sid }: { sid?: string }) {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const enabled = !!sid && !!api.reports && api.mode === "server" && can("dashboard.view");
  const q = useQuery({ queryKey: ["dash", "charts", sid], queryFn: () => api.reports!.charts(sid!), enabled });

  const card = (key: string, body: ReactNode) => (
    <Card key={key} data-testid={`chart-${key}`}>
      <Title order={5} mb="sm">{t(`dash.charts.${key}`)}</Title>
      {body}
    </Card>
  );

  if (!enabled) return <>{KEYS.map((k) => card(k, <Empty note={t(api.mode === "server" ? "errors.forbidden" : "common.serverOnly")} />))}</>;
  if (q.isLoading) return <>{KEYS.map((k) => card(k, <Skeleton h={160} />))}</>;
  if (q.isError || !q.data) return <>{KEYS.map((k) => card(k, <Empty />))}</>;

  const d = q.data;
  const intl = locale === "ar" ? "ar-MA-u-nu-latn" : "fr-MA";
  const num = (n: number) => new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(n);
  const money = (n: number) => new Intl.NumberFormat("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtMonth = (m: string) => new Intl.DateTimeFormat(intl, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const bars = (key: string, rows: { label: string; value: number }[], caption?: string) =>
    card(
      key,
      sum(rows.map((r) => r.value)) === 0 ? (
        <Empty />
      ) : (
        <ChartFrame caption={caption} table={{ head: [t(`dash.charts.${key}`), t("dash.charts.count")], rows: rows.map((r) => [r.label, r.value]) }}>
          <HBars rows={rows} fmt={num} />
        </ChartFrame>
      ),
    );

  const cat = d.assetsByCategory.map((c) => ({ label: c.others ? t("dash.charts.others") : locale === "fr" && c.labelFr ? c.labelFr : c.label, value: c.value }));
  const stock = (["ok", "low", "empty"] as const).map((k) => ({ label: t(`dash.charts.stock.${k}`), value: d.stockStatus[k] }));
  const res = (["available", "onLoan", "damaged", "maintenance"] as const).map((k) => ({ label: t(`dash.charts.res.${k}`), value: d.resourcesDistribution[k] }));
  const loans = (["active", "overdue", "returned12"] as const).map((k) => ({ label: t(`dash.charts.loans.${k}`), value: d.loansStatus[k] }));

  const acqCount = d.acquisitions.map((a) => a.count);
  const acqValue = d.acquisitions.map((a) => a.value);
  const opened = d.maintenance.map((m) => m.opened);
  const closed = d.maintenance.map((m) => m.closed);
  const invKeys = ["matched", "missing", "misplaced", "surplus"] as const;

  return (
    <>
      {bars("assetsByCategory", cat)}
      {bars("stockStatus", stock)}
      {bars("resourcesDistribution", res)}
      {bars("loansStatus", loans)}
      {card(
        "acquisitions",
        sum(acqCount) === 0 ? (
          <Empty />
        ) : (
          <ChartFrame
            caption={`${t("dash.charts.count")} · ${t("dash.charts.last12")}`}
            table={{ head: ["", t("dash.charts.count"), t("dash.charts.value")], rows: d.months.map((m, i) => [fmtMonth(m), acqCount[i] ?? 0, money(acqValue[i] ?? 0)]) }}
          >
            {/* محور واحد: العدد فقط؛ القيمة المالية في التلميح والجدول وليس على محور ثانٍ */}
            <MonthBars months={d.months} series={[{ label: t("dash.charts.count"), values: acqCount }]} fmtMonth={fmtMonth} fmt={num} />
            <Text size="xs" c="dimmed" mt={4}>
              {t("dash.charts.value")}: <span dir="ltr">{money(sum(acqValue))}</span>
            </Text>
          </ChartFrame>
        ),
      )}
      {card(
        "maintenance",
        sum(opened) + sum(closed) === 0 ? (
          <Empty />
        ) : (
          <ChartFrame
            caption={t("dash.charts.last12")}
            table={{ head: ["", t("dash.charts.opened"), t("dash.charts.closedSeries")], rows: d.months.map((m, i) => [fmtMonth(m), opened[i] ?? 0, closed[i] ?? 0]) }}
          >
            <MonthBars
              months={d.months}
              series={[
                { label: t("dash.charts.opened"), values: opened },
                { label: t("dash.charts.closedSeries"), values: closed },
              ]}
              fmtMonth={fmtMonth}
              fmt={num}
            />
          </ChartFrame>
        ),
      )}
      {card(
        "inventoryResults",
        d.inventoryResults.length === 0 ? (
          <Empty />
        ) : (
          <ChartFrame
            caption={t("dash.charts.lastSessions")}
            table={{ head: ["", ...invKeys.map((k) => t(`dash.charts.inv.${k}`))], rows: d.inventoryResults.map((r) => [r.number, ...invKeys.map((k) => r[k])]) }}
          >
            <StackedRows rows={d.inventoryResults.map((r) => ({ label: r.number, parts: invKeys.map((k) => r[k]) }))} keys={invKeys.map((k) => t(`dash.charts.inv.${k}`))} />
          </ChartFrame>
        ),
      )}
    </>
  );
}
