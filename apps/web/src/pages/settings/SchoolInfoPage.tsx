import { useEffect } from "react";
import { Button, Card, Group, Loader, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { schoolSchema, schoolYearLabel } from "@hassan/validation";
import { api, ApiError } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { SchoolFormFields, type SchoolFormValues } from "../../components/SchoolFormFields";
import { currentSchoolYear, schoolYearOptions } from "../../lib/schoolYear";

const formSchema = schoolSchema.extend({
  academyId: z.string().min(1, "errors.required"),
  schoolYear: schoolYearLabel.optional().or(z.literal("")),
});

export function SchoolInfoPage() {
  const { t } = useI18n();
  const { activeSchool } = useAuth();
  const qc = useQueryClient();
  const sid = activeSchool?.id;
  const school = useQuery({ queryKey: ["school", sid], queryFn: () => api.getSchool(sid!), enabled: !!sid });
  const dirs = useQuery({ queryKey: ["directorates", "all"], queryFn: () => api.listDirectorates() });

  const form = useForm<SchoolFormValues>({ resolver: zodResolver(formSchema) });

  useEffect(() => {
    if (!school.data || !dirs.data) return;
    const s = school.data;
    const academyId = dirs.data.find((d) => d.id === s.directorateId)?.academyId ?? "";
    form.reset({
      academyId,
      directorateId: s.directorateId,
      nameAr: s.nameAr,
      nameFr: s.nameFr ?? "",
      adminCode: s.adminCode ?? "",
      cycle: s.cycle ?? "",
      address: s.address ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      schoolYear: s.schoolYear ?? currentSchoolYear(),
    });
  }, [school.data, dirs.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async ({ academyId: _a, ...v }) => {
    try {
      await api.updateSchool(sid!, v);
      await qc.invalidateQueries();
      notifications.show({ color: "green", message: t("school.saved") });
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_ADMIN_CODE") form.setError("adminCode", { message: "errors.duplicateCode" });
      else notifications.show({ color: "red", message: t("errors.unexpected") });
    }
  });

  if (!school.data) return <Loader />;

  return (
    <Card>
      <Title order={4}>{t("settings.schoolInfo")}</Title>
      <Text size="sm" c="dimmed" mb="md">{t("school.intro")}</Text>
      <form onSubmit={submit} noValidate>
        <SchoolFormFields
          control={form.control}
          register={form.register}
          errors={form.formState.errors}
          setValue={form.setValue}
          yearOptions={schoolYearOptions()}
        />
        <Group mt="lg">
          <Button type="submit" loading={form.formState.isSubmitting} data-testid="school-save">{t("common.save")}</Button>
          <Button variant="default" onClick={() => form.reset()} disabled={!form.formState.isDirty}>{t("common.cancel")}</Button>
        </Group>
      </form>
    </Card>
  );
}
