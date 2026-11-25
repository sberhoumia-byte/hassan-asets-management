import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, Loader, Modal, SegmentedControl, Select, Stack, Table, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArchive, IconArchiveOff, IconEdit, IconEye, IconPlus } from "@tabler/icons-react";
import { facilitySchema, type FacilityInput } from "@hassan/validation";
import { api, type Facility } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { usePlaces, withCurrent } from "../../hooks/usePlaces";
import { fieldError, handleFormError, notifyError } from "../../lib/forms";
import { SpaceStatusBadge, SpaceStatusField } from "./common";
import { Section } from "./SpacesPage";
import { STATUS_COLOR } from "../assets/AssetsPage";

/** الملاعب والمرافق الرياضية (المادة 8): حالة الأرضية والشباك/المرمى، وتجهيزاتها هي الممتلكات المرتبطة بها. */
export function FacilitiesPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.spaces) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("facilities.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <FacilitiesScreen schoolId={activeSchool.id} />;
}

function FacilitiesScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const [archived, setArchived] = useState("active");
  const [edit, setEdit] = useState<null | { x?: Facility }>(null);
  const [view, setView] = useState<Facility | null>(null);
  const list = useQuery({ queryKey: ["facilities", schoolId, archived === "archived"], queryFn: () => api.spaces!.facilities(schoolId, archived === "archived") });
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["facilities", schoolId] }), qc.invalidateQueries({ queryKey: ["rooms", schoolId] })]);

  const toggle = (x: Facility) =>
    modals.openConfirmModal({
      title: t(x.archivedAt ? "spaces.restore" : "spaces.archive"),
      children: <Text size="sm">{t(x.archivedAt ? "spaces.restoreBody" : "spaces.archiveBody", { name: x.name })}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      confirmProps: { "data-testid": "confirm-archive" } as Record<`data-${string}`, string>,
      onConfirm: async () => {
        try {
          await api.spaces!.setFacilityArchived(schoolId, x.id, !x.archivedAt);
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
            <Title order={4}>{t("nav.facilities")}</Title>
            <Text size="sm" c="dimmed">{t("facilities.intro")}</Text>
          </div>
          {can("facilities.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-facility">
              {t("facilities.add")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <SegmentedControl mb="md" value={archived} onChange={setArchived} data={[{ value: "active", label: t("spaces.activeList") }, { value: "archived", label: t("spaces.archivedList") }]} />
        <Table.ScrollContainer minWidth={900}>
          <Table striped verticalSpacing="sm" data-testid="facilities-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("spaces.code")}</Table.Th>
                <Table.Th>{t("spaces.name")}</Table.Th>
                <Table.Th>{t("facilities.type")}</Table.Th>
                <Table.Th>{t("facilities.surface")}</Table.Th>
                <Table.Th>{t("facilities.nets")}</Table.Th>
                <Table.Th>{t("spaces.status")}</Table.Th>
                <Table.Th>{t("facilities.equipment")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((x) => (
                <Table.Tr key={x.id} data-testid={`facility-row-${x.code}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{x.code}</Table.Td>
                  <Table.Td fw={600}>
                    {x.name}
                    {x.room && <Text size="xs" c="dimmed">{x.room}</Text>}
                  </Table.Td>
                  <Table.Td>{cat.lookupLabel(x.facilityTypeId) || "—"}</Table.Td>
                  <Table.Td>{x.surfaceCondition ?? "—"}</Table.Td>
                  <Table.Td>{x.netsGoalsCondition ?? "—"}</Table.Td>
                  <Table.Td><SpaceStatusBadge status={x.status} /></Table.Td>
                  <Table.Td>{x.equipment > 0 ? <Badge variant="light">{t("spaces.nAssets", { n: x.equipment })}</Badge> : "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <Tooltip label={t("facilities.equipment")}>
                        <ActionIcon variant="subtle" aria-label={t("facilities.equipment")} onClick={() => setView(x)} data-testid={`view-${x.code}`}>
                          <IconEye size={16} />
                        </ActionIcon>
                      </Tooltip>
                      {can("facilities.update") && !x.archivedAt && (
                        <Tooltip label={t("common.edit")}>
                          <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ x })} data-testid={`edit-${x.code}`}>
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {can("facilities.archive") && (
                        <Tooltip label={t(x.archivedAt ? "spaces.restore" : "spaces.archive")}>
                          <ActionIcon variant="subtle" color={x.archivedAt ? "green" : "red"} aria-label={t(x.archivedAt ? "spaces.restore" : "spaces.archive")} onClick={() => toggle(x)} data-testid={`archive-${x.code}`}>
                            {x.archivedAt ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
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
        {list.isLoading && <Loader size="sm" />}
        {list.data?.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("facilities.empty")}</Text>}
      </Card>
      {edit && <FacilityFormModal schoolId={schoolId} facility={edit.x} onClose={() => setEdit(null)} onSaved={reload} />}
      {view && <EquipmentModal schoolId={schoolId} facility={view} onClose={() => setView(null)} />}
    </>
  );
}

function EquipmentModal({ schoolId, facility, onClose }: { schoolId: string; facility: Facility; onClose: () => void }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["facility-equipment", schoolId, facility.id], queryFn: () => api.spaces!.facilityEquipment(schoolId, facility.id) });
  return (
    <Modal opened onClose={onClose} title={`${facility.code} — ${facility.name}`} size="lg" centered>
      {q.isLoading && <Loader size="sm" />}
      {q.data?.length === 0 && <Text c="dimmed">{t("facilities.noEquipment")}</Text>}
      {!!q.data?.length && (
        <Section title={t("facilities.equipment")}>
          {q.data.map((a) => (
            <Table.Tr key={a.id}>
              <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{a.inventoryNumber}</Table.Td>
              <Table.Td>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ""}</Table.Td>
              <Table.Td><Badge size="sm" variant="light" color={STATUS_COLOR[a.status]}>{t(`assetStatus.${a.status}`)}</Badge></Table.Td>
            </Table.Tr>
          ))}
        </Section>
      )}
      <Text size="xs" c="dimmed" mt="sm">{t("facilities.equipmentHint")}</Text>
    </Modal>
  );
}

function FacilityFormModal({ schoolId, facility, onClose, onSaved }: { schoolId: string; facility?: Facility; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const places = usePlaces();
  const f = useForm<FacilityInput>({
    resolver: zodResolver(facilitySchema),
    defaultValues: {
      code: facility?.code ?? "",
      name: facility?.name ?? "",
      facilityTypeId: facility?.facilityTypeId ?? "",
      roomId: facility?.roomId ?? "",
      surfaceCondition: facility?.surfaceCondition ?? "",
      netsGoalsCondition: facility?.netsGoalsCondition ?? "",
      status: facility?.status ?? "GOOD",
      notes: facility?.notes ?? "",
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (facility) await api.spaces!.updateFacility(schoolId, facility.id, v);
      else await api.spaces!.createFacility(schoolId, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={facility ? t("facilities.edit") : t("facilities.add")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="facility-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label={t("spaces.code")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={t("spaces.name")} required {...f.register("name")} error={err("name")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="facilityTypeId"
                render={({ field }) => (
                  <Select label={t("facilities.type")} required data={withCurrent(cat.lookupOptions("FACILITY_TYPE"), facility?.facilityTypeId, cat.lookupLabel(facility?.facilityTypeId))} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("facilityTypeId")} data-testid="facility-type" />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="roomId"
                render={({ field }) => (
                  <Select label={t("facilities.room")} description={t("facilities.roomHint")} clearable searchable data={withCurrent(places.roomOptions, facility?.roomId, facility?.room)} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("roomId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("facilities.surface")} {...f.register("surfaceCondition")} error={err("surfaceCondition")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("facilities.nets")} {...f.register("netsGoalsCondition")} error={err("netsGoalsCondition")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <SpaceStatusField control={f.control} name="status" />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea label={t("stock.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="facility-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
