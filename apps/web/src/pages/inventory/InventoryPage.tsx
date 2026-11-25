import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Checkbox, Grid, Group, Loader, Modal, MultiSelect, Progress, Select, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconPlus } from "@tabler/icons-react";
import { INVENTORY_TYPES, inventorySessionSchema, type InventorySessionInput } from "@hassan/validation";
import { api, type InventorySession, type InventoryStatus } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { usePlaces } from "../../hooks/usePlaces";
import { fieldError, handleFormError, today } from "../../lib/forms";

export const INV_STATUS_COLOR: Record<InventoryStatus, string> = { DRAFT: "gray", OPEN: "blue", COUNTING_DONE: "orange", VALIDATED: "green", CLOSED: "dark", ARCHIVED: "gray" };

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  const { t } = useI18n();
  return (
    <Badge color={INV_STATUS_COLOR[status]} variant={status === "ARCHIVED" ? "outline" : "light"} data-testid="inv-status">
      {t(`invStatus.${status}`)}
    </Badge>
  );
}

/** الجرد المادي (المادة 15): دورات سنوية أو دورية أو استثنائية، تُفتح بلقطة نظرية ثابتة ثم يُعدّ الموجود فعلياً. */
export function InventoryPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.inventory) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("inventory.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <InventoryScreen schoolId={activeSchool.id} />;
}

function InventoryScreen({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(() => !!params.get("new") && can("inventory.create"));
  const list = useQuery({ queryKey: ["inventory", schoolId], queryFn: () => api.inventory!.list(schoolId) });
  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.inventory")}</Title>
            <Text size="sm" c="dimmed">{t("inv.intro")}</Text>
          </div>
          {can("inventory.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} data-testid="new-inv">
              {t("inv.new")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Table.ScrollContainer minWidth={860}>
          <Table striped highlightOnHover verticalSpacing="sm" data-testid="inv-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("inv.number")}</Table.Th>
                <Table.Th>{t("inv.type")}</Table.Th>
                <Table.Th>{t("inv.period")}</Table.Th>
                <Table.Th>{t("inv.scope")}</Table.Th>
                <Table.Th>{t("inv.progress")}</Table.Th>
                <Table.Th>{t("assets.status")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data ?? []).map((s) => (
                <Table.Tr key={s.id} style={{ cursor: "pointer" }} onClick={() => nav(`/inventory/${s.id}`)} data-testid={`inv-row-${s.number}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{s.number}</Table.Td>
                  <Table.Td>{t(`invType.${s.type}`)}</Table.Td>
                  <Table.Td>{fmtDate(`${s.startDate}T12:00:00`)} — {fmtDate(`${s.endDate}T12:00:00`)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{s.rooms.length ? t("inv.roomsN", { n: s.rooms.length }) : t("inv.wholeSchool")}</Text>
                    {s.includesStock && <Text size="xs" c="dimmed">{t("inv.withStock")}</Text>}
                  </Table.Td>
                  <Table.Td w={180}>
                    {s.status === "DRAFT" ? (
                      "—"
                    ) : (
                      <Stack gap={2}>
                        <Progress value={s.stats.lines ? (100 * s.stats.counted) / s.stats.lines : 0} size="sm" />
                        <Text size="xs" c="dimmed">{t("inv.countedOf", { c: s.stats.counted, n: s.stats.lines })}</Text>
                      </Stack>
                    )}
                  </Table.Td>
                  <Table.Td><InventoryStatusBadge status={s.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.isLoading && <Loader size="sm" />}
        {list.data && list.data.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("inv.empty")}</Text>}
      </Card>
      {creating && (
        <SessionFormModal
          schoolId={schoolId}
          onClose={() => {
            setCreating(false);
            if (params.get("new")) setParams({}, { replace: true });
          }}
          onSaved={async (id) => {
            setCreating(false);
            nav(`/inventory/${id}`);
          }}
        />
      )}
    </>
  );
}

export function SessionFormModal({ schoolId, session, onClose, onSaved }: { schoolId: string; session?: InventorySession; onClose: () => void; onSaved: (id: string) => unknown }) {
  const { t } = useI18n();
  const places = usePlaces();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["inv-assignable", schoolId], queryFn: () => api.inventory!.assignable(schoolId) });
  const f = useForm<InventorySessionInput>({
    resolver: zodResolver(inventorySessionSchema),
    defaultValues: session
      ? { type: session.type, startDate: session.startDate, endDate: session.endDate, includesStock: session.includesStock, roomIds: session.rooms.map((r) => r.id), assigneeIds: session.assignees.map((a) => a.id) }
      : { type: "ANNUAL", startDate: today(), endDate: today(), includesStock: true, roomIds: [], assigneeIds: [] },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      const id = session ? (await api.inventory!.update(schoolId, session.id, v), session.id) : (await api.inventory!.create(schoolId, v)).id;
      await qc.invalidateQueries({ queryKey: ["inventory", schoolId] });
      await qc.invalidateQueries({ queryKey: ["inv-session", schoolId, id] });
      await onSaved(id);
    } catch (e) {
      handleFormError(f, t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={session ? `${t("common.edit")} — ${session.number}` : t("inv.new")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="inv-form">
        <Stack>
          <Controller control={f.control} name="type" render={({ field }) => <Select label={t("inv.type")} required data={INVENTORY_TYPES.map((x) => ({ value: x, label: t(`invType.${x}`) }))} value={field.value} onChange={(x) => field.onChange(x ?? "ANNUAL")} data-testid="inv-type" />} />
          <Grid gutter="sm">
            <Grid.Col span={6}>
              <TextInput type="date" label={t("inv.startDate")} required {...f.register("startDate")} error={err("startDate")} />
            </Grid.Col>
            <Grid.Col span={6}>
              <TextInput type="date" label={t("inv.endDate")} required {...f.register("endDate")} error={err("endDate")} data-testid="inv-end" />
            </Grid.Col>
          </Grid>
          <Controller
            control={f.control}
            name="roomIds"
            render={({ field }) => <MultiSelect label={t("inv.rooms")} description={t("inv.roomsHint")} searchable clearable data={places.roomOptions} value={field.value} onChange={field.onChange} error={err("roomIds")} data-testid="inv-rooms" />}
          />
          <Controller
            control={f.control}
            name="assigneeIds"
            render={({ field }) => (
              <MultiSelect label={t("inv.assignees")} description={t("inv.assigneesHint")} searchable clearable data={(users.data ?? []).map((u) => ({ value: u.id, label: u.fullNameAr }))} value={field.value} onChange={field.onChange} error={err("assigneeIds")} data-testid="inv-assignees" />
            )}
          />
          <Controller control={f.control} name="includesStock" render={({ field }) => <Checkbox label={t("inv.includesStock")} checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="inv-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
