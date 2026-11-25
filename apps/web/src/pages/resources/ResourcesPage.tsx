import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Alert, Badge, Button, Card, Checkbox, Grid, Group, Loader, Modal, NumberInput, SegmentedControl, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { resourceSchema, type ResourceInput } from "@hassan/validation";
import { api, type ResourceDetail, type UnitStatus } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { usePlaces, withCurrent } from "../../hooks/usePlaces";
import { fieldError, handleFormError } from "../../lib/forms";
import { PhotoField } from "../../components/PhotoField";
import { ResourceDetailModal } from "./ResourceDetailModal";

export const UNIT_COLOR: Record<UnitStatus, string> = { AVAILABLE: "green", ON_LOAN: "blue", DAMAGED: "red", UNDER_MAINTENANCE: "orange", DISPOSED: "gray" };

/** الوسائل التعليمية (المادة 9): أصناف فردية بوحدات مرقمة ورمز QR لكل وحدة، أو أصناف كمية. */
export function ResourcesPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.resources) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("resources.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <ResourcesScreen schoolId={activeSchool.id} />;
}

function ResourcesScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { id: openId } = useParams();
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [archived, setArchived] = useState("active");
  const [edit, setEdit] = useState<null | { r?: ResourceDetail }>(null);
  const filters = { q: dq, resourceTypeId: typeId ?? undefined, archived: archived === "archived" };
  const list = useQuery({ queryKey: ["resources", schoolId, filters], queryFn: () => api.resources!.list(schoolId, filters) });
  const reload = () => qc.invalidateQueries({ queryKey: ["resources", schoolId] });

  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.resources")}</Title>
            <Text size="sm" c="dimmed">{t("resources.intro")}</Text>
          </div>
          {can("resources.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-resource">
              {t("resources.add")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Group gap="sm" mb="md">
          <TextInput className="min-w-[220px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("resources.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
          <Select w={200} placeholder={t("resources.type")} clearable data={cat.lookupOptions("RESOURCE_TYPE")} value={typeId} onChange={setTypeId} aria-label={t("resources.type")} />
          <SegmentedControl value={archived} onChange={setArchived} data={[{ value: "active", label: t("spaces.activeList") }, { value: "archived", label: t("spaces.archivedList") }]} />
        </Group>
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover verticalSpacing="sm" data-testid="resources-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("spaces.code")}</Table.Th>
                <Table.Th>{t("spaces.name")}</Table.Th>
                <Table.Th>{t("resources.type")}</Table.Th>
                <Table.Th>{t("assets.trackingMode")}</Table.Th>
                <Table.Th>{t("resources.total")}</Table.Th>
                <Table.Th>{t("resources.available")}</Table.Th>
                <Table.Th>{t("resources.onLoan")}</Table.Th>
                <Table.Th>{t("resources.damaged")}</Table.Th>
                <Table.Th>{t("assets.room")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((r) => (
                <Table.Tr key={r.id} className="cursor-pointer" onClick={() => nav(`/resources/${r.id}`)} data-testid={`resource-row-${r.code}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{r.code}</Table.Td>
                  <Table.Td fw={600}>
                    {r.name}
                    {!r.isLendable && <Badge ms={6} size="xs" color="gray" variant="light">{t("resources.notLendable")}</Badge>}
                  </Table.Td>
                  <Table.Td>{cat.lookupLabel(r.resourceTypeId) || "—"}</Table.Td>
                  <Table.Td>{t(`resources.mode.${r.trackingMode}`)}</Table.Td>
                  <Table.Td>{r.total}</Table.Td>
                  <Table.Td><Badge variant="light" color={r.available > 0 ? "green" : "red"} data-testid="available">{r.available}</Badge></Table.Td>
                  <Table.Td>{r.onLoan || "—"}</Table.Td>
                  <Table.Td>{r.damaged || "—"}{r.maintenance ? ` · ${t("resources.maintenanceN", { n: r.maintenance })}` : ""}</Table.Td>
                  <Table.Td>{r.room ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.isLoading && <Loader size="sm" />}
        {list.data?.length === 0 && <Text c="dimmed" ta="center" py="lg">{dq || typeId ? t("common.noResults") : t("resources.empty")}</Text>}
      </Card>
      {openId && !edit && <ResourceDetailModal schoolId={schoolId} id={openId} onClose={() => nav("/resources")} onEdit={(r) => setEdit({ r })} />}
      {edit && (
        <ResourceFormModal
          schoolId={schoolId}
          resource={edit.r}
          onClose={() => setEdit(null)}
          onSaved={async (id) => {
            await reload();
            await qc.invalidateQueries({ queryKey: ["resource", schoolId, id] });
            setEdit(null);
            nav(`/resources/${id}`);
          }}
        />
      )}
    </>
  );
}

function ResourceFormModal({ schoolId, resource, onClose, onSaved }: { schoolId: string; resource?: ResourceDetail; onClose: () => void; onSaved: (id: string) => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const places = usePlaces();
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const f = useForm<ResourceInput>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      code: resource?.code ?? "",
      name: resource?.name ?? "",
      resourceTypeId: resource?.resourceTypeId ?? "",
      categoryId: resource?.categoryId ?? "",
      trackingMode: resource?.trackingMode ?? "INDIVIDUAL",
      quantityTotal: resource?.trackingMode === "QUANTITY" ? resource.total : 0,
      roomId: resource?.roomId ?? "",
      acquisitionDate: resource?.acquisitionDate ?? "",
      isLendable: resource?.isLendable ?? true,
    },
  });
  const err = fieldError(f, t);
  const mode = f.watch("trackingMode");
  const submit = f.handleSubmit(async (v) => {
    const body: ResourceInput = { ...v, quantityTotal: v.trackingMode === "QUANTITY" ? v.quantityTotal : 0, photoDataUrl: photo };
    try {
      const r = resource ? await api.resources!.update(schoolId, resource.id, body) : await api.resources!.create(schoolId, body);
      await onSaved(r.id);
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code", TRACKING_LOCKED: "trackingMode", QUANTITY_BELOW_USED: "quantityTotal" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={resource ? t("resources.edit") : t("resources.add")} size="xl" centered>
      <form onSubmit={submit} noValidate data-testid="resource-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label={t("spaces.code")} description={t("resources.codeHint")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={t("spaces.name")} required {...f.register("name")} error={err("name")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="resourceTypeId"
                render={({ field }) => (
                  <Select label={t("resources.type")} clearable data={withCurrent(cat.lookupOptions("RESOURCE_TYPE"), resource?.resourceTypeId, cat.lookupLabel(resource?.resourceTypeId))} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("resourceTypeId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="categoryId"
                render={({ field }) => (
                  <Select label={t("assets.category")} clearable searchable data={withCurrent(cat.categoryOptions, resource?.categoryId, cat.categoryLabel(resource?.categoryId))} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("categoryId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="trackingMode"
                render={({ field }) => (
                  <Stack gap={2}>
                    <Text size="sm" fw={500}>{t("assets.trackingMode")}</Text>
                    <SegmentedControl
                      fullWidth
                      value={field.value}
                      onChange={(x) => field.onChange(x)}
                      data={(["INDIVIDUAL", "QUANTITY"] as const).map((m) => ({ value: m, label: t(`resources.mode.${m}`) }))}
                      data-testid="resource-mode"
                    />
                    <Text size="xs" c={err("trackingMode") ? "red" : "dimmed"}>{err("trackingMode") ?? t(`resources.modeHint.${field.value}`)}</Text>
                  </Stack>
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              {mode === "QUANTITY" && (
                <Controller
                  control={f.control}
                  name="quantityTotal"
                  render={({ field }) => (
                    <NumberInput label={t("resources.quantityTotal")} required min={0} allowDecimal={false} value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("quantityTotal")} data-testid="resource-qty" />
                  )}
                />
              )}
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="roomId"
                render={({ field }) => (
                  <Select label={t("resources.storageRoom")} clearable searchable data={withCurrent(places.roomOptions, resource?.roomId, resource?.room)} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("roomId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput type="date" label={t("assets.acquisitionDate")} {...f.register("acquisitionDate")} error={err("acquisitionDate")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Controller
                control={f.control}
                name="isLendable"
                render={({ field }) => <Checkbox label={t("resources.isLendable")} checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <PhotoField current={resource?.photoDataUrl} value={photo} onChange={setPhoto} />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="resource-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
