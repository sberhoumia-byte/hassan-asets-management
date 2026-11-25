import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Center, Loader } from "@mantine/core";
import { api, ApiError } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";

/**
 * وجهة رمز QR (#/scan/:token): يطلب من الخادم حل الرمز، ثم يفتح بطاقة الكيان في مؤسسته
 * (بتبديل المؤسسة النشطة إن لزم). من لا يصل إلى المؤسسة يرى «غير موجود» فقط.
 */
export function ScanPage() {
  const { t } = useI18n();
  const { token = "" } = useParams();
  const { activeSchool, setActiveSchoolId } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!api.assets) return setError("common.serverOnly");
    let alive = true;
    api.assets
      .scan(token)
      .then((r) => {
        if (!alive) return;
        if (r.schoolId !== activeSchool?.id) setActiveSchoolId(r.schoolId);
        nav(r.kind === "resourceUnit" ? `/resources/${r.id}` : `/assets/${r.id}`, { replace: true });
      })
      .catch((e) => alive && setError(e instanceof ApiError && e.code === "NOT_FOUND" ? "scan.notFound" : "errors.unexpected"));
    return () => {
      alive = false;
    };
  }, [token]);

  if (error) return <Alert color="red" data-testid="scan-error">{t(error)}</Alert>;
  return (
    <Center py="xl">
      <Loader />
    </Center>
  );
}
