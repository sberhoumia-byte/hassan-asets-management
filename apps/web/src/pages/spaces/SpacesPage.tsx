import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, Loader, Modal, SegmentedControl, Select, Stack, Table, Tabs, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArchive, IconArchiveOff, IconEdit, IconEye, IconPlus, IconSearch } from "@tabler/icons-react";
import { buildingSchema, roomSchema, SPACE_STATUSES, type BuildingInput, type RoomInput } from "@hassan/validation";
import { api, type Building, type Room } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { usePlaces, withCurrent } from "../../hooks/usePlaces";
import { fieldError, handleFormError, notifyError } from "../../lib/forms";
import { NumField, SpaceStatusBadge, SpaceStatusField } from "./common";
import { UNIT_COLOR } from "../resources/ResourcesPage";
import { STATUS_COLOR } from "../assets/AssetsPage";

/** البنايات والحجرات والفضاءات (المادة 7): بلا حذف، الأرشفة ممنوعة ما دام الفضاء يحتوي عناصر نشطة. */
export function SpacesPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.spaces) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("spaces.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <SpacesScreen schoolId={activeSchool.id} />;
}

function SpacesScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<string | null>("rooms");
  return (
    <>
      <Card>
        <Title order={4}>{t("nav.spaces")}</Title>
        <Text size="sm" c="dimmed">{t("spaces.intro")}</Text>
      </Card>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="rooms" data-testid="tab-rooms">{t("spaces.rooms")}</Tabs.Tab>
          <Tabs.Tab value="buildings" data-testid="tab-buildings">{t("spaces.buildings")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="rooms" pt="md">
          <RoomsTab schoolId={schoolId} />
        </Tabs.Panel>
        <Tabs.Panel value="buildings" pt="md">
          <BuildingsTab schoolId={schoolId} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

function useArchiveToggle(onDone: () => unknown) {
  const { t } = useI18n();
  return (o: { name: string; archivedAt?: string }, run: (archive: boolean) => Promise<unknown>) =>
    modals.openConfirmModal({
      title: t(o.archivedAt ? "spaces.restore" : "spaces.archive"),
      children: <Text size="sm">{t(o.archivedAt ? "spaces.restoreBody" : "spaces.archiveBody", { name: o.name })}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      confirmProps: { "data-testid": "confirm-archive" } as Record<`data-${string}`, string>,
      onConfirm: async () => {
        try {
          await run(!o.archivedAt);
          await onDone();
        } catch (e) {
          notifyError(t, e);
        }
      },
    });
}

function RowActions({ archived, canEdit, canArchive, onEdit, onArchive, onView, name }: { archived: boolean; canEdit: boolean; canArchive: boolean; onEdit: () => void; onArchive: () => void; onView?: () => void; name: string }) {
  const { t } = useI18n();
  return (
    <Group gap={2} justify="flex-end" wrap="nowrap">
      {onView && (
        <Tooltip label={t("spaces.contents")}>
          <ActionIcon variant="subtle" aria-label={t("spaces.contents")} onClick={onView} data-testid={`view-${name}`}>
            <IconEye size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {canEdit && !archived && (
        <Tooltip label={t("common.edit")}>
          <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={onEdit} data-testid={`edit-${name}`}>
            <IconEdit size={16} />
          </ActionIcon>
        </Tooltip>
      )}
      {canArchive && (
        <Tooltip label={t(archived ? "spaces.restore" : "spaces.archive")}>
          <ActionIcon variant="subtle" color={archived ? "green" : "red"} aria-label={t(archived ? "spaces.restore" : "spaces.archive")} onClick={onArchive} data-testid={`archive-${name}`}>
            {archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}

// ------------------------------------------------------------------ الحجرات
function RoomsTab({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const places = usePlaces();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [spaceTypeId, setSpaceTypeId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [archived, setArchived] = useState("active");
  const [edit, setEdit] = useState<null | { r?: Room }>(null);
  const [view, setView] = useState<Room | null>(null);
  const filters = { q: dq, buildingId: buildingId ?? undefined, spaceTypeId: spaceTypeId ?? undefined, status: status ?? undefined, archived: archived === "archived" };
  const list = useQuery({ queryKey: ["rooms", schoolId, filters], queryFn: () => api.spaces!.rooms(schoolId, filters) });
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["rooms", schoolId] }), qc.invalidateQueries({ queryKey: ["buildings", schoolId] })]);
  const toggle = useArchiveToggle(reload);

  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Group gap="sm" className="flex-1">
          <TextInput className="min-w-[200px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("spaces.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
          <Select w={180} placeholder={t("spaces.building")} clearable data={places.buildingOptions} value={buildingId} onChange={setBuildingId} aria-label={t("spaces.building")} />
          <Select w={180} placeholder={t("spaces.spaceType")} clearable data={cat.lookupOptions("SPACE_TYPE")} value={spaceTypeId} onChange={setSpaceTypeId} aria-label={t("spaces.spaceType")} />
          <Select w={170} placeholder={t("spaces.status")} clearable data={SPACE_STATUSES.map((s) => ({ value: s, label: t(`spaceStatus.${s}`) }))} value={status} onChange={setStatus} aria-label={t("spaces.status")} />
          <SegmentedControl value={archived} onChange={setArchived} data={[{ value: "active", label: t("spaces.activeList") }, { value: "archived", label: t("spaces.archivedList") }]} />
        </Group>
        {can("spaces.create") && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-room">
            {t("spaces.addRoom")}
          </Button>
        )}
      </Group>
      <Table.ScrollContainer minWidth={900}>
        <Table striped verticalSpacing="sm" data-testid="rooms-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("spaces.code")}</Table.Th>
              <Table.Th>{t("spaces.name")}</Table.Th>
              <Table.Th>{t("spaces.spaceType")}</Table.Th>
              <Table.Th>{t("spaces.building")}</Table.Th>
              <Table.Th>{t("spaces.capacity")}</Table.Th>
              <Table.Th>{t("spaces.status")}</Table.Th>
              <Table.Th>{t("spaces.contents")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(list.data ?? []).map((r) => (
              <Table.Tr key={r.id} data-testid={`room-row-${r.code}`}>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{r.code}</Table.Td>
                <Table.Td fw={600}>{r.name}</Table.Td>
                <Table.Td>{cat.lookupLabel(r.spaceTypeId) || "—"}</Table.Td>
                <Table.Td>{r.building ?? "—"}{r.floor ? ` · ${t("spaces.floorShort", { f: r.floor })}` : ""}</Table.Td>
                <Table.Td>{r.capacity ?? "—"}</Table.Td>
                <Table.Td><SpaceStatusBadge status={r.status} /></Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {r.counts.assets > 0 && <Badge size="sm" variant="light">{t("spaces.nAssets", { n: r.counts.assets })}</Badge>}
                    {r.counts.resourceUnits > 0 && <Badge size="sm" variant="light" color="grape">{t("spaces.nUnits", { n: r.counts.resourceUnits })}</Badge>}
                    {r.counts.facilities > 0 && <Badge size="sm" variant="light" color="teal">{t("spaces.nFacilities", { n: r.counts.facilities })}</Badge>}
                    {!r.counts.assets && !r.counts.resourceUnits && !r.counts.facilities && <Text size="xs" c="dimmed">{t("spaces.emptyRoom")}</Text>}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <RowActions
                    name={r.code}
                    archived={!!r.archivedAt}
                    canEdit={can("spaces.update")}
                    canArchive={can("spaces.archive")}
                    onView={() => setView(r)}
                    onEdit={() => setEdit({ r })}
                    onArchive={() => toggle(r, (a) => api.spaces!.setRoomArchived(schoolId, r.id, a))}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {list.isLoading && <Loader size="sm" />}
      {list.data?.length === 0 && <Text c="dimmed" ta="center" py="lg">{dq || buildingId || spaceTypeId || status ? t("common.noResults") : t("spaces.noRooms")}</Text>}
      {edit && <RoomFormModal schoolId={schoolId} room={edit.r} onClose={() => setEdit(null)} onSaved={reload} />}
      {view && <RoomContentsModal schoolId={schoolId} room={view} onClose={() => setView(null)} />}
    </Card>
  );
}

function RoomFormModal({ schoolId, room, onClose, onSaved }: { schoolId: string; room?: Room; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const places = usePlaces();
  const f = useForm<RoomInput>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      code: room?.code ?? "",
      name: room?.name ?? "",
      buildingId: room?.buildingId ?? "",
      spaceTypeId: room?.spaceTypeId ?? "",
      floor: room?.floor ?? "",
      locationNote: room?.locationNote ?? "",
      areaM2: room?.areaM2 ?? null,
      capacity: room?.capacity ?? null,
      status: room?.status ?? "GOOD",
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (room) await api.spaces!.updateRoom(schoolId, room.id, v);
      else await api.spaces!.createRoom(schoolId, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={room ? t("spaces.editRoom") : t("spaces.addRoom")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="room-form">
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
                name="spaceTypeId"
                render={({ field }) => (
                  <Select label={t("spaces.spaceType")} required data={withCurrent(cat.lookupOptions("SPACE_TYPE"), room?.spaceTypeId, cat.lookupLabel(room?.spaceTypeId))} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("spaceTypeId")} data-testid="room-type" />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="buildingId"
                render={({ field }) => (
                  <Select label={t("spaces.building")} clearable data={withCurrent(places.buildingOptions, room?.buildingId, room?.building)} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("buildingId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label={t("spaces.floor")} {...f.register("floor")} error={err("floor")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <NumField control={f.control} name="areaM2" label={t("spaces.area")} decimals={2} suffix="m²" error={err("areaM2")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <NumField control={f.control} name="capacity" label={t("spaces.capacity")} error={err("capacity")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={t("spaces.locationNote")} {...f.register("locationNote")} error={err("locationNote")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <SpaceStatusField control={f.control} name="status" />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="room-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function RoomContentsModal({ schoolId, room, onClose }: { schoolId: string; room: Room; onClose: () => void }) {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["room-contents", schoolId, room.id], queryFn: () => api.spaces!.roomContents(schoolId, room.id) });
  const c = q.data;
  const empty = c && !c.assets.length && !c.resourceUnits.length && !c.resources.length && !c.facilities.length;
  return (
    <Modal opened onClose={onClose} title={`${room.code} — ${room.name}`} size="lg" centered>
      {q.isLoading && <Loader size="sm" />}
      {empty && <Text c="dimmed" data-testid="room-empty">{t("spaces.emptyRoom")}</Text>}
      {c && (
        <Stack data-testid="room-contents">
          {c.assets.length > 0 && (
            <Section title={t("nav.assets")}>
              {c.assets.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{a.inventoryNumber}</Table.Td>
                  <Table.Td>{a.name}{a.quantity > 1 ? ` × ${a.quantity}` : ""}</Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color={STATUS_COLOR[a.status]}>{t(`assetStatus.${a.status}`)}</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Section>
          )}
          {(c.resourceUnits.length > 0 || c.resources.length > 0) && (
            <Section title={t("nav.resources")}>
              {c.resourceUnits.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{u.inventoryNumber}</Table.Td>
                  <Table.Td>{u.resource}</Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color={UNIT_COLOR[u.status]}>{t(`unitStatus.${u.status}`)}</Badge></Table.Td>
                </Table.Tr>
              ))}
              {c.resources.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{r.code}</Table.Td>
                  <Table.Td>{r.name}</Table.Td>
                  <Table.Td>{t("resources.qtyTotal", { n: r.quantityTotal })}</Table.Td>
                </Table.Tr>
              ))}
            </Section>
          )}
          {c.facilities.length > 0 && (
            <Section title={t("nav.facilities")}>
              {c.facilities.map((x) => (
                <Table.Tr key={x.id}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{x.code}</Table.Td>
                  <Table.Td>{x.name}</Table.Td>
                  <Table.Td><SpaceStatusBadge status={x.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Section>
          )}
        </Stack>
      )}
    </Modal>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <Text fw={600} mb={4}>{title}</Text>
      <Table withTableBorder verticalSpacing={6}>
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </div>
  );
}

// ------------------------------------------------------------------ البنايات
function BuildingsTab({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [archived, setArchived] = useState("active");
  const [edit, setEdit] = useState<null | { b?: Building }>(null);
  const list = useQuery({ queryKey: ["buildings", schoolId, archived === "archived"], queryFn: () => api.spaces!.buildings(schoolId, archived === "archived") });
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["buildings", schoolId] }), qc.invalidateQueries({ queryKey: ["rooms", schoolId] })]);
  const toggle = useArchiveToggle(reload);
  return (
    <Card>
      <Group justify="space-between" mb="md">
        <SegmentedControl value={archived} onChange={setArchived} data={[{ value: "active", label: t("spaces.activeList") }, { value: "archived", label: t("spaces.archivedList") }]} />
        {can("spaces.create") && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-building">
            {t("spaces.addBuilding")}
          </Button>
        )}
      </Group>
      <Table.ScrollContainer minWidth={700}>
        <Table striped verticalSpacing="sm" data-testid="buildings-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("spaces.code")}</Table.Th>
              <Table.Th>{t("spaces.name")}</Table.Th>
              <Table.Th>{t("spaces.floors")}</Table.Th>
              <Table.Th>{t("spaces.builtYear")}</Table.Th>
              <Table.Th>{t("spaces.status")}</Table.Th>
              <Table.Th>{t("spaces.rooms")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(list.data ?? []).map((b) => (
              <Table.Tr key={b.id} data-testid={`building-row-${b.code}`}>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{b.code}</Table.Td>
                <Table.Td fw={600}>{b.name}</Table.Td>
                <Table.Td>{b.floors ?? "—"}</Table.Td>
                <Table.Td>{b.builtYear ?? "—"}</Table.Td>
                <Table.Td><SpaceStatusBadge status={b.status} /></Table.Td>
                <Table.Td>{b.rooms}</Table.Td>
                <Table.Td>
                  <RowActions
                    name={b.code}
                    archived={!!b.archivedAt}
                    canEdit={can("spaces.update")}
                    canArchive={can("spaces.archive")}
                    onEdit={() => setEdit({ b })}
                    onArchive={() => toggle(b, (a) => api.spaces!.setBuildingArchived(schoolId, b.id, a))}
                  />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {list.data?.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("spaces.noBuildings")}</Text>}
      {edit && <BuildingFormModal schoolId={schoolId} building={edit.b} onClose={() => setEdit(null)} onSaved={reload} />}
    </Card>
  );
}

function BuildingFormModal({ schoolId, building, onClose, onSaved }: { schoolId: string; building?: Building; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const f = useForm<BuildingInput>({
    resolver: zodResolver(buildingSchema),
    defaultValues: {
      code: building?.code ?? "",
      name: building?.name ?? "",
      floors: building?.floors ?? null,
      builtYear: building?.builtYear ?? null,
      status: building?.status ?? "GOOD",
      notes: building?.notes ?? "",
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (building) await api.spaces!.updateBuilding(schoolId, building.id, v);
      else await api.spaces!.createBuilding(schoolId, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={building ? t("spaces.editBuilding") : t("spaces.addBuilding")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="building-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label={t("spaces.code")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={t("spaces.name")} required {...f.register("name")} error={err("name")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <NumField control={f.control} name="floors" label={t("spaces.floors")} error={err("floors")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <NumField control={f.control} name="builtYear" label={t("spaces.builtYear")} min={1900} error={err("builtYear")} />
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
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="building-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
