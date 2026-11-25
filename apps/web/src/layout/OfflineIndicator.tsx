import { ActionIcon, Badge, Button, Group, Indicator, Popover, ScrollArea, Stack, Text, Tooltip } from "@mantine/core";
import { IconCloudCheck, IconCloudOff, IconCloudUpload } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { useOutbox } from "../offline/OutboxProvider";
import { ruleMessage } from "../lib/forms";
import { ApiError } from "../api";

const OWN = ["STOCK_INSUFFICIENT", "SESSION_NOT_OPEN", "COUNT_NEWER", "FOREIGN_OPERATION"];
const COLOR = { PENDING: "orange", APPLIED: "green", CONFLICT: "red", REJECTED: "red" } as const;

/** حالة الاتصال وطابور العمليات المسجلة دون اتصال. يظهر فقط عند الانقطاع أو وجود عمليات في الطابور. */
export function OfflineIndicator() {
  const { t, fmtDateTime } = useI18n();
  const o = useOutbox();
  const issues = o.entries.filter((e) => e.status === "CONFLICT" || e.status === "REJECTED").length;
  if (!o.enabled || (o.online && !o.entries.length)) return null;
  const Icon = !o.online ? IconCloudOff : o.pending ? IconCloudUpload : IconCloudCheck;
  const color = !o.online ? "red" : issues ? "red" : o.pending ? "orange" : "green";
  return (
    <Popover position="bottom-end" width={360} shadow="md" withArrow>
      <Popover.Target>
        <Tooltip label={t(o.online ? "outbox.online" : "outbox.offline")}>
          <Indicator disabled={!o.pending && !issues} label={o.pending || issues} size={16} color={color} offset={4}>
            <ActionIcon variant="subtle" color={color} size="lg" aria-label={t("outbox.title")} data-testid="outbox-btn" data-online={o.online ? "1" : "0"}>
              <Icon size={20} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={700} size="sm">{t("outbox.title")}</Text>
            <Badge color={o.online ? "green" : "red"} variant="light" data-testid="net-status">{t(o.online ? "outbox.online" : "outbox.offline")}</Badge>
          </Group>
          <Text size="xs" c="dimmed">{t("outbox.intro")}</Text>
          <ScrollArea.Autosize mah={320}>
            <Stack gap={6} data-testid="outbox-list">
              {o.entries.map((e) => (
                <div key={e.clientOpId} data-testid={`outbox-${e.status}`} style={{ borderInlineStart: `3px solid var(--mantine-color-${COLOR[e.status]}-6)`, paddingInlineStart: 8 }}>
                  <Group justify="space-between" gap={4} wrap="nowrap">
                    <Text size="sm" fw={600} lineClamp={1}>{e.label}</Text>
                    <Badge size="xs" color={COLOR[e.status]} variant="light">{t(`outbox.status.${e.status}`)}</Badge>
                  </Group>
                  <Text size="xs" c="dimmed">{fmtDateTime(e.clientCreatedAt)}</Text>
                  {e.error && e.status !== "PENDING" && (
                    <Text size="xs" c="red">
                      {OWN.includes(e.error) ? t(`outbox.err.${e.error}`, (e.details ?? {}) as Record<string, string | number>) : ruleMessage(t, new ApiError(e.error, e.details as Record<string, unknown> | undefined))}
                    </Text>
                  )}
                  {(e.status === "CONFLICT" || e.status === "REJECTED") && (
                    <Button size="compact-xs" variant="subtle" color="gray" onClick={() => o.dismiss(e.clientOpId)}>{t("outbox.dismiss")}</Button>
                  )}
                </div>
              ))}
              {!o.entries.length && <Text size="sm" c="dimmed">{t("outbox.empty")}</Text>}
            </Stack>
          </ScrollArea.Autosize>
          <Button size="xs" onClick={() => o.flush()} loading={o.syncing} disabled={!o.online || !o.pending} data-testid="outbox-sync">{t("outbox.syncNow", { n: o.pending })}</Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
