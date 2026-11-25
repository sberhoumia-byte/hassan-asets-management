import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Center, Grid, Group, Loader, Modal, NumberInput, Paper, Progress, SegmentedControl, Select, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowBack, IconCheck, IconClipboardList, IconEdit, IconFileText, IconQrcode, IconSearch } from "@tabler/icons-react";
import { api, ApiError, type InventoryLine, type InventoryMove, type InventorySession } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { usePlaces } from "../../hooks/usePlaces";
import { fmtQty, newOpId, notifyError } from "../../lib/forms";
import { InventoryStatusBadge, SessionFormModal } from "./InventoryPage";

const ISSUE_COLOR: Record<string, string> = { MISSING: "red", NOT_COUNTED: "gray", SURPLUS: "orange", UNEXPECTED: "grape", MISPLACED: "yellow" };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** دورة جرد واحدة: الإجراءات حسب الحالة، العدّ (يدوياً أو بمسح QR)، والفروقات. */
export function InventorySessionPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  const { id = "" } = useParams();
  if (!api.inventory) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("inventory.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <SessionScreen schoolId={activeSchool.id} id={id} />;
}

function SessionScreen({ schoolId, id }: { schoolId: string; id: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const s = useQuery({ queryKey: ["inv-session", schoolId, id], queryFn: () => api.inventory!.get(schoolId, id) });
  const [editing, setEditing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const reload = () => Promise.all(["inv-session", "inv-lines", "inv-disc", "inventory"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  if (s.isError) return <Alert color="red">{t(s.error instanceof ApiError && s.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>;
  if (!s.data)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  const d = s.data;
  const move = async (m: InventoryMove) => {
    setBusy(m);
    try {
      await api.inventory!.move(schoolId, id, m);
      await reload();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(null);
    }
  };
  const actions: { key: InventoryMove | "validate" | "edit"; show: boolean; color?: string; variant?: string }[] = [
    { key: "edit", show: d.status === "DRAFT" && can("inventory.update"), variant: "default" },
    { key: "open", show: d.status === "DRAFT" && can("inventory.update") },
    { key: "complete", show: d.status === "OPEN" && can("inventory.update") },
    { key: "reopen", show: d.status === "COUNTING_DONE" && can("inventory.update"), variant: "default" },
    { key: "validate", show: d.status === "COUNTING_DONE" && can("inventory.validate"), color: "green" },
    { key: "close", show: d.status === "VALIDATED" && can("inventory.validate"), color: "dark" },
    { key: "archive", show: d.status === "CLOSED" && can("inventory.archive"), variant: "default" },
  ];
  return (
    <>
      <Card>
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <ActionIcon variant="subtle" aria-label={t("doc.back")} onClick={() => nav("/inventory")}>
                <IconArrowBack size={18} />
              </ActionIcon>
              <Title order={4}>
                {t(`invType.${d.type}`)} — <span dir="ltr">{d.number}</span>
              </Title>
              <InventoryStatusBadge status={d.status} />
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              {fmtDate(`${d.startDate}T12:00:00`)} — {fmtDate(`${d.endDate}T12:00:00`)} · {d.rooms.length ? d.rooms.map((r) => r.label).join("، ") : t("inv.wholeSchool")}
              {d.includesStock ? ` · ${t("inv.withStock")}` : ""}
            </Text>
            {d.assignees.length > 0 && <Text size="xs" c="dimmed">{t("inv.assignees")}: {d.assignees.map((a) => a.name).join("، ")}</Text>}
          </div>
          <Group gap="xs">
            {actions
              .filter((a) => a.show)
              .map((a) => (
                <Button
                  key={a.key}
                  size="sm"
                  color={a.color}
                  variant={a.variant ?? "filled"}
                  loading={busy === a.key}
                  leftSection={a.key === "edit" ? <IconEdit size={16} /> : a.key === "validate" ? <IconCheck size={16} /> : undefined}
                  onClick={() => (a.key === "edit" ? setEditing(true) : a.key === "validate" ? setValidating(true) : move(a.key))}
                  data-testid={`inv-${a.key}`}
                >
                  {t(`invAction.${a.key}`)}
                </Button>
              ))}
            {d.status !== "DRAFT" && (
              <Button size="sm" variant="light" leftSection={<IconFileText size={16} />} onClick={() => nav(`/inventory/${id}/report`)} data-testid="inv-report">
                {t("inv.report")}
              </Button>
            )}
          </Group>
        </Group>
        {d.status !== "DRAFT" && (
          <Group mt="sm" gap="lg">
            <Stack gap={2} style={{ flex: 1, maxWidth: 360 }}>
              <Progress value={d.stats.lines ? (100 * d.stats.counted) / d.stats.lines : 0} />
              <Text size="xs" c="dimmed">{t("inv.countedOf", { c: d.stats.counted, n: d.stats.lines })}</Text>
            </Stack>
            {d.stats.withIssue > 0 && <Badge color="red" variant="light">{t("inv.withIssueN", { n: d.stats.withIssue })}</Badge>}
            {d.validatedBy && <Text size="xs" c="dimmed">{t("inv.validatedBy", { name: d.validatedBy })}</Text>}
          </Group>
        )}
        {d.status === "DRAFT" && <Alert mt="sm" variant="light" color="blue">{t("inv.draftHint")}</Alert>}
      </Card>
      {d.status !== "DRAFT" && (
        <Tabs defaultValue="lines" keepMounted={false}>
          <Tabs.List mb="sm">
            <Tabs.Tab value="lines" leftSection={<IconClipboardList size={16} />}>{t("inv.lines")}</Tabs.Tab>
            <Tabs.Tab value="disc" data-testid="tab-disc">{t("inv.discrepancies")}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="lines">
            <LinesTab schoolId={schoolId} session={d} onCounted={reload} />
          </Tabs.Panel>
          <Tabs.Panel value="disc">
            <DiscrepanciesTab schoolId={schoolId} id={id} />
          </Tabs.Panel>
        </Tabs>
      )}
      {editing && <SessionFormModal schoolId={schoolId} session={d} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {validating && <ValidateModal schoolId={schoolId} session={d} onClose={() => setValidating(false)} onDone={reload} />}
    </>
  );
}

function LinesTab({ schoolId, session, onCounted }: { schoolId: string; session: InventorySession; onCounted: () => unknown }) {
  const { t } = useI18n();
  const places = usePlaces();
  const [filter, setFilter] = useState("all");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [scan, setScan] = useState("");
  const [counting, setCounting] = useState<{ line?: InventoryLine; qrToken?: string } | null>(null);
  const f = { filter: filter === "all" ? undefined : filter, roomId: roomId ?? undefined, q: dq };
  const lines = useQuery({ queryKey: ["inv-lines", schoolId, session.id, f], queryFn: () => api.inventory!.lines(schoolId, session.id, f) });
  const open = session.status === "OPEN";
  const roomOpts = session.rooms.length ? session.rooms.map((r) => ({ value: r.id, label: r.label })) : places.roomOptions;
  const onScan = () => {
    const token = scan.match(UUID)?.[0];
    if (!token) return notifications.show({ color: "red", message: t("errors.qrUnknown") });
    setCounting({ qrToken: token });
    setScan("");
  };
  return (
    <Card>
      {open && (
        <Paper withBorder p="sm" mb="md" radius="md">
          <Group gap="sm" align="flex-end">
            <TextInput
              className="min-w-[240px] flex-1"
              label={t("inv.scan")}
              description={t("inv.scanHint")}
              leftSection={<IconQrcode size={16} />}
              value={scan}
              onChange={(e) => setScan(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onScan();
                }
              }}
              data-testid="inv-scan"
            />
            <Button variant="light" onClick={onScan} data-testid="inv-scan-go">{t("inv.scanGo")}</Button>
          </Group>
        </Paper>
      )}
      <Group gap="sm" mb="md">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          data={[
            { value: "all", label: t("loans.view.all") },
            { value: "pending", label: t("inv.filter.pending") },
            { value: "counted", label: t("inv.filter.counted") },
            { value: "issues", label: t("inv.filter.issues") },
          ]}
          data-testid="inv-filter"
        />
        <TextInput className="min-w-[180px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("inv.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
        <Select w={220} placeholder={t("inv.room")} clearable searchable data={roomOpts} value={roomId} onChange={setRoomId} aria-label={t("inv.room")} />
      </Group>
      <Table.ScrollContainer minWidth={900}>
        <Table striped verticalSpacing="xs" data-testid="inv-lines">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("inv.ref")}</Table.Th>
              <Table.Th>{t("inv.item")}</Table.Th>
              <Table.Th>{t("inv.expectedRoom")}</Table.Th>
              <Table.Th>{t("inv.expected")}</Table.Th>
              <Table.Th>{t("inv.counted")}</Table.Th>
              <Table.Th>{t("inv.foundRoom")}</Table.Th>
              <Table.Th>{t("inv.issues")}</Table.Th>
              {open && <Table.Th />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(lines.data ?? []).map((l) => (
              <Table.Tr key={l.id} data-testid={`line-${l.ref}`}>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-xs">{l.ref}</Table.Td>
                <Table.Td>
                  <Text size="sm" fw={600}>{l.name}</Text>
                  <Text size="xs" c="dimmed">{t(`invKind.${l.kind}`)}{l.notes === "ON_LOAN" ? ` · ${t("inv.onLoan")}` : l.notes ? ` · ${l.notes}` : ""}</Text>
                </Table.Td>
                <Table.Td>{l.expectedRoom ?? "—"}</Table.Td>
                <Table.Td>{fmtQty(l.expectedQty)}</Table.Td>
                <Table.Td fw={600}>{l.countedQty === undefined ? "—" : fmtQty(l.countedQty)}</Table.Td>
                <Table.Td>
                  {l.foundRoom ?? "—"}
                  {l.conditionFound && <Text size="xs" c="dimmed">{l.conditionFound}</Text>}
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {l.issues.map((i) => (
                      <Badge key={i} size="xs" color={ISSUE_COLOR[i]} variant="light">{t(`invIssue.${i}`)}</Badge>
                    ))}
                  </Group>
                </Table.Td>
                {open && (
                  <Table.Td>
                    <Tooltip label={t("inv.count")}>
                      <ActionIcon variant="subtle" aria-label={t("inv.count")} onClick={() => setCounting({ line: l })} data-testid={`count-${l.ref}`}>
                        <IconClipboardList size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {lines.isLoading && <Loader size="sm" />}
      {lines.data && lines.data.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("inv.noLines")}</Text>}
      {counting && <CountModal schoolId={schoolId} session={session} target={counting} onClose={() => setCounting(null)} onDone={onCounted} />}
    </Card>
  );
}

function CountModal({ schoolId, session, target, onClose, onDone }: { schoolId: string; session: InventorySession; target: { line?: InventoryLine; qrToken?: string }; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const places = usePlaces();
  const opId = useMemo(newOpId, []);
  const l = target.line;
  const [qty, setQty] = useState<number | "">(l ? (l.countedQty ?? l.expectedQty) : 1);
  const [room, setRoom] = useState<string | null>(l ? (l.foundRoomId ?? l.expectedRoomId ?? null) : null);
  const [condition, setCondition] = useState(l?.conditionFound ?? "");
  const [notes, setNotes] = useState(l?.notes && l.notes !== "ON_LOAN" ? l.notes : "");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (qty === "" || qty < 0) return setError(t("errors.nonNegative"));
    setBusy(true);
    try {
      const r = await api.inventory!.count(schoolId, session.id, { lineId: l?.id ?? "", qrToken: target.qrToken ?? "", countedQty: Number(qty), foundRoomId: room ?? "", conditionFound: condition, notes, clientOpId: opId });
      notifications.show({ color: r.unexpected ? "grape" : "green", message: t(r.unexpected ? "inv.countedUnexpected" : "inv.countSaved") });
      await onDone();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "QR_UNKNOWN") setError(t("errors.qrUnknown"));
      else notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={l ? `${t("inv.count")} — ${l.name}` : t("inv.countByQr")} centered>
      <Stack data-testid="count-form">
        {l ? (
          <Text size="sm">
            <span dir="ltr">{l.ref}</span> · {t("inv.expected")}: {fmtQty(l.expectedQty)}
            {l.expectedRoom ? ` · ${l.expectedRoom}` : ""}
          </Text>
        ) : (
          <Text size="sm" dir="ltr" className="font-mono">{target.qrToken}</Text>
        )}
        <NumberInput label={t("inv.counted")} required min={0} clampBehavior="none" value={qty} onChange={(x) => { setQty(x === "" ? "" : Number(x)); setError(undefined); }} error={error} data-testid="count-qty" />
        <Select label={t("inv.foundRoom")} clearable searchable data={places.roomOptions} value={room} onChange={setRoom} data-testid="count-room" />
        <TextInput label={t("inv.condition")} value={condition} onChange={(e) => setCondition(e.currentTarget.value)} data-testid="count-condition" />
        <Textarea label={t("stock.notes")} autosize minRows={2} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} loading={busy} data-testid="count-save">{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DiscrepanciesTab({ schoolId, id }: { schoolId: string; id: string }) {
  const { t } = useI18n();
  const d = useQuery({ queryKey: ["inv-disc", schoolId, id], queryFn: () => api.inventory!.discrepancies(schoolId, id) });
  if (!d.data) return <Loader size="sm" />;
  const groups = [
    { key: "missing", color: "red" },
    { key: "misplaced", color: "yellow" },
    { key: "surplus", color: "orange" },
    { key: "unexpected", color: "grape" },
    { key: "notCounted", color: "gray" },
    { key: "condition", color: "blue" },
  ] as const;
  return (
    <Stack>
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        {groups.map((g) => (
          <Paper key={g.key} withBorder p="sm" radius="md" data-testid={`disc-${g.key}`}>
            <Text size="xs" c="dimmed">{t(`invDisc.${g.key}`)}</Text>
            <Text fw={700} fz="xl" c={d.data[g.key].length ? g.color : undefined}>{d.data[g.key].length}</Text>
          </Paper>
        ))}
      </SimpleGrid>
      {groups
        .filter((g) => d.data[g.key].length > 0)
        .map((g) => (
          <Card key={g.key}>
            <Text fw={700} mb="xs">{t(`invDisc.${g.key}`)}</Text>
            <Table verticalSpacing={4}>
              <Table.Tbody>
                {d.data[g.key].map((l) => (
                  <Table.Tr key={l.id}>
                    <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-xs" w={160}>{l.ref}</Table.Td>
                    <Table.Td>{l.name}</Table.Td>
                    <Table.Td>{t("inv.expected")}: {fmtQty(l.expectedQty)} · {t("inv.counted")}: {l.countedQty === undefined ? "—" : fmtQty(l.countedQty)}</Table.Td>
                    <Table.Td>{g.key === "misplaced" ? `${l.expectedRoom ?? "—"} ← ${l.foundRoom ?? "—"}` : g.key === "condition" ? l.conditionFound : ""}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        ))}
      {Object.values(d.data).every((v) => !Array.isArray(v) || v.length === 0) && (
        <Alert color="green" variant="light">{t("inv.noDiscrepancies")}</Alert>
      )}
    </Stack>
  );
}

function ValidateModal({ schoolId, session, onClose, onDone }: { schoolId: string; session: InventorySession; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!notes.trim()) return setError(t("errors.required"));
    setBusy(true);
    try {
      await api.inventory!.validate(schoolId, session.id, notes);
      await onDone();
      onClose();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={`${t("invAction.validate")} — ${session.number}`} size="lg" centered>
      <Stack>
        <Text size="sm">{t("inv.validateHint")}</Text>
        <Grid>
          <Grid.Col span={12}>
            <Textarea label={t("inv.reportNotes")} required autosize minRows={4} value={notes} onChange={(e) => { setNotes(e.currentTarget.value); setError(undefined); }} error={error} data-testid="inv-report-notes" />
          </Grid.Col>
        </Grid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color="green" onClick={go} loading={busy} data-testid="inv-validate-confirm">{t("invAction.validate")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
