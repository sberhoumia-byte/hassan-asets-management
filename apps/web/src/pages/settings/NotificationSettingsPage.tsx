import { Alert, Button, Card, Group, Stack, Switch, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type NotificationType } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { notifyError } from "../../lib/forms";

/** تفضيلات الإشعارات للمستخدم الحالي، وتشغيل الفحص فوراً لمن يملك إدارة الإعدادات. */
export function NotificationSettingsPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");
  const prefs = useQuery({ queryKey: ["notif-prefs"], queryFn: () => api.notify!.preferences(), enabled: !!api.notify });
  if (!api.notify) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;

  const toggle = async (type: NotificationType, enabled: boolean) => {
    setBusy(type);
    try {
      qc.setQueryData(["notif-prefs"], await api.notify!.setPreferences([{ type, enabled }]));
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy("");
    }
  };
  const runNow = async () => {
    setBusy("run");
    try {
      const r = await api.notify!.runNow(activeSchool!.id);
      notifications.show({ color: "green", message: t("notif.runDone", { n: r.created }) });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy("");
    }
  };

  return (
    <Stack mt="md" maw={760}>
      <Card>
        <Title order={4}>{t("notif.prefsTitle")}</Title>
        <Text size="sm" c="dimmed" mb="md">{t("notif.prefsIntro")}</Text>
        <Stack gap="sm" data-testid="notif-prefs">
          {(prefs.data ?? []).map((p) => (
            <Group key={p.type} justify="space-between" wrap="nowrap" className="border-b border-[var(--line)] pb-2 last:border-0">
              <div>
                <Text size="sm" fw={600}>{t(`notif.type.${p.type}`)}</Text>
                <Text size="xs" c="dimmed">{t(`notif.desc.${p.type}`)}</Text>
              </div>
              <Switch checked={p.enabled} disabled={busy === p.type} onChange={(e) => toggle(p.type, e.currentTarget.checked)} aria-label={t(`notif.type.${p.type}`)} data-testid={`pref-${p.type}`} />
            </Group>
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt="md">{t("notif.emailNote")}</Text>
      </Card>
      {can("settings.manage") && activeSchool && (
        <Card>
          <Title order={5}>{t("notif.runTitle")}</Title>
          <Text size="sm" c="dimmed" mb="sm">{t("notif.runIntro")}</Text>
          <Button variant="light" loading={busy === "run"} onClick={runNow} data-testid="notif-run">
            {t("notif.run")}
          </Button>
        </Card>
      )}
    </Stack>
  );
}
