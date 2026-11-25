import { useState } from "react";
import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { IconFileTypePdf } from "@tabler/icons-react";
import { api, saveDownload } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { notifyError } from "../lib/forms";

/** يولّد الوثيقة PDF على الخادم (بنفس الترويسة) ويحفظها في الأرشيف برقم، ثم ينزّلها. */
export function ServerPdfButton({ kind, id }: { kind: "loan" | "custody" | "inventory"; id: string }) {
  const { t, locale } = useI18n();
  const { activeSchool, can } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!api.reports || !activeSchool || !can("reports.print")) return null;
  const run = async () => {
    setBusy(true);
    try {
      const d = await api.reports!.docPdf(activeSchool.id, kind, id, locale === "fr" ? "fr" : "ar");
      saveDownload(d);
      notifications.show({ color: "green", message: t("doc.serverPdfDone", { n: d.number }) });
      void qc.invalidateQueries({ queryKey: ["report-archive", activeSchool.id] });
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button color="red" variant="light" leftSection={<IconFileTypePdf size={16} />} loading={busy} onClick={run} data-testid="server-pdf">
      {t("doc.serverPdf")}
    </Button>
  );
}
