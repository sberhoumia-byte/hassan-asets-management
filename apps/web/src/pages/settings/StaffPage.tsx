import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Checkbox, Grid, Group, Modal, Select, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconEdit, IconPlus, IconSearch } from "@tabler/icons-react";
import { staffSchema, STAFF_TYPES, type StaffInput } from "@hassan/validation";
import { api, type Staff } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { fieldError, handleFormError } from "../../lib/forms";

/** يملك إدارة الموظفين من يملك إحدى هذه الصلاحيات (نفس قائمة الخادم). */
const STAFF_MANAGERS = ["loans.create", "custody.create", "assets.update", "users.manage", "settings.manage"];

/**
 * الموظفون والأساتذة (المستعيرون والمسؤولون عن الممتلكات). ليسوا حسابات دخول.
 * لا حذف: يُعطَّل الموظف فيختفي من قوائم الاختيار ويبقى في السجلات.
 */
export function StaffPage() {
  const { t } = useI18n();
  const { activeSchool } = useAuth();
  if (!api.staff) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;
  if (!activeSchool) return <Alert color="red" mt="md">{t("errors.forbidden")}</Alert>;
  return <StaffScreen schoolId={activeSchool.id} />;
}

function StaffScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const manage = STAFF_MANAGERS.some(can);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [edit, setEdit] = useState<null | { s?: Staff }>(null);
  const list = useQuery({ queryKey: ["staff", schoolId, true, dq], queryFn: () => api.staff!.list(schoolId, { q: dq, all: true }) });
  const reload = () => qc.invalidateQueries({ queryKey: ["staff", schoolId] });
  return (
    <Card mt="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={4}>{t("settings.staff")}</Title>
          <Text size="sm" c="dimmed">{t("staff.intro")}</Text>
        </div>
        {manage && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-staff">
            {t("staff.add")}
          </Button>
        )}
      </Group>
      <TextInput mb="md" leftSection={<IconSearch size={16} />} placeholder={t("staff.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
      <Table.ScrollContainer minWidth={760}>
        <Table striped verticalSpacing="sm" data-testid="staff-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("staff.name")}</Table.Th>
              <Table.Th>{t("staff.type")}</Table.Th>
              <Table.Th>{t("staff.number")}</Table.Th>
              <Table.Th>{t("school.phone")}</Table.Th>
              <Table.Th>{t("staff.usage")}</Table.Th>
              <Table.Th>{t("assets.status")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(list.data ?? []).map((s) => (
              <Table.Tr key={s.id} data-testid={`staff-row-${s.fullNameAr}`}>
                <Table.Td fw={600}>
                  {s.fullNameAr}
                  {s.fullNameFr && <Text size="xs" c="dimmed" dir="ltr" style={{ textAlign: "start" }}>{s.fullNameFr}</Text>}
                </Table.Td>
                <Table.Td>{t(`staffType.${s.type}`)}</Table.Td>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{s.staffNumber ?? "—"}</Table.Td>
                <Table.Td dir="ltr" style={{ textAlign: "start" }}>{s.phone ?? "—"}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {s.activeLoans > 0 && <Badge size="sm" variant="light">{t("staff.nLoans", { n: s.activeLoans })}</Badge>}
                    {s.assets > 0 && <Badge size="sm" variant="light" color="teal">{t("staff.nAssets", { n: s.assets })}</Badge>}
                    {!s.activeLoans && !s.assets && "—"}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={s.isActive ? "green" : "gray"}>{t(s.isActive ? "common.active" : "common.inactive")}</Badge>
                </Table.Td>
                <Table.Td>
                  {manage && (
                    <Tooltip label={t("common.edit")}>
                      <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ s })} data-testid={`edit-staff-${s.fullNameAr}`}>
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {list.data?.length === 0 && <Text c="dimmed" ta="center" py="lg">{dq ? t("common.noResults") : t("staff.empty")}</Text>}
      {edit && <StaffFormModal schoolId={schoolId} staff={edit.s} onClose={() => setEdit(null)} onSaved={reload} />}
    </Card>
  );
}

function StaffFormModal({ schoolId, staff, onClose, onSaved }: { schoolId: string; staff?: Staff; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const f = useForm<StaffInput>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      fullNameAr: staff?.fullNameAr ?? "",
      fullNameFr: staff?.fullNameFr ?? "",
      type: staff?.type ?? "TEACHER",
      staffNumber: staff?.staffNumber ?? "",
      phone: staff?.phone ?? "",
      email: staff?.email ?? "",
      isActive: staff?.isActive ?? true,
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (staff) await api.staff!.update(schoolId, staff.id, v);
      else await api.staff!.create(schoolId, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_STAFF_NUMBER: "staffNumber" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={staff ? t("staff.edit") : t("staff.add")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="staff-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("staff.nameAr")} required {...f.register("fullNameAr")} error={err("fullNameAr")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("staff.nameFr")} dir="ltr" {...f.register("fullNameFr")} error={err("fullNameFr")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="type"
                render={({ field }) => (
                  <Select label={t("staff.type")} data={STAFF_TYPES.map((s) => ({ value: s, label: t(`staffType.${s}`) }))} value={field.value} onChange={(x) => x && field.onChange(x)} allowDeselect={false} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("staff.number")} description={t("staff.numberHint")} dir="ltr" {...f.register("staffNumber")} error={err("staffNumber")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("school.phone")} dir="ltr" {...f.register("phone")} error={err("phone")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("school.email")} dir="ltr" {...f.register("email")} error={err("email")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Controller
                control={f.control}
                name="isActive"
                render={({ field }) => <Checkbox label={t("staff.isActive")} description={t("staff.isActiveHint")} checked={!!field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
              />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="staff-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
