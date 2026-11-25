import { Controller, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue, useWatch } from "react-hook-form";
import { Select, SimpleGrid, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { SchoolInput } from "@hassan/validation";
import { api } from "../api";
import { useI18n } from "../i18n";

export type SchoolFormValues = SchoolInput & { academyId: string; schoolYear?: string };

export const CYCLES = ["primary", "middle", "secondary", "other"] as const;

/**
 * حقول المؤسسة مع الاختيار المترابط: الأكاديمية ← المديرية.
 * تغيير الأكاديمية يفرغ المديرية ويعرض فقط المديريات التابعة لها.
 */
export function SchoolFormFields({
  control,
  register,
  errors,
  setValue,
  yearOptions,
}: {
  control: Control<SchoolFormValues>;
  register: UseFormRegister<SchoolFormValues>;
  errors: FieldErrors<SchoolFormValues>;
  setValue: UseFormSetValue<SchoolFormValues>;
  yearOptions?: string[];
}) {
  const { t, pick } = useI18n();
  const academyId = useWatch({ control, name: "academyId" });
  const academies = useQuery({ queryKey: ["academies"], queryFn: () => api.listAcademies() });
  const directorates = useQuery({
    queryKey: ["directorates", academyId],
    queryFn: () => api.listDirectorates(academyId),
    enabled: !!academyId,
  });
  const err = (k: keyof SchoolFormValues) => (errors[k]?.message ? t(String(errors[k]!.message)) : undefined);

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      <Controller
        control={control}
        name="academyId"
        render={({ field }) => (
          <Select
            label={t("hierarchy.academy")}
            data={(academies.data ?? []).map((a) => ({ value: a.id, label: pick(a) }))}
            value={field.value || null}
            onChange={(v) => {
              field.onChange(v ?? "");
              setValue("directorateId", "", { shouldValidate: false });
            }}
            error={err("academyId")}
            allowDeselect={false}
            data-testid="field-academy"
          />
        )}
      />
      <Controller
        control={control}
        name="directorateId"
        render={({ field }) => (
          <Select
            label={t("hierarchy.directorate")}
            placeholder={academyId ? undefined : t("hierarchy.pickAcademyFirst")}
            disabled={!academyId}
            data={(directorates.data ?? []).map((d) => ({ value: d.id, label: pick(d) }))}
            value={field.value || null}
            onChange={(v) => field.onChange(v ?? "")}
            error={err("directorateId")}
            allowDeselect={false}
            data-testid="field-directorate"
          />
        )}
      />
      <TextInput label={t("school.nameAr")} {...register("nameAr")} error={err("nameAr")} />
      <TextInput label={t("school.nameFr")} dir="ltr" {...register("nameFr")} error={err("nameFr")} />
      <TextInput label={t("school.adminCode")} dir="ltr" {...register("adminCode")} error={err("adminCode")} />
      <Controller
        control={control}
        name="cycle"
        render={({ field }) => (
          <Select
            label={t("school.cycle")}
            searchable={false}
            data={CYCLES.map((c) => ({ value: t(`school.cycles.${c}`), label: t(`school.cycles.${c}`) }))}
            value={field.value || null}
            onChange={(v) => field.onChange(v ?? "")}
            clearable
          />
        )}
      />
      <TextInput label={t("school.address")} {...register("address")} error={err("address")} />
      <TextInput label={t("school.phone")} dir="ltr" {...register("phone")} error={err("phone")} />
      <TextInput label={t("school.email")} dir="ltr" type="email" {...register("email")} error={err("email")} />
      {yearOptions && (
        <Controller
          control={control}
          name="schoolYear"
          render={({ field }) => (
            <Select
              label={t("school.schoolYear")}
              searchable={false}
              data={yearOptions}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? "")}
              data-testid="field-year"
            />
          )}
        />
      )}
    </SimpleGrid>
  );
}
