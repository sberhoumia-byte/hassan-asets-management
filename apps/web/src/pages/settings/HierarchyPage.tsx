import { useEffect, useState } from "react";
import { ActionIcon, Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useDebouncedValue } from "@mantine/hooks";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { IconEdit, IconFileImport, IconPlus, IconSearch } from "@tabler/icons-react";
import { academySchema, directorateSchema, schoolSchema, type AcademyInput, type DirectorateInput } from "@hassan/validation";
import { api, ApiError, type School } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { SchoolFormFields, type SchoolFormValues } from "../../components/SchoolFormFields";

const schoolFormSchema = schoolSchema.extend({ academyId: z.string().min(1, "errors.required") });

export function HierarchyPage() {
  const { t, pick } = useI18n();
  const { activeSchool, setActiveSchoolId } = useAuth();
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [directorateId, setDirectorateId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 200);
  const [modal, setModal] = useState<null | "academy" | "directorate" | { school: School | null }>(null);

  const academies = useQuery({ queryKey: ["academies"], queryFn: () => api.listAcademies() });
  const allDirs = useQuery({ queryKey: ["directorates", "all"], queryFn: () => api.listDirectorates() });
  const directorates = useQuery({
    queryKey: ["directorates", academyId],
    queryFn: () => api.listDirectorates(academyId!),
    enabled: !!academyId,
  });
  const schools = useQuery({
    queryKey: ["schools", directorateId, dq],
    queryFn: () => api.listSchools({ directorateId: directorateId!, q: dq }),
    enabled: !!directorateId,
  });

  // الاختيار الأولي: تسلسل المؤسسة النشطة
  useEffect(() => {
    if (academyId || !activeSchool || !allDirs.data) return;
    const d = allDirs.data.find((x) => x.id === activeSchool.directorateId);
    if (d) {
      setAcademyId(d.academyId);
      setDirectorateId(d.id);
    }
  }, [activeSchool, allDirs.data, academyId]);

  return (
    <>
      <Card>
        <Group justify="space-between" mb="md">
          <div>
            <Title order={4}>{t("settings.hierarchy")}</Title>
            <Text size="sm" c="dimmed">{t("hierarchy.intro")}</Text>
          </div>
          <Group gap="xs">
            <Tooltip label={t("nav.comingInPhase", { phase: 7 })}>
              <span>
                <Button variant="default" leftSection={<IconFileImport size={16} />} disabled>
                  {t("hierarchy.importExcel")}
                </Button>
              </span>
            </Tooltip>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModal("academy")}>{t("hierarchy.addAcademy")}</Button>
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModal("directorate")}>{t("hierarchy.addDirectorate")}</Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ school: null })} data-testid="add-school">{t("hierarchy.addSchool")}</Button>
          </Group>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <Select
            label={`1. ${t("hierarchy.academy")}`}
            data={(academies.data ?? []).map((a) => ({ value: a.id, label: pick(a) }))}
            value={academyId}
            onChange={(v) => {
              setAcademyId(v);
              setDirectorateId(null);
            }}
            data-testid="pick-academy"
          />
          <Select
            label={`2. ${t("hierarchy.directorate")}`}
            placeholder={academyId ? undefined : t("hierarchy.pickAcademyFirst")}
            disabled={!academyId}
            data={(directorates.data ?? []).map((d) => ({ value: d.id, label: pick(d) }))}
            value={directorateId}
            onChange={setDirectorateId}
            data-testid="pick-directorate"
          />
          <TextInput
            label={`3. ${t("hierarchy.searchSchool")}`}
            placeholder={t("hierarchy.searchPlaceholder")}
            leftSection={<IconSearch size={16} />}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            disabled={!directorateId}
            data-testid="search-school"
          />
        </SimpleGrid>
      </Card>

      <Card>
        <Title order={5} mb="sm">{t("hierarchy.schoolsInDirectorate")}</Title>
        {!directorateId ? (
          <Text size="sm" c="dimmed">{t("hierarchy.pickDirectorate")}</Text>
        ) : (schools.data ?? []).length === 0 ? (
          <Text size="sm" c="dimmed">{t("hierarchy.noSchools")}</Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table striped highlightOnHover verticalSpacing="sm" data-testid="schools-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("school.name")}</Table.Th>
                  <Table.Th>{t("school.adminCode")}</Table.Th>
                  <Table.Th>{t("school.cycle")}</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {schools.data!.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      {pick(s)}{" "}
                      {s.id === activeSchool?.id && <Badge size="xs" variant="light">{t("hierarchy.active")}</Badge>}
                    </Table.Td>
                    <Table.Td dir="ltr" style={{ textAlign: "start" }}>{s.adminCode ?? "—"}</Table.Td>
                    <Table.Td>{s.cycle ?? "—"}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        {s.id !== activeSchool?.id && (
                          <Button size="compact-xs" variant="subtle" onClick={() => setActiveSchoolId(s.id)}>{t("hierarchy.makeActive")}</Button>
                        )}
                        <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setModal({ school: s })}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <AcademyModal opened={modal === "academy"} onClose={() => setModal(null)} onCreated={(id) => { setAcademyId(id); setDirectorateId(null); }} />
      <DirectorateModal opened={modal === "directorate"} onClose={() => setModal(null)} defaultAcademyId={academyId} onCreated={(d) => { setAcademyId(d.academyId); setDirectorateId(d.id); }} />
      {typeof modal === "object" && modal !== null && (
        <SchoolModal school={modal.school} defaultAcademyId={academyId} defaultDirectorateId={directorateId} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function AcademyModal({ opened, onClose, onCreated }: { opened: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const f = useForm<AcademyInput>({ resolver: zodResolver(academySchema) });
  const err = (k: keyof AcademyInput) => (f.formState.errors[k]?.message ? t(f.formState.errors[k]!.message!) : undefined);
  const submit = f.handleSubmit(async (v) => {
    try {
      const a = await api.createAcademy(v);
      await qc.invalidateQueries({ queryKey: ["academies"] });
      notifications.show({ color: "green", message: t("common.saved") });
      f.reset();
      onCreated(a.id);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_NAME") f.setError("nameAr", { message: "errors.duplicateName" });
    }
  });
  return (
    <Modal opened={opened} onClose={onClose} title={t("hierarchy.addAcademy")} centered>
      <form onSubmit={submit} noValidate>
        <Stack>
          <TextInput label={t("hierarchy.nameAr")} {...f.register("nameAr")} error={err("nameAr")} />
          <TextInput label={t("hierarchy.nameFr")} dir="ltr" {...f.register("nameFr")} error={err("nameFr")} />
          <TextInput label={t("hierarchy.code")} dir="ltr" {...f.register("code")} error={err("code")} />
          <Button type="submit" loading={f.formState.isSubmitting}>{t("common.save")}</Button>
        </Stack>
      </form>
    </Modal>
  );
}

function DirectorateModal({
  opened,
  onClose,
  defaultAcademyId,
  onCreated,
}: {
  opened: boolean;
  onClose: () => void;
  defaultAcademyId: string | null;
  onCreated: (d: { id: string; academyId: string }) => void;
}) {
  const { t, pick } = useI18n();
  const qc = useQueryClient();
  const academies = useQuery({ queryKey: ["academies"], queryFn: () => api.listAcademies() });
  const f = useForm<DirectorateInput>({ resolver: zodResolver(directorateSchema) });
  useEffect(() => {
    if (opened) f.reset({ academyId: defaultAcademyId ?? "", nameAr: "", nameFr: "", code: "" });
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = (k: keyof DirectorateInput) => (f.formState.errors[k]?.message ? t(f.formState.errors[k]!.message!) : undefined);
  const submit = f.handleSubmit(async (v) => {
    try {
      const d = await api.createDirectorate(v);
      await qc.invalidateQueries({ queryKey: ["directorates"] });
      notifications.show({ color: "green", message: t("common.saved") });
      onCreated(d);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_NAME") f.setError("nameAr", { message: "errors.duplicateName" });
    }
  });
  return (
    <Modal opened={opened} onClose={onClose} title={t("hierarchy.addDirectorate")} centered>
      <form onSubmit={submit} noValidate>
        <Stack>
          <Select
            label={t("hierarchy.academy")}
            data={(academies.data ?? []).map((a) => ({ value: a.id, label: pick(a) }))}
            value={f.watch("academyId") || null}
            onChange={(v) => f.setValue("academyId", v ?? "", { shouldValidate: true })}
            error={err("academyId")}
          />
          <TextInput label={t("hierarchy.nameAr")} {...f.register("nameAr")} error={err("nameAr")} />
          <TextInput label={t("hierarchy.nameFr")} dir="ltr" {...f.register("nameFr")} error={err("nameFr")} />
          <TextInput label={t("hierarchy.code")} dir="ltr" {...f.register("code")} error={err("code")} />
          <Button type="submit" loading={f.formState.isSubmitting}>{t("common.save")}</Button>
        </Stack>
      </form>
    </Modal>
  );
}

function SchoolModal({
  school,
  defaultAcademyId,
  defaultDirectorateId,
  onClose,
}: {
  school: School | null;
  defaultAcademyId: string | null;
  defaultDirectorateId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const allDirs = useQuery({ queryKey: ["directorates", "all"], queryFn: () => api.listDirectorates() });
  const f = useForm<SchoolFormValues>({ resolver: zodResolver(schoolFormSchema) });

  useEffect(() => {
    if (school && !allDirs.data) return;
    const academyId = school ? allDirs.data!.find((d) => d.id === school.directorateId)?.academyId ?? "" : defaultAcademyId ?? "";
    f.reset({
      academyId,
      directorateId: school?.directorateId ?? defaultDirectorateId ?? "",
      nameAr: school?.nameAr ?? "",
      nameFr: school?.nameFr ?? "",
      adminCode: school?.adminCode ?? "",
      cycle: school?.cycle ?? "",
      address: school?.address ?? "",
      phone: school?.phone ?? "",
      email: school?.email ?? "",
    });
  }, [school, allDirs.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = f.handleSubmit(async ({ academyId: _a, ...v }) => {
    try {
      if (school) await api.updateSchool(school.id, { ...v, schoolYear: school.schoolYear });
      else await api.createSchool(v);
      await qc.invalidateQueries();
      notifications.show({ color: "green", message: t("common.saved") });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_ADMIN_CODE") f.setError("adminCode", { message: "errors.duplicateCode" });
      else notifications.show({ color: "red", message: t("errors.unexpected") });
    }
  });

  return (
    <Modal opened onClose={onClose} title={school ? t("hierarchy.editSchool") : t("hierarchy.addSchool")} size="xl" centered>
      <form onSubmit={submit} noValidate>
        <SchoolFormFields control={f.control} register={f.register} errors={f.formState.errors} setValue={f.setValue} />
        <Group mt="lg">
          <Button type="submit" loading={f.formState.isSubmitting} data-testid="school-modal-save">{t("common.save")}</Button>
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
        </Group>
      </form>
    </Modal>
  );
}
