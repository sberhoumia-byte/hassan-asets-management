import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, Modal, SegmentedControl, Select, Stack, Table, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArchive, IconArchiveOff, IconEdit, IconPlus, IconSearch } from "@tabler/icons-react";
import { supplierSchema, type SupplierInput } from "@hassan/validation";
import { api, type Supplier } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { useCatalog } from "../hooks/useCatalog";
import { fieldError, handleFormError, notifyError } from "../lib/forms";

/** شاشة الموردين (المادة 17): بلا حذف؛ الأرشفة تُبقي المورد مرتبطاً بسجلاته السابقة. */
export function SuppliersPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.suppliers) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("suppliers.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <SuppliersScreen schoolId={activeSchool.id} />;
}

function SuppliersScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [archived, setArchived] = useState("active");
  const [edit, setEdit] = useState<null | { s?: Supplier }>(null);
  const list = useQuery({ queryKey: ["suppliers", schoolId, archived, dq], queryFn: () => api.suppliers!.list(schoolId, { q: dq, archived: archived === "archived" }) });
  const reload = () => qc.invalidateQueries({ queryKey: ["suppliers", schoolId] });

  const toggleArchive = (s: Supplier) =>
    modals.openConfirmModal({
      title: t(s.archivedAt ? "suppliers.restore" : "suppliers.archive"),
      children: <Text size="sm">{t(s.archivedAt ? "suppliers.restoreBody" : "suppliers.archiveBody", { name: s.name })}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      confirmProps: { "data-testid": "confirm-archive" } as Record<`data-${string}`, string>,
      onConfirm: async () => {
        try {
          if (s.archivedAt) await api.suppliers!.restore(schoolId, s.id);
          else await api.suppliers!.archive(schoolId, s.id);
          await reload();
        } catch (e) {
          notifyError(t, e);
        }
      },
    });

  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.suppliers")}</Title>
            <Text size="sm" c="dimmed">{t("suppliers.intro")}</Text>
          </div>
          {can("suppliers.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-supplier">
              {t("suppliers.add")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Group gap="sm" mb="md">
          <TextInput className="min-w-[240px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("suppliers.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
          <SegmentedControl value={archived} onChange={setArchived} data={[{ value: "active", label: t("assets.active") }, { value: "archived", label: t("assets.archived") }]} />
        </Group>
        <Table.ScrollContainer minWidth={820}>
          <Table striped verticalSpacing="sm" data-testid="suppliers-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("suppliers.name")}</Table.Th>
                <Table.Th>{t("suppliers.activity")}</Table.Th>
                <Table.Th>{t("suppliers.contact")}</Table.Th>
                <Table.Th>{t("suppliers.ice")}</Table.Th>
                <Table.Th>{t("suppliers.usage")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((s) => (
                <Table.Tr key={s.id} data-testid={`supplier-row-${s.name}`}>
                  <Table.Td fw={600}>{s.name}</Table.Td>
                  <Table.Td>{cat.lookupLabel(s.activityId) || "—"}</Table.Td>
                  <Table.Td>
                    <Stack gap={0}>
                      {s.phone && <Text size="sm" dir="ltr" style={{ textAlign: "start" }}>{s.phone}</Text>}
                      {s.email && <Text size="xs" c="dimmed" dir="ltr" style={{ textAlign: "start" }}>{s.email}</Text>}
                      {!s.phone && !s.email && "—"}
                    </Stack>
                  </Table.Td>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{s.ice ?? "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {s.usage.assets > 0 && <Badge size="sm" variant="light">{t("suppliers.usedAssets", { n: s.usage.assets })}</Badge>}
                      {s.usage.movements > 0 && <Badge size="sm" variant="light" color="teal">{t("suppliers.usedMovements", { n: s.usage.movements })}</Badge>}
                      {!s.usage.assets && !s.usage.movements && <Text size="xs" c="dimmed">—</Text>}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      {can("suppliers.update") && !s.archivedAt && (
                        <Tooltip label={t("common.edit")}>
                          <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ s })}>
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {can("suppliers.archive") && (
                        <Tooltip label={t(s.archivedAt ? "suppliers.restore" : "suppliers.archive")}>
                          <ActionIcon variant="subtle" color={s.archivedAt ? "green" : "red"} aria-label={t(s.archivedAt ? "suppliers.restore" : "suppliers.archive")} onClick={() => toggleArchive(s)} data-testid={`archive-${s.name}`}>
                            {s.archivedAt ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.data?.length === 0 && <Text c="dimmed" ta="center" py="lg">{dq ? t("common.noResults") : t("suppliers.empty")}</Text>}
      </Card>
      {edit && <SupplierFormModal schoolId={schoolId} supplier={edit.s} onClose={() => setEdit(null)} onSaved={reload} />}
    </>
  );
}

function SupplierFormModal({ schoolId, supplier, onClose, onSaved }: { schoolId: string; supplier?: Supplier; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const f = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: supplier?.name ?? "",
      activityId: supplier?.activityId ?? "",
      phone: supplier?.phone ?? "",
      email: supplier?.email ?? "",
      address: supplier?.address ?? "",
      ice: supplier?.ice ?? "",
      notes: supplier?.notes ?? "",
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (supplier) await api.suppliers!.update(schoolId, supplier.id, v);
      else await api.suppliers!.create(schoolId, v);
      onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_ICE: "ice" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={supplier ? t("suppliers.edit") : t("suppliers.add")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="supplier-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <TextInput label={t("suppliers.name")} required {...f.register("name")} error={err("name")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <Controller
                control={f.control}
                name="activityId"
                render={({ field }) => (
                  <Select label={t("suppliers.activity")} clearable data={cat.lookupOptions("SUPPLIER_ACTIVITY")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("activityId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("school.phone")} dir="ltr" {...f.register("phone")} error={err("phone")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("school.email")} dir="ltr" {...f.register("email")} error={err("email")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("suppliers.ice")} description={t("suppliers.iceHint")} dir="ltr" maxLength={15} {...f.register("ice")} error={err("ice")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("school.address")} {...f.register("address")} error={err("address")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea label={t("stock.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="supplier-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
