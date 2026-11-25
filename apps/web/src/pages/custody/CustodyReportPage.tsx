import { useParams } from "react-router";
import { Alert, Center, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { A4Frame, A4Sheet, DocToolbar, KvTable, Signatures } from "../../print/DocShell";

/** محضر التسليم أو الإرجاع أو النقل على A4 بترويسة المؤسسة وخانات توقيع الأطراف. */
export function CustodyReportPage() {
  const { t, fmtDate } = useI18n();
  const { activeSchool, can } = useAuth();
  const { id = "" } = useParams();
  const sid = activeSchool?.id ?? "";
  const rec = useQuery({ queryKey: ["custody-rec", sid, id], queryFn: () => api.custody!.get(sid, id), enabled: !!sid && !!api.custody && can("custody.view") });
  const branding = useQuery({ queryKey: ["branding", sid], queryFn: () => api.getBranding(sid), enabled: !!sid });

  if (!api.custody) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("custody.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  if (rec.isError) return <Alert color="red">{t(rec.error instanceof ApiError && rec.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>;
  if (!rec.data || !branding.data)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  const r = rec.data;
  const title = t(`custodyReport.${r.action}`);
  const rows: [string, React.ReactNode][] = [
    [t("custody.action"), t(`custodyAction.${r.action}`)],
    [t("custody.date"), fmtDate(`${r.occurredAt.slice(0, 10)}T12:00:00`)],
    [t("custody.asset"), r.asset.name],
    [t("assets.inventoryNumber"), <span dir="ltr">{r.asset.inventoryNumber}</span>],
    [t("assets.quantity"), r.asset.quantity],
  ];
  if (r.action !== "RELOCATION") {
    rows.push([t("custody.fromStaff"), r.fromStaff ?? "—"]);
    rows.push([t("custody.toStaff"), r.toStaff ? `${r.toStaff}${r.toStaffNumber ? ` (${r.toStaffNumber})` : ""}` : "—"]);
  }
  if (r.toRoom || r.action === "RELOCATION") {
    rows.push([t("custody.fromRoom"), r.fromRoom ?? "—"]);
    rows.push([t("custody.toRoom"), r.toRoom ?? "—"]);
  }
  if (r.notes) rows.push([t("stock.notes"), r.notes]);
  if (r.by) rows.push([t("custody.recordedBy"), r.by]);
  const signs =
    r.action === "RELOCATION" ? ["custodyReport.signOfficer", "receipt.signDirector"] : r.action === "RETURN" ? ["custodyReport.signFrom", "custodyReport.signOfficer", "receipt.signDirector"] : ["custodyReport.signFrom", "custodyReport.signTo", "receipt.signDirector"];
  return (
    <>
      <DocToolbar title={<>{title} — <span dir="ltr">{r.number}</span></>} intro={t("receipt.intro")} back="/custody" />
      <A4Frame>
        <A4Sheet branding={branding.data} school={activeSchool} title={title} number={r.number} testId="custody-report">
          <KvTable rows={rows} />
          <p style={{ fontSize: "9.5pt", margin: "2mm 0 0" }}>{t(`custodyPledge.${r.action}`)}</p>
          <Signatures keys={signs} />
        </A4Sheet>
      </A4Frame>
    </>
  );
}
