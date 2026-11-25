import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Divider, Grid, Group, Image, Loader, Modal, NumberInput, Pagination, SegmentedControl, Select, Stack, Switch, Table, Tabs, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconCalendarRepeat, IconEdit, IconPlayerPlay, IconPlus, IconSearch, IconTool } from "@tabler/icons-react";
import { MAINTENANCE_CLOSE_NEEDS_NOTE, MAINTENANCE_TRANSITIONS } from "@hassan/shared";
import {
  URGENCIES,
  maintenanceRecordSchema,
  maintenanceRequestSchema,
  maintenanceScheduleSchema,
  type MaintenanceRecordInput,
  type MaintenanceRequestInput,
  type MaintenanceScheduleInput,
} from "@hassan/validation";
import { api, type MaintenanceRequest, type MaintenanceSchedule, type MaintenanceStatus } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { PhotoField } from "../../components/PhotoField";
import { fieldError, fmtMoney, handleFormError, newOpId, notifyError, today } from "../../lib/forms";
import { MaintenanceStatusBadge, TargetFields, UrgencyBadge } from "./common";

const PAGE_SIZE = 25;

/** الصيانة والإصلاح (المادة 16): طلبات بمسار حالات صارم، تدخلات بتكلفة وفاتورة، وصيانة وقائية مجدولة. */
export function MaintenancePage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.maintenance) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("maintenance.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <MaintenanceScreen schoolId={activeSchool.id} />;
}

function MaintenanceScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "schedules" ? "schedules" : "requests";
  return (
    <>
      <Card>
        <Title order={4}>{t("nav.maintenance")}</Title>
        <Text size="sm" c="dimmed">{t("mnt.intro")}</Text>
      </Card>
      <Tabs value={tab} onChange={(v) => setParams(v === "schedules" ? { tab: "schedules" } : {}, { replace: true })} keepMounted={false}>
        <Tabs.List mb="sm">
          <Tabs.Tab value="requests" leftSection={<IconTool size={16} />}>{t("mnt.requests")}</Tabs.Tab>
          <Tabs.Tab value="schedules" leftSection={<IconCalendarRepeat size={16} />} data-testid="tab-schedules">{t("mnt.schedules")}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="requests">
          <RequestsTab schoolId={schoolId} />
        </Tabs.Panel>
        <Tabs.Panel value="schedules">
          <SchedulesTab schoolId={schoolId} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

function RequestsTab({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState("open");
  const [urgency, setUrgency] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(() => !!params.get("new") && can("maintenance.create"));
  const [openId, setOpenId] = useState<string | null>(null);
  const query = { open: view === "open", status: view !== "open" && view !== "all" ? view : undefined, urgency: urgency ?? undefined, q: dq, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ["maintenance", schoolId, query], queryFn: () => api.maintenance!.list(schoolId, query) });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const reload = () => Promise.all(["maintenance", "maint-req", "assets", "asset", "rooms", "facilities", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  return (
    <Card>
      <Group gap="sm" mb="md">
        <SegmentedControl
          value={view}
          onChange={(v) => {
            setView(v);
            setPage(1);
          }}
          data={[
            { value: "open", label: t("mnt.view.open") },
            { value: "CLOSED", label: t("mntStatus.CLOSED") },
            { value: "all", label: t("loans.view.all") },
          ]}
          data-testid="mnt-view"
        />
        <TextInput className="min-w-[200px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("mnt.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} />
        <Select w={170} placeholder={t("mnt.urgency")} clearable data={URGENCIES.map((u) => ({ value: u, label: t(`urgency.${u}`) }))} value={urgency} onChange={(v) => { setUrgency(v); setPage(1); }} aria-label={t("mnt.urgency")} />
        {can("maintenance.create") && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} data-testid="new-mnt">
            {t("mnt.new")}
          </Button>
        )}
      </Group>
      <Table.ScrollContainer minWidth={900}>
        <Table striped highlightOnHover verticalSpacing="sm" data-testid="mnt-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("mnt.number")}</Table.Th>
              <Table.Th>{t("mnt.target")}</Table.Th>
              <Table.Th>{t("mnt.description")}</Table.Th>
              <Table.Th>{t("mnt.reportedAt")}</Table.Th>
              <Table.Th>{t("mnt.urgency")}</Table.Th>
              <Table.Th>{t("assets.status")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(list.data?.items ?? []).map((r) => (
              <Table.Tr key={r.id} onClick={() => setOpenId(r.id)} style={{ cursor: "pointer" }} data-testid={`mnt-row-${r.number}`}>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{r.number}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>{r.target.label}</Text>
                  <Text size="xs" c="dimmed">{t(`mntTarget.${r.target.type}`)} · {t(`mntType.${r.type}`)}</Text>
                </Table.Td>
                <Table.Td><Text size="sm" lineClamp={2}>{r.description}</Text></Table.Td>
                <Table.Td>{fmtDate(r.reportedAt)}</Table.Td>
                <Table.Td><UrgencyBadge urgency={r.urgency} /></Table.Td>
                <Table.Td><MaintenanceStatusBadge status={r.status} /></Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {list.isLoading && <Loader size="sm" />}
      {list.data && list.data.items.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("mnt.empty")}</Text>}
      {list.data && (
        <Group justify="space-between" mt="sm">
          <Text size="sm" c="dimmed">{t("common.totalCount", { n: list.data.total })}</Text>
          {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
        </Group>
      )}
      {creating && (
        <RequestFormModal
          schoolId={schoolId}
          preset={{ type: params.get("targetType"), id: params.get("targetId") }}
          onClose={() => {
            setCreating(false);
            if (params.get("new")) setParams({}, { replace: true });
          }}
          onSaved={async (id) => {
            await reload();
            setCreating(false);
            setOpenId(id);
          }}
        />
      )}
      {openId && <RequestDetailModal schoolId={schoolId} id={openId} onClose={() => setOpenId(null)} onChanged={reload} />}
    </Card>
  );
}

function RequestFormModal({ schoolId, preset, onClose, onSaved }: { schoolId: string; preset: { type: string | null; id: string | null }; onClose: () => void; onSaved: (id: string) => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const opId = useMemo(newOpId, []);
  const assignees = useQuery({ queryKey: ["maint-assignees", schoolId], queryFn: () => api.maintenance!.assignees(schoolId) });
  const presetType = (["asset", "room", "facility", "resourceUnit"] as const).find((x) => x === preset.type);
  const f = useForm<MaintenanceRequestInput>({
    resolver: zodResolver(maintenanceRequestSchema),
    defaultValues: { targetType: presetType ?? "asset", targetId: (presetType && preset.id) || "", type: "CORRECTIVE", damageTypeId: "", description: "", urgency: "NORMAL", assigneeId: "", photoDataUrl: null, clientOpId: opId },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      const r = await api.maintenance!.create(schoolId, { ...v, photoDataUrl: v.photoDataUrl || null });
      notifications.show({ color: "green", message: t("mnt.created", { n: r.number }) });
      await onSaved(r.id);
    } catch (e) {
      handleFormError(f, t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={t("mnt.new")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="mnt-form">
        <Stack>
          <TargetFields schoolId={schoolId} type={f.watch("targetType")} id={f.watch("targetId")} onType={(x) => f.setValue("targetType", x)} onId={(x) => f.setValue("targetId", x, { shouldValidate: f.formState.isSubmitted })} error={err("targetId")} />
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="type" render={({ field }) => <Select label={t("mnt.type")} required data={(["CORRECTIVE", "EMERGENCY", "PREVENTIVE"] as const).map((x) => ({ value: x, label: t(`mntType.${x}`) }))} value={field.value} onChange={(x) => field.onChange(x ?? "CORRECTIVE")} />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="damageTypeId" render={({ field }) => <Select label={t("mnt.damageType")} clearable data={cat.lookupOptions("DAMAGE_TYPE")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("damageTypeId")} data-testid="mnt-damage" />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="urgency" render={({ field }) => <Select label={t("mnt.urgency")} required data={URGENCIES.map((u) => ({ value: u, label: t(`urgency.${u}`) }))} value={field.value} onChange={(x) => field.onChange(x ?? "NORMAL")} data-testid="mnt-urgency" />} />
            </Grid.Col>
          </Grid>
          <Textarea label={t("mnt.description")} required autosize minRows={3} {...f.register("description")} error={err("description")} data-testid="mnt-description" />
          <Controller
            control={f.control}
            name="assigneeId"
            render={({ field }) => <Select label={t("mnt.assignee")} clearable searchable data={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.fullNameAr }))} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("assigneeId")} />}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>{t("mnt.photo")}</Text>
            <Controller control={f.control} name="photoDataUrl" render={({ field }) => <PhotoField value={field.value} onChange={field.onChange} />} />
          </div>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="mnt-save">{t("mnt.report")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function RequestDetailModal({ schoolId, id, onClose, onChanged }: { schoolId: string; id: string; onClose: () => void; onChanged: () => unknown }) {
  const { t, fmtDate, fmtDateTime } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const r = useQuery({ queryKey: ["maint-req", schoolId, id], queryFn: () => api.maintenance!.get(schoolId, id) });
  const [moving, setMoving] = useState<MaintenanceStatus | null>(null);
  const [recording, setRecording] = useState(false);
  const d = r.data;
  const next = d ? ((MAINTENANCE_TRANSITIONS[d.status] ?? []) as MaintenanceStatus[]) : [];
  const canEdit = can("maintenance.update");
  const refresh = async () => {
    await r.refetch();
    await onChanged();
  };
  const row = (k: string, v: React.ReactNode) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={140} style={{ flexShrink: 0 }}>{k}</Text>
      <Text size="sm" component="div">{v}</Text>
    </Group>
  );
  return (
    <Modal opened onClose={onClose} title={d ? `${t("mnt.request")} ${d.number}` : t("mnt.request")} size="xl" centered>
      {!d ? (
        <Loader size="sm" />
      ) : (
        <Stack data-testid="mnt-detail">
          <Group justify="space-between">
            <Group gap="xs">
              <MaintenanceStatusBadge status={d.status} />
              <UrgencyBadge urgency={d.urgency} />
              <Badge variant="outline" color="gray">{t(`mntType.${d.type}`)}</Badge>
            </Group>
            {canEdit && (
              <Group gap="xs">
                {(d.status === "UNDER_REVIEW" || d.status === "IN_REPAIR") && (
                  <Button size="xs" leftSection={<IconTool size={14} />} onClick={() => setRecording(true)} data-testid="mnt-add-record">
                    {t("mnt.addRecord")}
                  </Button>
                )}
                {next.map((s) => (
                  <Button key={s} size="xs" variant="light" color={s === "CLOSED" ? "gray" : s === "UNREPAIRABLE" ? "red" : "blue"} onClick={() => setMoving(s)} data-testid={`mnt-to-${s}`}>
                    {t(`mntAction.${s}`)}
                  </Button>
                ))}
              </Group>
            )}
          </Group>
          <Grid>
            <Grid.Col span={{ base: 12, md: d.photoDataUrl ? 8 : 12 }}>
              <Stack gap={6}>
                {row(t("mnt.target"), `${t(`mntTarget.${d.target.type}`)}: ${d.target.label}`)}
                {row(t("mnt.description"), d.description)}
                {d.damageTypeId && row(t("mnt.damageType"), cat.lookupLabel(d.damageTypeId))}
                {row(t("mnt.reportedAt"), `${fmtDateTime(d.reportedAt)}${d.reportedBy ? ` — ${d.reportedBy}` : ""}`)}
                {row(t("mnt.assignee"), d.assignee ?? "—")}
                {d.schedule && row(t("mnt.fromSchedule"), d.schedule.title)}
                {row(t("mnt.totalCost"), `${fmtMoney(d.totalCost)} ${t("unit.mad")}`)}
                {d.closedAt && row(t("mnt.closedAt"), fmtDateTime(d.closedAt))}
              </Stack>
            </Grid.Col>
            {d.photoDataUrl && (
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Image src={d.photoDataUrl} alt={t("mnt.photo")} radius="md" mah={200} fit="contain" />
              </Grid.Col>
            )}
          </Grid>
          <Divider label={t("mnt.records")} labelPosition="left" />
          {d.records.length === 0 ? (
            <Text size="sm" c="dimmed">{t("mnt.noRecords")}</Text>
          ) : (
            <Table.ScrollContainer minWidth={700}>
              <Table verticalSpacing="xs" data-testid="mnt-records">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("mnt.contractor")}</Table.Th>
                    <Table.Th>{t("mnt.interventionReport")}</Table.Th>
                    <Table.Th>{t("mnt.repairedAt")}</Table.Th>
                    <Table.Th>{t("mnt.cost")}</Table.Th>
                    <Table.Th>{t("mnt.invoice")}</Table.Th>
                    <Table.Th>{t("mnt.outcome")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {d.records.map((x) => (
                    <Table.Tr key={x.id}>
                      <Table.Td>{x.contractor ?? "—"}</Table.Td>
                      <Table.Td><Text size="sm" lineClamp={3}>{x.interventionReport ?? "—"}</Text></Table.Td>
                      <Table.Td>{x.repairedAt ? fmtDate(x.repairedAt) : "—"}</Table.Td>
                      <Table.Td>{x.cost != null ? fmtMoney(x.cost) : "—"}</Table.Td>
                      <Table.Td>{x.invoice ? <span dir="ltr">{x.invoice.number} · {x.invoice.supplier}</span> : "—"}</Table.Td>
                      <Table.Td>{t(`mntStatus.${x.outcome}`)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Stack>
      )}
      {moving && d && <TransitionModal schoolId={schoolId} req={d} to={moving} onClose={() => setMoving(null)} onDone={refresh} />}
      {recording && d && <RecordModal schoolId={schoolId} req={d} onClose={() => setRecording(false)} onDone={refresh} />}
    </Modal>
  );
}

function TransitionModal({ schoolId, req, to, onClose, onDone }: { schoolId: string; req: MaintenanceRequest; to: MaintenanceStatus; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const needsNote = to === "CLOSED" && MAINTENANCE_CLOSE_NEEDS_NOTE.includes(req.status);
  const go = async () => {
    if (needsNote && !note.trim()) return setError(t("errors.closeNeedsNote"));
    setBusy(true);
    try {
      await api.maintenance!.transition(schoolId, req.id, { to, note });
      await onDone();
      onClose();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={`${t(`mntAction.${to}`)} — ${req.number}`} centered>
      <Stack>
        <Text size="sm">{t("mnt.transitionHint", { from: t(`mntStatus.${req.status}`), to: t(`mntStatus.${to}`) })}</Text>
        <Textarea label={t("mnt.note")} required={needsNote} autosize minRows={2} value={note} onChange={(e) => { setNote(e.currentTarget.value); setError(undefined); }} error={error} data-testid="mnt-note" />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={go} loading={busy} data-testid="mnt-confirm">{t("common.confirm")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function RecordModal({ schoolId, req, onClose, onDone }: { schoolId: string; req: MaintenanceRequest; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const [withInvoice, setWithInvoice] = useState(false);
  const f = useForm<MaintenanceRecordInput>({
    resolver: zodResolver(maintenanceRecordSchema),
    defaultValues: { contractor: "", cost: null, interventionReport: "", startedAt: today(), repairedAt: "", outcome: "REPAIRED", invoice: null },
  });
  const err = fieldError(f, t);
  const outcome = f.watch("outcome");
  const submit = f.handleSubmit(async (v) => {
    try {
      await api.maintenance!.addRecord(schoolId, req.id, { ...v, repairedAt: v.repairedAt || null, startedAt: v.startedAt || null, invoice: withInvoice ? v.invoice : null });
      await onDone();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_INVOICE: "invoice.invoiceNumber" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={`${t("mnt.addRecord")} — ${req.number}`} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="record-form">
        <Stack>
          <Controller
            control={f.control}
            name="outcome"
            render={({ field }) => (
              <SegmentedControl fullWidth value={field.value} onChange={field.onChange} data={(["IN_REPAIR", "REPAIRED", "UNREPAIRABLE"] as const).map((x) => ({ value: x, label: t(`mntStatus.${x}`) }))} data-testid="record-outcome" />
            )}
          />
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("mnt.contractor")} {...f.register("contractor")} error={err("contractor")} data-testid="record-contractor" />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller control={f.control} name="cost" render={({ field }) => <NumberInput label={`${t("mnt.cost")} (${t("unit.mad")})`} min={0} decimalScale={2} value={field.value ?? ""} onChange={(x) => field.onChange(x === "" ? null : Number(x))} error={err("cost")} data-testid="record-cost" />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput type="date" label={t("mnt.startedAt")} {...f.register("startedAt")} error={err("startedAt")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput type="date" label={t("mnt.repairedAt")} required={outcome === "REPAIRED"} max={today()} {...f.register("repairedAt")} error={err("repairedAt")} data-testid="record-repaired-at" />
            </Grid.Col>
          </Grid>
          <Textarea label={t("mnt.interventionReport")} autosize minRows={3} {...f.register("interventionReport")} error={err("interventionReport")} />
          <Switch label={t("mnt.withInvoice")} checked={withInvoice} onChange={(e) => { const on = e.currentTarget.checked; setWithInvoice(on); f.setValue("invoice", on ? { supplierId: "", invoiceNumber: "", invoiceDate: today(), amount: f.getValues("cost") ?? 0 } : null); }} data-testid="record-with-invoice" />
          {withInvoice && (
            <Grid gutter="sm">
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller control={f.control} name="invoice.supplierId" render={({ field }) => <Select label={t("po.supplier")} required searchable data={cat.supplierOptions} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("invoice.supplierId")} />} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput label={t("mnt.invoiceNumber")} required {...f.register("invoice.invoiceNumber")} error={err("invoice.invoiceNumber")} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput type="date" label={t("mnt.invoiceDate")} required {...f.register("invoice.invoiceDate")} error={err("invoice.invoiceDate")} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <Controller control={f.control} name="invoice.amount" render={({ field }) => <NumberInput label={`${t("mnt.amount")} (${t("unit.mad")})`} required min={0} decimalScale={2} value={field.value ?? ""} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("invoice.amount")} />} />
              </Grid.Col>
            </Grid>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="record-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------- الصيانة الوقائية ----------------
function SchedulesTab({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["maint-schedules", schoolId], queryFn: () => api.maintenance!.schedules(schoolId) });
  const [editing, setEditing] = useState<MaintenanceSchedule | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["maint-schedules", schoolId] }), qc.invalidateQueries({ queryKey: ["maintenance", schoolId] }), qc.invalidateQueries({ queryKey: ["dashboard"] })]);
  const generate = async (s: MaintenanceSchedule) => {
    setBusy(s.id);
    try {
      const r = await api.maintenance!.generate(schoolId, s.id);
      notifications.show({ color: "green", message: t("mnt.created", { n: r.number }) });
      await reload();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">{t("mnt.schedulesIntro")}</Text>
        {can("maintenance.create") && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")} data-testid="new-schedule">
            {t("mnt.newSchedule")}
          </Button>
        )}
      </Group>
      <Table.ScrollContainer minWidth={800}>
        <Table striped verticalSpacing="sm" data-testid="schedules-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("mnt.scheduleTitle")}</Table.Th>
              <Table.Th>{t("mnt.target")}</Table.Th>
              <Table.Th>{t("mnt.interval")}</Table.Th>
              <Table.Th>{t("mnt.nextDueAt")}</Table.Th>
              <Table.Th>{t("assets.status")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(list.data ?? []).map((s) => (
              <Table.Tr key={s.id} data-testid={`schedule-row-${s.title}`}>
                <Table.Td fw={600}>{s.title}</Table.Td>
                <Table.Td>
                  <Text size="sm">{s.target}</Text>
                  <Text size="xs" c="dimmed">{t(`mntTarget.${s.targetType}`)}</Text>
                </Table.Td>
                <Table.Td>{t("mnt.everyNDays", { n: s.intervalDays })}</Table.Td>
                <Table.Td>{fmtDate(`${s.nextDueAt}T12:00:00`)}</Table.Td>
                <Table.Td>
                  {!s.isActive ? (
                    <Badge color="gray" variant="light">{t("common.inactive")}</Badge>
                  ) : s.overdue ? (
                    <Badge color="red" variant="filled" data-testid="schedule-overdue">{t("mnt.overdue")}</Badge>
                  ) : s.dueSoon ? (
                    <Badge color="orange" variant="light" data-testid="schedule-due">{t("mnt.dueSoon")}</Badge>
                  ) : (
                    <Badge color="green" variant="light">{t("mnt.onTrack")}</Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={2} justify="flex-end" wrap="nowrap">
                    {s.isActive && can("maintenance.create") && (
                      <Tooltip label={t("mnt.generate")}>
                        <ActionIcon variant="subtle" color="green" aria-label={t("mnt.generate")} loading={busy === s.id} onClick={() => generate(s)} data-testid={`generate-${s.title}`}>
                          <IconPlayerPlay size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {can("maintenance.update") && (
                      <Tooltip label={t("common.edit")}>
                        <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEditing(s)}>
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
      {list.data && list.data.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("mnt.noSchedules")}</Text>}
      {editing && <ScheduleModal schoolId={schoolId} schedule={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </Card>
  );
}

function ScheduleModal({ schoolId, schedule, onClose, onSaved }: { schoolId: string; schedule: MaintenanceSchedule | null; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const f = useForm<MaintenanceScheduleInput>({
    resolver: zodResolver(maintenanceScheduleSchema),
    defaultValues: schedule
      ? { title: schedule.title, targetType: schedule.targetType, targetId: schedule.targetId, intervalDays: schedule.intervalDays, nextDueAt: schedule.nextDueAt, remindDaysBefore: schedule.remindDaysBefore, isActive: schedule.isActive }
      : { title: "", targetType: "asset", targetId: "", intervalDays: 90, nextDueAt: today(), remindDaysBefore: 7, isActive: true },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      await api.maintenance!.saveSchedule(schoolId, schedule?.id ?? null, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={schedule ? t("mnt.editSchedule") : t("mnt.newSchedule")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="schedule-form">
        <Stack>
          <TextInput label={t("mnt.scheduleTitle")} required {...f.register("title")} error={err("title")} data-testid="schedule-title" />
          {schedule ? (
            <Text size="sm">{t(`mntTarget.${schedule.targetType}`)}: {schedule.target}</Text>
          ) : (
            <TargetFields schoolId={schoolId} type={f.watch("targetType")} id={f.watch("targetId")} onType={(x) => f.setValue("targetType", x)} onId={(x) => f.setValue("targetId", x)} error={err("targetId")} />
          )}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="intervalDays" render={({ field }) => <NumberInput label={t("mnt.intervalDays")} required min={1} allowDecimal={false} clampBehavior="none" value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("intervalDays")} />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput type="date" label={t("mnt.nextDueAt")} required {...f.register("nextDueAt")} error={err("nextDueAt")} data-testid="schedule-due-at" />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="remindDaysBefore" render={({ field }) => <NumberInput label={t("mnt.remindDays")} required min={0} allowDecimal={false} clampBehavior="none" value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("remindDaysBefore")} />} />
            </Grid.Col>
          </Grid>
          <Controller control={f.control} name="isActive" render={({ field }) => <Switch label={t("common.active")} checked={field.value ?? true} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="schedule-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

