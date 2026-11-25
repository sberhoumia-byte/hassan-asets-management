import type { Branding, School } from "../api/types";
import { LetterheadView } from "./LetterheadView";
import { FOOTER_MM, HEADER_GAP_MM, paginate, TITLE_MM } from "./paginate";

export interface ReportColumn<T> {
  key: string;
  label: string;
  render: (row: T) => string;
}

/**
 * وثيقة تقرير على صفحات A4 تستعمل الهوية البصرية المركزية تلقائياً.
 * ستُستعمل نفس البنية في المرحلة 7 لتوليد PDF من الخادم.
 */
export function ReportDocument<T>({
  branding,
  school,
  title,
  columns,
  rows,
  pageLabel,
}: {
  branding: Branding;
  school?: School;
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
  pageLabel: (page: number, total: number) => string;
}) {
  const lh = branding.letterhead;
  const m = lh.marginsMm;
  const pages = paginate(rows, lh, lh.mode === "IMAGE" && !!lh.imageDataUrl);

  return (
    <div className="a4-stack" data-testid="report-document">
      {pages.map((p) => (
        <section
          key={p.index}
          className="a4-page"
          data-testid="a4-page"
          style={{ padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm` }}
          dir="rtl"
        >
          {p.showLetterhead && (
            <div style={{ marginBottom: `${HEADER_GAP_MM}mm` }}>
              <LetterheadView branding={branding} school={school} />
            </div>
          )}
          {p.showTitle && (
            <h2 className="font-cairo" style={{ height: `${TITLE_MM}mm`, margin: 0, display: "grid", placeItems: "center", fontSize: "14pt" }}>
              {title}
            </h2>
          )}
          <table className="report-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.render(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ flex: 1 }} />
          {(lh.showFooter || lh.showPageNumbers) && (
            <footer
              data-testid="page-footer"
              style={{
                height: `${FOOTER_MM}mm`,
                borderTop: "0.3mm solid #c9d2df",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "8.5pt",
                color: "#555",
              }}
            >
              <span>{lh.showFooter ? lh.footerText : ""}</span>
              <span>{lh.showPageNumbers ? pageLabel(p.index + 1, pages.length) : ""}</span>
            </footer>
          )}
        </section>
      ))}
    </div>
  );
}
