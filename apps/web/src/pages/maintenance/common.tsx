import { useState } from "react";
import { Badge, Group, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, type MaintenanceStatus, type TargetType } from "../../api";
import { useI18n } from "../../i18n";
import { usePlaces } from "../../hooks/usePlaces";
import { AssetPicker } from "../../components/AssetPicker";

export const STATUS_COLOR: Record<MaintenanceStatus, string> = {
  NEW: "blue",
  UNDER_REVIEW: "cyan",
  IN_REPAIR: "orange",
  REPAIRED: "green",
  UNREPAIRABLE: "red",
  CLOSED: "gray",
};
export const URGENCY_COLOR: Record<string, string> = { LOW: "gray", NORMAL: "blue", HIGH: "orange", CRITICAL: "red" };

export function MaintenanceStatusBadge({ status }: { status: MaintenanceStatus }) {
  const { t } = useI18n();
  return (
    <Badge color={STATUS_COLOR[status]} variant="light" data-testid="mnt-status">
      {t(`mntStatus.${status}`)}
    </Badge>
  );
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  const { t } = useI18n();
  return (
    <Badge color={URGENCY_COLOR[urgency]} variant={urgency === "CRITICAL" ? "filled" : "outline"} size="sm">
      {t(`urgency.${urgency}`)}
    </Badge>
  );
}

/**
 * اختيار هدف الصيانة: ممتلك (بحث)، فضاء، ملعب، أو وحدة وسيلة تعليمية (الوسيلة ثم الوحدة).
 * القيم من الخادم فقط؛ لا أهداف افتراضية.
 */
export function TargetFields({
  schoolId,
  type,
  id,
  onType,
  onId,
  error,
  disabled,
}: {
  schoolId: string;
  type: TargetType;
  id: string;
  onType: (t: TargetType) => void;
  onId: (id: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const places = usePlaces();
  const [resourceId, setResourceId] = useState<string | null>(null);
  const resources = useQuery({ queryKey: ["resources", schoolId, {}], queryFn: () => api.resources!.list(schoolId), enabled: type === "resourceUnit" });
  const detail = useQuery({ queryKey: ["resource", schoolId, resourceId], queryFn: () => api.resources!.get(schoolId, resourceId!), enabled: type === "resourceUnit" && !!resourceId });
  return (
    <Stack gap="xs">
      <div>
        <Text size="sm" fw={500} mb={4}>
          {t("mnt.target")} <span style={{ color: "var(--mantine-color-red-6)" }}>*</span>
        </Text>
        <SegmentedControl
          fullWidth
          disabled={disabled}
          value={type}
          onChange={(v) => {
            onType(v as TargetType);
            onId("");
          }}
          data={(["asset", "room", "facility", "resourceUnit"] as const).map((k) => ({ value: k, label: t(`mntTarget.${k}`) }))}
          data-testid="mnt-target-type"
        />
      </div>
      {type === "asset" && <AssetPicker schoolId={schoolId} value={id} onChange={(x) => onId(x)} label={t("mntTarget.asset")} required error={error} testId="mnt-target-asset" />}
      {type === "room" && <Select label={t("mntTarget.room")} required searchable data={places.roomOptions} value={id || null} onChange={(x) => onId(x ?? "")} error={error} data-testid="mnt-target-room" />}
      {type === "facility" && <Select label={t("mntTarget.facility")} required searchable data={places.facilityOptions} value={id || null} onChange={(x) => onId(x ?? "")} error={error} data-testid="mnt-target-facility" />}
      {type === "resourceUnit" && (
        <Group grow align="flex-start">
          <Select
            label={t("loans.resource")}
            searchable
            data={(resources.data ?? []).filter((r) => r.trackingMode === "INDIVIDUAL").map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }))}
            value={resourceId}
            onChange={(x) => {
              setResourceId(x);
              onId("");
            }}
          />
          <Select
            label={t("loans.unit")}
            required
            searchable
            data={(detail.data?.units ?? []).map((u) => ({ value: u.id, label: u.inventoryNumber }))}
            value={id || null}
            onChange={(x) => onId(x ?? "")}
            error={error}
            data-testid="mnt-target-unit"
          />
        </Group>
      )}
    </Stack>
  );
}
