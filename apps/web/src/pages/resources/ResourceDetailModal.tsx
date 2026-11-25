import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ActionIcon, Alert, Badge, Button, Center, Grid, Group, Image, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArchive, IconArchiveOff, IconArrowsExchange, IconDownload, IconEdit, IconPlus, IconQrcode } from "@tabler/icons-react";
import QRCode from "qrcode";
import { resourceUnitSchema, UNIT_STATUSES, type ResourceUnitInput } from "@hassan/validation";
import { api, ApiError, type ResourceDetail, type ResourceUnit } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { usePlaces, withCurrent } from "../../hooks/usePlaces";
import { dayOf, fieldError, handleFormError, notifyError } from "../../lib/forms";
import { scanUrl } from "../assets/AssetDetailModal";
import { UNIT_COLOR } from "./ResourcesPage";
import { LoanStatusBadge } from "../loans/LoansPage";

export function ResourceDetailModal({ schoolId, id, onClose, onEdit }: { schoolId: string; id: string; onClose: () => void; onEdit: (r: ResourceDetail) => void }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["resource", schoolId, id], queryFn: () => api.resources!.get(schoolId, id) });
  const [unitEdit, setUnitEdit] = useState<null | { u?: ResourceUnit }>(null);
  const [qr, setQr] = useState<ResourceUnit | null>(null);
  const [damage, setDamage] = useState(false);
  const r = q.data;
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["resource", schoolId, id] }), qc.invalidateQueries({ queryKey: ["resources", schoolId] })]);

  const toggleArchive = (x: ResourceDetail) =>
    modals.openConfirmModal({
      title: t(x.archivedAt ? "spaces.restore" : "spaces.archive"),
      children: <Text size="sm">{t(x.archivedAt ? "spaces.restoreBody" : "spaces.archiveBody", { name: x.name })}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      confirmProps: { "data-testid": "confirm-archive" } as Record<`data-${string}`, string>,
      onConfirm: async () => {
        try {
          await api.resources!.setArchived(schoolId, x.id, !x.archivedAt);
          await reload();
        } catch (e) {
          notifyError(t, e);
        }
      },
    });

  return (
    <Modal opened onClose={onClose} title={r ? `${r.code} — ${r.name}` : t("resources.details")} size="xl" centered>
      {q.isLoading && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {q.isError && <Alert color="red">{t(q.error instanceof ApiError && q.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>}
      {r && (
        <Tabs defaultValue="info" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="info">{t("assets.details")}</Tabs.Tab>
            {r.trackingMode === "INDIVIDUAL" && <Tabs.Tab value="units" data-testid="units-tab">{t("resources.units")} ({r.units.length})</Tabs.Tab>}
            {can("loans.view") && <Tabs.Tab value="loans" data-testid="resource-loans-tab">{t("nav.loans")}</Tabs.Tab>}
          </Tabs.List>
          <Tabs.Panel value="info">
            <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md" data-testid="availability">
              <Stat label={t("resources.total")} value={r.total} />
              <Stat label={t("resources.available")} value={r.available} color="green" />
              <Stat label={t("resources.onLoan")} value={r.onLoan} color="blue" />
              <Stat label={t("resources.damaged")} value={r.damaged} color="red" />
            </SimpleGrid>
            <Grid gutter="lg">
              <Grid.Col span={{ base: 12, sm: r.photoDataUrl ? 8 : 12 }}>
                <Table variant="vertical" withTableBorder layout="fixed">
                  <Table.Tbody>
                    <Row k={t("resources.type")} v={cat.lookupLabel(r.resourceTypeId)} />
                    <Row k={t("assets.category")} v={cat.categoryLabel(r.categoryId)} />
                    <Row k={t("assets.trackingMode")} v={t(`resources.mode.${r.trackingMode}`)} />
                    <Row k={t("resources.storageRoom")} v={r.room} />
                    <Row k={t("assets.acquisitionDate")} v={r.acquisitionDate ? fmtDate(r.acquisitionDate) : undefined} />
                    <Row k={t("resources.isLendable")} v={t(r.isLendable ? "common.yes" : "common.no")} />
                    {r.maintenance > 0 && <Row k={t("unitStatus.UNDER_MAINTENANCE")} v={String(r.maintenance)} />}
                    {r.archivedAt && <Row k={t("assets.archivedAt")} v={fmtDate(r.archivedAt)} />}
                  </Table.Tbody>
                </Table>
              </Grid.Col>
              {r.photoDataUrl && (
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Image src={r.photoDataUrl} alt={t("assets.photo")} mah={180} fit="contain" radius="sm" className="border border-gray-200" />
                </Grid.Col>
              )}
            </Grid>
            <Group justify="flex-end" mt="md">
              {can("resources.archive") && (
                <Button variant="light" color={r.archivedAt ? "green" : "red"} leftSection={r.archivedAt ? <IconArchiveOff size={16} /> : <IconArchive size={16} />} onClick={() => toggleArchive(r)} data-testid="resource-archive">
                  {t(r.archivedAt ? "spaces.restore" : "spaces.archive")}
                </Button>
              )}
              {!r.archivedAt && r.trackingMode === "QUANTITY" && can("resources.update") && (
                <Button variant="light" color="orange" onClick={() => setDamage(true)} data-testid="resource-damaged">
                  {t("resources.setDamaged")}
                </Button>
              )}
              {!r.archivedAt && can("resources.update") && (
                <Button variant="default" leftSection={<IconEdit size={16} />} onClick={() => onEdit(r)} data-testid="resource-edit">
                  {t("common.edit")}
                </Button>
              )}
              {!r.archivedAt && r.isLendable && r.available > 0 && can("loans.create") && (
                <Button leftSection={<IconArrowsExchange size={16} />} onClick={() => nav(`/loans?resource=${r.id}`)} data-testid="resource-lend">
                  {t("loans.new")}
                </Button>
              )}
            </Group>
          </Tabs.Panel>
          <Tabs.Panel value="units">
            <Group justify="space-between" mb="sm">
              <Text size="sm" c="dimmed">{t("resources.unitsHint")}</Text>
              {!r.archivedAt && can("resources.create") && (
                <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setUnitEdit({})} data-testid="add-unit">
                  {t("resources.addUnit")}
                </Button>
              )}
            </Group>
            <Table.ScrollContainer minWidth={640}>
              <Table striped verticalSpacing="xs" data-testid="units-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("assets.inventoryNumber")}</Table.Th>
                    <Table.Th>{t("assets.serialNumber")}</Table.Th>
                    <Table.Th>{t("assets.status")}</Table.Th>
                    <Table.Th>{t("assets.room")}</Table.Th>
                    <Table.Th>{t("loans.borrower")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {r.units.map((u) => (
                    <Table.Tr key={u.id} data-testid={`unit-row-${u.inventoryNumber}`}>
                      <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{u.inventoryNumber}</Table.Td>
                      <Table.Td dir="ltr" style={{ textAlign: "start" }}>{u.serialNumber ?? "—"}</Table.Td>
                      <Table.Td><Badge size="sm" variant="light" color={UNIT_COLOR[u.status]}>{t(`unitStatus.${u.status}`)}</Badge></Table.Td>
                      <Table.Td>{u.room ?? "—"}</Table.Td>
                      <Table.Td>{u.loan ? `${u.loan.borrower} · ${t("loans.dueShort", { d: fmtDate(dayOf(u.loan.dueAt)) })}` : "—"}</Table.Td>
                      <Table.Td>
                        <Group gap={2} justify="flex-end" wrap="nowrap">
                          <Tooltip label={t("assets.qr")}>
                            <ActionIcon variant="subtle" aria-label={t("assets.qr")} onClick={() => setQr(u)} data-testid={`qr-${u.inventoryNumber}`}>
                              <IconQrcode size={16} />
                            </ActionIcon>
                          </Tooltip>
                          {!r.archivedAt && can("resources.update") && (
                            <Tooltip label={t("common.edit")}>
                              <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setUnitEdit({ u })} data-testid={`edit-unit-${u.inventoryNumber}`}>
                                <IconEdit size={16} />
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
            {r.units.length === 0 && <Text c="dimmed" ta="center" py="md">{t("resources.noUnits")}</Text>}
          </Tabs.Panel>
          <Tabs.Panel value="loans">
            <ResourceLoans schoolId={schoolId} resourceId={r.id} />
          </Tabs.Panel>
        </Tabs>
      )}
      {r && unitEdit && <UnitFormModal schoolId={schoolId} resource={r} unit={unitEdit.u} onClose={() => setUnitEdit(null)} onSaved={reload} />}
      {r && qr && <UnitQrModal resource={r} unit={qr} onClose={() => setQr(null)} />}
      {r && damage && <DamageModal schoolId={schoolId} resource={r} onClose={() => setDamage(false)} onSaved={reload} />}
    </Modal>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-2 text-center">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <Table.Tr>
      <Table.Th w={150}>{k}</Table.Th>
      <Table.Td>{v || <Text span c="dimmed">—</Text>}</Table.Td>
    </Table.Tr>
  );
}

function ResourceLoans({ schoolId, resourceId }: { schoolId: string; resourceId: string }) {
  const { t, fmtDate } = useI18n();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["loans", schoolId, { resourceId }], queryFn: () => api.loans!.list(schoolId, { resourceId, pageSize: 50 }) });
  if (q.isLoading) return <Loader size="sm" />;
  if (!q.data?.items.length) return <Text c="dimmed">{t("loans.empty")}</Text>;
  return (
    <Table striped verticalSpacing="xs">
      <Table.Tbody>
        {q.data.items.map((l) => (
          <Table.Tr key={l.id} className="cursor-pointer" onClick={() => nav(`/loans/${l.id}/receipt`)}>
            <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{l.number}</Table.Td>
            <Table.Td>{l.borrower}</Table.Td>
            <Table.Td>{l.unit ?? `× ${l.quantity}`}</Table.Td>
            <Table.Td>{fmtDate(l.loanedAt)}</Table.Td>
            <Table.Td><LoanStatusBadge loan={l} /></Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function UnitFormModal({ schoolId, resource, unit, onClose, onSaved }: { schoolId: string; resource: ResourceDetail; unit?: ResourceUnit; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const places = usePlaces();
  const onLoan = unit?.status === "ON_LOAN";
  const f = useForm<ResourceUnitInput>({
    resolver: zodResolver(resourceUnitSchema),
    defaultValues: {
      inventoryNumber: unit?.inventoryNumber ?? "",
      serialNumber: unit?.serialNumber ?? "",
      roomId: unit?.roomId ?? resource.roomId ?? "",
      status: unit && unit.status !== "ON_LOAN" ? unit.status : "AVAILABLE",
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (unit) await api.resources!.updateUnit(schoolId, resource.id, unit.id, v);
      else await api.resources!.addUnit(schoolId, resource.id, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_INVENTORY_NUMBER: "inventoryNumber" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={unit ? t("resources.editUnit") : t("resources.addUnit")} centered>
      <form onSubmit={submit} noValidate data-testid="unit-form">
        <Stack>
          <TextInput label={t("assets.inventoryNumber")} description={unit ? undefined : t("resources.unitNumberHint", { code: resource.code })} dir="ltr" disabled={!!unit} {...f.register("inventoryNumber")} error={err("inventoryNumber")} />
          <TextInput label={t("assets.serialNumber")} dir="ltr" {...f.register("serialNumber")} error={err("serialNumber")} />
          <Controller
            control={f.control}
            name="roomId"
            render={({ field }) => (
              <Select label={t("assets.room")} clearable searchable data={withCurrent(places.roomOptions, unit?.roomId, unit?.room)} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("roomId")} />
            )}
          />
          {onLoan ? (
            <Alert color="blue" variant="light">{t("resources.unitOnLoanHint")}</Alert>
          ) : (
            <Controller
              control={f.control}
              name="status"
              render={({ field }) => (
                <Select label={t("assets.status")} data={UNIT_STATUSES.map((s) => ({ value: s, label: t(`unitStatus.${s}`) }))} value={field.value} onChange={(x) => x && field.onChange(x)} allowDeselect={false} data-testid="unit-status" />
              )}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="unit-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function UnitQrModal({ resource, unit, onClose }: { resource: ResourceDetail; unit: ResourceUnit; onClose: () => void }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(scanUrl(unit.qrToken), { errorCorrectionLevel: "M", margin: 1, width: 360 }).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [unit.qrToken]);
  return (
    <Modal opened onClose={onClose} title={`${unit.inventoryNumber} — ${resource.name}`} size="sm" centered>
      {src && (
        <Stack align="center" gap={6} data-testid="unit-qr">
          <img src={src} alt={t("assets.qr")} width={200} height={200} />
          <Text size="xs" c="dimmed" ta="center">{t("assets.qrHint")}</Text>
          <Button component="a" href={src} download={`QR-${unit.inventoryNumber}.png`} size="xs" variant="light" leftSection={<IconDownload size={14} />}>
            {t("assets.downloadQr")}
          </Button>
        </Stack>
      )}
    </Modal>
  );
}

function DamageModal({ schoolId, resource, onClose, onSaved }: { schoolId: string; resource: ResourceDetail; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const [qty, setQty] = useState<number | string>(resource.damaged);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const max = resource.total - resource.onLoan;
  const save = async () => {
    const n = Number(qty);
    if (qty === "" || !Number.isInteger(n) || n < 0) return setError(t("errors.integer"));
    if (!reason.trim()) return setError(t("resources.reasonRequired"));
    setBusy(true);
    try {
      await api.resources!.setDamaged(schoolId, resource.id, n, reason.trim());
      await onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "QUANTITY_BELOW_USED") setError(t("resources.damagedMax", { max }));
      else notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={t("resources.setDamaged")} centered>
      <Stack>
        <Text size="sm" c="dimmed">{t("resources.damagedHint", { max })}</Text>
        <NumberInput label={t("resources.damaged")} min={0} max={max} allowDecimal={false} value={qty} onChange={setQty} data-testid="damaged-qty" />
        <Textarea label={t("assets.reason")} required autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} data-testid="damaged-reason" />
        {error && <Text size="sm" c="red">{error}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button loading={busy} onClick={save} data-testid="damaged-save">{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
