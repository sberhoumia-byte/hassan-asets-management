import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Group, Loader, Modal, Pagination, Select, Stack, Table, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconFileText, IconPlus, IconSearch } from "@tabler/icons-react";
import { CUSTODY_ACTIONS, custodySchema, type CustodyInput } from "@hassan/validation";
import { api, type Asset, type CustodyAction } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { usePlaces } from "../../hooks/usePlaces";
import { AssetPicker } from "../../components/AssetPicker";
import { fieldError, handleFormError, newOpId, today } from "../../lib/forms";

const PAGE_SIZE = 25;
export const ACTION_COLOR: Record<CustodyAction, string> = { HANDOVER: "blue", ASSIGNMENT: "indigo", RELOCATION: "teal", TRANSFER: "violet", RETURN: "gray" };
/** العمليات التي تتطلب مستلِماً (موظفاً). */
const NEEDS_STAFF: CustodyAction[] = ["HANDOVER", "ASSIGNMENT", "TRANSFER"];

/** العهدة (المادة 18): كل تسليم أو إسناد أو نقل أو تحويل أو إرجاع سطر دائم برقم، ويحدّث بطاقة الممتلك ويظهر في سجله. */
export function CustodyPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.custody) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("custody.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <CustodyScreen schoolId={activeSchool.id} />;
}

