import { ActionIcon, Anchor, Group, Indicator, Popover, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBell } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { api, notificationLink, type AppNotification } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";

/**
 * جرس الإشعارات: إشعارات الخادم (التنبيهات المجدولة) مع عدد غير المقروء، تعليم المقروء، والانتقال إلى الشاشة المعنية.
 * يُحدَّث كل دقيقة. في وضع المراجعة تبقى القائمة المحلية (فارغة).
 */
export function NotificationBell() {
  const { t, fmtDateTime } = useI18n();
  const { activeSchool, setActiveSchoolId } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const server = !!api.notify;
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (server ? api.notify!.list() : { unread: 0, items: [] as AppNotification[], legacy: await api.notifications() }),
    refetchInterval: 60_000,
  });
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  const openOne = async (n: AppNotification) => {
    if (!n.readAt) await api.notify!.read(n.id).catch(() => undefined);
    refresh();
    const to = notificationLink(n);
    setOpen(false);
    if (n.schoolId && n.schoolId !== activeSchool?.id) setActiveSchoolId(n.schoolId);
    if (to) nav(to);
  };

  return (
    <Popover width={360} position="bottom-end" shadow="md" opened={open} onChange={setOpen}>
      <Popover.Target>
        <Indicator disabled={unread === 0} label={unread > 99 ? "99+" : unread} size={16} color="red" data-testid="notif-count">
          <ActionIcon variant="default" size="lg" aria-label={t("header.notifications")} onClick={() => setOpen((o) => !o)} data-testid="notif-bell">
            <IconBell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Group justify="space-between" mb={6} px={4}>
          <Text fw={700}>{t("header.notifications")}</Text>
          {server && unread > 0 && (
            <Anchor component="button" size="xs" onClick={async () => { await api.notify!.readAll(); refresh(); }} data-testid="notif-read-all">
              {t("notif.readAll")}
            </Anchor>
          )}
        </Group>
        {items.length === 0 ? (
          <Text size="sm" c="dimmed" px={4} pb={4}>{t("header.noNotifications")}</Text>
        ) : (
          <ScrollArea.Autosize mah={420}>
            <Stack gap={2} data-testid="notif-list">
              {items.map((n) => (
                <UnstyledButton
                  key={n.id}
                  onClick={() => openOne(n)}
                  className={`rounded-md px-2 py-1.5 text-start hover:bg-[#f4f6fa] ${n.readAt ? "" : "bg-[#eef4fc]"}`}
                  data-testid={`notif-${n.type}`}
                >
                  <Text size="sm" fw={n.readAt ? 400 : 600}>{t(`notif.${n.type}`, n.vars)}</Text>
                  <Text size="xs" c="dimmed">{fmtDateTime(n.at)}</Text>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}
        {server && (
          <Anchor component="button" size="xs" mt={6} px={4} onClick={() => { setOpen(false); nav("/settings/notifications"); }}>
            {t("notif.settings")}
          </Anchor>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
