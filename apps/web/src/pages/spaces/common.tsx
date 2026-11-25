import { Badge, NumberInput, Select } from "@mantine/core";
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { SPACE_STATUSES } from "@hassan/validation";
import type { SpaceStatus } from "../../api";
import { useI18n } from "../../i18n";

export const SPACE_COLOR: Record<SpaceStatus, string> = { GOOD: "green", NEEDS_MAINTENANCE: "orange", OUT_OF_SERVICE: "red" };

export function SpaceStatusBadge({ status }: { status: SpaceStatus }) {
  const { t } = useI18n();
  return (
    <Badge variant="light" color={SPACE_COLOR[status]}>
      {t(`spaceStatus.${status}`)}
    </Badge>
  );
}

/** حقل رقمي اختياري (فارغ = null) مربوط بالنموذج. */
export function NumField<F extends FieldValues>({ control, name, label, error, min = 0, decimals = 0, suffix }: { control: Control<F>; name: Path<F>; label: string; error?: string; min?: number; decimals?: number; suffix?: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <NumberInput
          label={label}
          min={min}
          decimalScale={decimals}
          allowDecimal={decimals > 0}
          rightSection={suffix}
          value={field.value ?? ""}
          onChange={(x) => field.onChange(x === "" ? null : Number(x))}
          error={error}
        />
      )}
    />
  );
}

export function SpaceStatusField<F extends FieldValues>({ control, name }: { control: Control<F>; name: Path<F> }) {
  const { t } = useI18n();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select label={t("spaces.status")} data={SPACE_STATUSES.map((s) => ({ value: s, label: t(`spaceStatus.${s}`) }))} value={field.value} onChange={(x) => x && field.onChange(x)} allowDeselect={false} />
      )}
    />
  );
}
