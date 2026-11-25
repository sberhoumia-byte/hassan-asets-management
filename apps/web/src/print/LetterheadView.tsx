import type { Branding, School } from "../api/types";
import { letterheadHeightMm } from "./paginate";

/**
 * الترويسة المركزية — مكوّن واحد تستعمله المعاينة الحية وكل التقارير والمحاضر.
 * كل الأبعاد بالمليمتر لتطابق الطباعة.
 */
export function LetterheadView({ branding, school }: { branding: Branding; school?: School }) {
  const lh = branding.letterhead;
  const hasImage = lh.mode === "IMAGE" && !!lh.imageDataUrl;
  const height = letterheadHeightMm(lh, hasImage);

  if (hasImage) {
    const justify = lh.imageAlign === "center" ? "center" : lh.imageAlign === "right" ? "flex-end" : "flex-start";
    return (
      <div style={{ height: `${height}mm`, display: "flex", justifyContent: justify, alignItems: "center" }} data-testid="letterhead">
        <img src={lh.imageDataUrl} alt="" style={{ width: `${lh.imageWidthMm}mm`, height: `${lh.imageHeightMm}mm`, objectFit: "contain" }} />
      </div>
    );
  }

  const logo =
    lh.showLogo && branding.logoDataUrl ? (
      <img
        src={branding.logoDataUrl}
        alt=""
        data-testid="letterhead-logo"
        style={{ width: `${branding.logoWidthMm}mm`, maxHeight: `${height - 4}mm`, objectFit: "contain" }}
      />
    ) : (
      <span />
    );
  const ar = (
    <div className="ar">
      {lh.linesAr.filter(Boolean).map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
  const fr = lh.showFrenchBlock ? (
    <div className="fr">
      {lh.linesFr.filter(Boolean).map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  ) : (
    <span />
  );
  // ترتيب فعلي من اليسار إلى اليمين على الورقة حسب موضع الشعار
  const cols =
    branding.logoAlign === "right" ? [fr, ar, logo] : branding.logoAlign === "left" ? [logo, fr, ar] : [fr, logo, ar];
  const contact = lh.showContact && school ? [school.address, school.phone, school.email].filter(Boolean).join("  ·  ") : "";

  return (
    <div style={{ height: `${height}mm`, overflow: "hidden" }} data-testid="letterhead">
      <div
        className="lh-generated"
        style={{
          direction: "ltr",
          gridTemplateColumns: branding.logoAlign === "center" ? "1fr auto 1fr" : branding.logoAlign === "right" ? "1fr 1fr auto" : "auto 1fr 1fr",
          height: contact ? `calc(${height}mm - 6mm)` : `${height}mm`,
        }}
      >
        {cols.map((c, i) => (
          <div key={i} style={{ display: "flex", justifyContent: c === logo ? "center" : "stretch" }}>
            {c}
          </div>
        ))}
      </div>
      {contact && (
        <div style={{ height: "6mm", fontSize: "8pt", textAlign: "center", color: "#444", direction: "rtl", paddingTop: "1mm" }}>
          {contact}
        </div>
      )}
    </div>
  );
}