function CustodyScreen({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const places = usePlaces();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [action, setAction] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(() => !!params.get("new") && can("custody.create"));
  const query = { action: action ?? undefined, staffId: staffId ?? undefined, assetId: params.get("asset") ?? undefined, q: dq, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ["custody", schoolId, query], queryFn: () => api.custody!.list(schoolId, query) });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.custody")}</Title>
            <Text size="sm" c="dimmed">{t("custody.intro")}</Text>
          </div>
          {can("custody.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} data-testid="new-custody">
              {t("custody.new")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Group gap="sm" mb="md">
          <TextInput className="min-w-[200px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("custody.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} />
          <Select w={190} placeholder={t("custody.action")} clearable data={CUSTODY_ACTIONS.map((a) => ({ value: a, label: t(`custodyAction.${a}`) }))} value={action} onChange={(v) => { setAction(v); setPage(1); }} aria-label={t("custody.action")} />
          <Select w={220} placeholder={t("custody.staff")} clearable searchable data={places.staffOptions} value={staffId} onChange={(v) => { setStaffId(v); setPage(1); }} aria-label={t("custody.staff")} />
          {params.get("asset") && (
            <Button variant="subtle" size="xs" onClick={() => setParams({}, { replace: true })}>{t("custody.allAssets")}</Button>
          )}
        </Group>
        <Table.ScrollContainer minWidth={900}>
          <Table striped verticalSpacing="sm" data-testid="custody-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("custody.number")}</Table.Th>
                <Table.Th>{t("custody.date")}</Table.Th>
                <Table.Th>{t("custody.action")}</Table.Th>
                <Table.Th>{t("custody.asset")}</Table.Th>
                <Table.Th>{t("custody.fromTo")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data?.items ?? []).map((r) => (
                <Table.Tr key={r.id} data-testid={`custody-row-${r.number}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{r.number}</Table.Td>
                  <Table.Td>{fmtDate(`${r.occurredAt.slice(0, 10)}T12:00:00`)}</Table.Td>
                  <Table.Td><Badge color={ACTION_COLOR[r.action]} variant="light">{t(`custodyAction.${r.action}`)}</Badge></Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{r.asset.name}</Text>
                    <Text size="xs" c="dimmed" dir="ltr" style={{ textAlign: "start" }}>{r.asset.inventoryNumber}</Text>
                  </Table.Td>
                  <Table.Td>
                    {(r.fromStaff || r.toStaff) && <Text size="sm">{r.fromStaff ?? "—"} ← {r.toStaff ?? "—"}</Text>}
                    {r.toRoom && <Text size="xs" c="dimmed">{r.fromRoom ?? "—"} ← {r.toRoom}</Text>}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={t("custody.report")}>
                      <ActionIcon variant="subtle" aria-label={t("custody.report")} onClick={() => nav(`/custody/${r.id}/report`)} data-testid={`custody-report-${r.number}`}>
                        <IconFileText size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.isLoading && <Loader size="sm" />}
        {list.data && list.data.items.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("custody.empty")}</Text>}
        {list.data && (
          <Group justify="space-between" mt="sm">
            <Text size="sm" c="dimmed">{t("common.totalCount", { n: list.data.total })}</Text>
            {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
          </Group>
        )}
      </Card>
      {creating && (
        <CustodyFormModal
          schoolId={schoolId}
          presetAssetId={params.get("asset") ?? undefined}
          onClose={() => {
            setCreating(false);
            if (params.get("new")) setParams({}, { replace: true });
          }}
          onSaved={async (id) => {
            await Promise.all(["custody", "assets", "asset", "staff"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
            nav(`/custody/${id}/report`);
          }}
        />
      )}
    </>
  );
}

function CustodyFormModal({ schoolId, presetAssetId, onClose, onSaved }: { schoolId: string; presetAssetId?: string; onClose: () => void; onSaved: (id: string) => unknown }) {
  const { t } = useI18n();
  const places = usePlaces();
  const opId = useMemo(newOpId, []);
  const [asset, setAsset] = useState<Asset | undefined>();
  const f = useForm<CustodyInput>({
    resolver: zodResolver(custodySchema),
    defaultValues: { action: "ASSIGNMENT", assetId: presetAssetId ?? "", toStaffId: "", toRoomId: "", occurredAt: today(), notes: "", clientOpId: opId },
  });
  const err = fieldError(f, t);
  const action = f.watch("action");
  const submit = f.handleSubmit(async (v) => {
    try {
      const r = await api.custody!.create(schoolId, v);
      await onSaved(r.id);
    } catch (e) {
      handleFormError(f, t, e, { SAME_CUSTODIAN: "toStaffId", SAME_ROOM: "toRoomId", NO_CURRENT_CUSTODIAN: "action", ASSET_ARCHIVED: "assetId" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={t("custody.new")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="custody-form">
        <Stack>
          <Controller
            control={f.control}
            name="action"
            render={({ field }) => (
              <Select label={t("custody.action")} required data={CUSTODY_ACTIONS.map((a) => ({ value: a, label: t(`custodyAction.${a}`) }))} value={field.value} onChange={(x) => field.onChange(x ?? "ASSIGNMENT")} error={err("action")} description={t(`custodyHint.${action}`)} data-testid="custody-action" />
            )}
          />
          <Controller
            control={f.control}
            name="assetId"
            render={({ field }) => (
              <AssetPicker
                schoolId={schoolId}
                label={t("custody.asset")}
                required
                value={field.value}
                onChange={(id, a) => {
                  field.onChange(id);
                  setAsset(a);
                }}
                error={err("assetId")}
                testId="custody-asset"
              />
            )}
          />
          {asset && (
            <Alert variant="light" color="gray" p="xs">
              <Text size="sm">{t("custody.current")}: {asset.responsible ?? t("custody.noCustodian")} · {asset.room ?? t("custody.noRoom")}</Text>
            </Alert>
          )}
          {NEEDS_STAFF.includes(action) && (
            <Controller
              control={f.control}
              name="toStaffId"
              render={({ field }) => <Select label={t("custody.toStaff")} required searchable data={places.staffOptions} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("toStaffId")} data-testid="custody-to-staff" />}
            />
          )}
          <Controller
            control={f.control}
            name="toRoomId"
            render={({ field }) => (
              <Select
                label={action === "RELOCATION" ? t("custody.toRoom") : t("custody.toRoomOptional")}
                required={action === "RELOCATION"}
                clearable
                searchable
                data={places.roomOptions}
                value={field.value || null}
                onChange={(x) => field.onChange(x ?? "")}
                error={err("toRoomId")}
                data-testid="custody-to-room"
              />
            )}
          />
          <TextInput type="date" label={t("custody.date")} max={today()} {...f.register("occurredAt")} error={err("occurredAt")} />
          <Textarea label={t("stock.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="custody-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
