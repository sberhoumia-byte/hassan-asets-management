import { useState, type ReactNode } from "react";
import { Anchor, Group, Table, Text } from "@mantine/core";
import { useI18n } from "../i18n";

/**
 * رسوم بيانية SVG خفيفة للوحة القيادة (بلا مكتبة خارجية):
 * - محور واحد، علامات رفيعة بنهايات مستديرة 4px، فراغ 2px بين الأعمدة، شبكة باهتة.
 * - طبقة تمرير (tooltip) على كل علامة، ومفتاح ألوان عند تعدد السلاسل، وعرض جدولي للأرقام.
 * الألوان التصنيفية بترتيب ثابت (تم التحقق منها لعمى الألوان، الفرق ≥ 11.8)؛
 * بعضها أقل من 3:1 على الخلفية البيضاء، لذا القيم مكتوبة مباشرة والجدول متاح دائماً.
 */
export const SERIES = ["#257de0", "#f47230", "#00b894", "#f2a600"] as const;
const GRID = "#e6eaf0";
const AXIS = "#8a94a6";

function niceMax(v: number) {
  if (v <= 4) return Math.max(1, Math.ceil(v));
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** إطار موحد: عنوان فرعي، المحتوى، ورابط «عرض الأرقام» يبدّل إلى جدول. */
export function ChartFrame({ caption, table, children, testId }: { caption?: string; table: { head: string[]; rows: (string | number)[][] }; children: ReactNode; testId?: string }) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  return (
    <div data-testid={testId}>
      <Group justify="space-between" mb={4} gap="xs">
        <Text size="xs" c="dimmed">{caption ?? ""}</Text>
        <Anchor component="button" type="button" size="xs" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "◧" : t("dash.charts.table")}
        </Anchor>
      </Group>
      {asTable ? (
        <Table fz="xs" withTableBorder striped>
          <Table.Thead>
            <Table.Tr>{table.head.map((h) => <Table.Th key={h}>{h}</Table.Th>)}</Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {table.rows.map((r, i) => (
              <Table.Tr key={i}>{r.map((c, j) => <Table.Td key={j}>{c}</Table.Td>)}</Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        children
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <Group gap="md" mt={6}>
      {items.map((i) => (
        <Group key={i.label} gap={6} wrap="nowrap">
          <span style={{ width: 10, height: 10, borderRadius: 3, background: i.color, display: "inline-block" }} />
          <Text size="xs">{i.label}</Text>
        </Group>
      ))}
    </Group>
  );
}

/** أشرطة أفقية لتوزيع فئات (سلسلة واحدة): التسمية والقيمة مكتوبتان بجانب كل شريط. */
export function HBars({ rows, fmt = String }: { rows: { label: string; value: number }[]; fmt?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div
          key={r.label + i}
          className="grid items-center gap-2"
          style={{ gridTemplateColumns: "minmax(0,38%) minmax(0,1fr) auto" }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          title={`${r.label}: ${fmt(r.value)}`}
        >
          <Text size="xs" truncate>{r.label}</Text>
          <div style={{ height: 14, background: "#f3f5f9", borderRadius: 4 }}>
            <div
              style={{
                width: `${(r.value / max) * 100}%`,
                minWidth: r.value > 0 ? 3 : 0,
                height: "100%",
                background: SERIES[0],
                opacity: hover === null || hover === i ? 1 : 0.55,
                borderRadius: 4,
                transition: "opacity .12s",
              }}
            />
          </div>
          <Text size="xs" fw={600} dir="ltr">{fmt(r.value)}</Text>
        </div>
      ))}
    </div>
  );
}

/** شريط مكدس أفقي لكل سطر (مثلاً نتائج دورات الجرد)، بفراغ 2px بين الأجزاء ومفتاح ألوان. */
export function StackedRows({ rows, keys }: { rows: { label: string; parts: number[] }[]; keys: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const total = r.parts.reduce((a, b) => a + b, 0) || 1;
          return (
            <div key={r.label} className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0,32%) minmax(0,1fr)" }}>
              <Text size="xs" dir="ltr" ta="start" truncate>{r.label}</Text>
              <div className="flex" style={{ gap: 2, height: 16 }} dir="ltr">
                {r.parts.map((p, i) =>
                  p > 0 ? (
                    <div
                      key={i}
                      title={`${r.label} — ${keys[i]}: ${p}`}
                      onMouseEnter={() => setHover(`${r.label}|${i}`)}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        flex: `${p / total} 1 0`,
                        background: SERIES[i % SERIES.length],
                        borderRadius: 4,
                        opacity: hover === null || hover === `${r.label}|${i}` ? 1 : 0.55,
                      }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Legend items={keys.map((k, i) => ({ label: k, color: SERIES[i % SERIES.length]! }))} />
    </div>
  );
}

/** أعمدة شهرية (سلسلة أو سلسلتان متجاورتان) على محور واحد، مع تلميح عند التمرير. */
export function MonthBars({ months, series, fmtMonth, fmt = String }: { months: string[]; series: { label: string; values: number[] }[]; fmtMonth: (m: string) => string; fmt?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 520;
  const H = 150;
  const pad = { l: 30, r: 6, t: 8, b: 22 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const band = (W - pad.l - pad.r) / months.length;
  const barW = Math.max(3, (band - 6 - (series.length - 1) * 2) / series.length);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div className="relative" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={series.map((s) => s.label).join(" / ")}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} stroke={GRID} strokeWidth={1} />
            <text x={pad.l - 4} y={y(tk) + 3} fontSize={9} textAnchor="end" fill={AXIS}>
              {fmt(tk)}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x0 = pad.l + i * band + 3;
          return (
            <g key={m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* منطقة تمرير أوسع من العلامة */}
              <rect x={pad.l + i * band} y={pad.t} width={band} height={H - pad.t - pad.b} fill={hover === i ? "#f3f6fb" : "transparent"} />
              {series.map((s, k) => {
                const v = s.values[i] ?? 0;
                const h = H - pad.b - y(v);
                return v > 0 ? <rect key={k} x={x0 + k * (barW + 2)} y={y(v)} width={barW} height={Math.max(h, 1)} rx={Math.min(4, barW / 2)} fill={SERIES[k]} /> : null;
              })}
              {i % 2 === (months.length - 1) % 2 && (
                <text x={pad.l + i * band + band / 2} y={H - 6} fontSize={9} textAnchor="middle" fill={AXIS}>
                  {fmtMonth(m)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke={AXIS} strokeWidth={1} />
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs shadow-sm" style={{ left: `${Math.min(70, ((pad.l + hover * band) / W) * 100)}%` }} data-testid="chart-tooltip">
          <div className="font-bold">{fmtMonth(months[hover]!)}</div>
          {series.map((s, k) => (
            <div key={s.label} className="flex items-center gap-1">
              <span style={{ width: 8, height: 8, borderRadius: 2, background: SERIES[k], display: "inline-block" }} />
              {s.label}: {fmt(s.values[hover] ?? 0)}
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && <Legend items={series.map((s, k) => ({ label: s.label, color: SERIES[k]! }))} />}
    </div>
  );
}
