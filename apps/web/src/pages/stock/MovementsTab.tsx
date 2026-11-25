import { useEffect, useState } from "react";
import { ActionIcon, Badge, Button, Card, Group, Modal, Pagination, Select, Stack, Table, Text, TextInput, Textarea, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArrowBackUpDouble } from "@tabler/icons-react";
import { api, type MovementType, type StockMovement } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { fmtMoney, fmtQty, notifyError } from "../../lib/forms";
import { useStockRefs } from "./StockPage";

const TYPES: MovementType[] = ["IN", "OUT", "RETURN", "TRANSFER_OUT", "TRANSFER_IN", "ADJUSTMENT", "REVERSAL"];
const PAGE_SIZE = 50;

/** سجل الحركات: لا تعديل ولا حذف. التصحيح بحركة عكسية فقط (صلاحية stock.reverse). */
export function MovementsTab({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const { items, warehouses } = useStockRefs(schoolId, true);
  const [itemId, setItemId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [reverse, setReverse] = useState<StockMovement | null>(null);
  useEffect(() => setPage(1), [itemId, warehouseId, type, from, to]);

  const q = useQuery({
    queryKey: ["stock-movements", schoolId, itemId, warehouseId, type, from, to, page],
    queryFn: () => api.stock!.movements(schoolId, { itemId: itemId ?? undefined, warehouseId: warehouseId ?? undefined, type: type ?? undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: (p) => p,
  });
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <Group gap="sm" mb="md" align="flex-end" wrap="wrap">
        <Select className="w-[230px]" placeholder={t("stock.item")} aria-label={t("stock.item")} searchable clearable data={items.map((i) => ({ value: i.id, label: `${i.code} — ${i.name}` }))} value={itemId} onChange={setItemId} />
        <Select className="w-[180px]" placeholder={t("stock.warehouse")} aria-label={t("stock.warehouse")} clearable data={warehouses.map((w) => ({ value: w.id, label: w.name }))} value={warehouseId} onChange={setWarehouseId} />
        <Select className="w-[170px]" placeholder={t("stock.type")} aria-label={t("stock.type")} clearable data={TYPES.map((x) => ({ value: x, label: t(`mvType.${x}`) }))} value={type} onChange={setType} />
        <TextInput type="date" label={t("common.from")} value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
        <TextInput type="date" label={t("common.to")} value={to} onChange={(e) => setTo(e.currentTarget.value)} />
      </Group>
      <Table.ScrollContainer minWidth={980}>
        <Table striped verticalSpacing="xs" data-testid="movements-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("stock.number")}</Table.Th>
              <Table.Th>{t("stock.date")}</Table.Th>
              <Table.Th>{t("stock.type")}</Table.Th>
              <Table.Th>{t("stock.item")}</Table.Th>
              <Table.Th>{t("stock.warehouse")}</Table.Th>
              <Table.Th>{t("stock.quantity")}</Table.Th>
              <Table.Th>{t("stock.details")}</Table.Th>
              <Table.Th>{t("stock.by")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(q.data?.items ?? []).map((m) => (
              <Table.Tr key={m.id} data-testid={`mv-row-${m.number}`} className={m.reversedBy ? "opacity-60" : ""}>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-xs">{m.number}</Table.Td>
                <Table.Td>{fmtDate(m.occurredAt)}</Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={m.direction > 0 ? "green" : "orange"}>{t(`mvType.${m.type}`)}</Badge>
                </Table.Td>
                <Table.Td>{m.item.name}</Table.Td>
                <Table.Td>{m.warehouse.name}</Table.Td>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className={m.direction > 0 ? "text-green-700" : "text-orange-700"}>
                  {m.direction > 0 ? "+" : "−"}
                  {fmtQty(m.quantity)}
                </Table.Td>
                <Table.Td>
                  <Stack gap={0}>
                    {m.reason && <Text size="xs">{m.reason}</Text>}
                    {m.supplier && <Text size="xs" c="dimmed">{t("assets.supplier")}: {m.supplier}</Text>}
                    {m.unitCost !== undefined && <Text size="xs" c="dimmed">{t("stock.unitCost")}: {fmtMoney(m.unitCost)}</Text>}
                    {m.expiryDate && <Text size="xs" c="dimmed">{t("stock.expiryDate")}: {fmtDate(m.expiryDate)}</Text>}
                    {m.reverses && <Text size="xs" c="dimmed">{t("stock.reversesN", { n: m.reverses })}</Text>}
                    {m.reversedBy && <Text size="xs" c="red">{t("stock.reversedByN", { n: m.reversedBy })}</Text>}
                  </Stack>
                </Table.Td>
                <Table.Td><Text size="xs">{m.by}</Text></Table.Td>
                <Table.Td>
                  {can("stock.reverse") && m.type !== "REVERSAL" && !m.reversedBy && (
                    <Tooltip label={t("stock.reverse")}>
                      <ActionIcon variant="subtle" color="red" aria-label={t("stock.reverse")} onClick={() => setReverse(m)} data-testid={`reverse-${m.number}`}>
                        <IconArrowBackUpDouble size={16} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {q.data && q.data.total === 0 && <Text c="dimmed" ta="center" py="lg">{t("stock.noMovements")}</Text>}
      {q.data && q.data.total > 0 && (
        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">{t("common.totalCount", { n: q.data.total })}</Text>
          {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
        </Group>
      )}
      {reverse && <ReverseModal schoolId={schoolId} m={reverse} onClose={() => setReverse(null)} />}
    </Card>
  );
}

function ReverseModal({ schoolId, m, onClose }: { schoolId: string; m: StockMovement; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!reason.trim()) return setError(t("errors.required"));
    setBusy(true);
    try {
      const r = await api.stock!.reverse(schoolId, m.id, reason.trim());
      await Promise.all(["stock-items", "stock-movements", "stock-alerts"].map((k) => qc.invalidateQueries({ queryKey: [k, schoolId] })));
      notifications.show({ color: "green", message: t("stock.recorded", { numbers: r.movements.join("، ") }) });
      onClose();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={t("stock.reverseTitle", { n: m.number })} centered>
      <Stack>
        <Text size="sm">{t(m.transferGroupId ? "stock.reverseTransferBody" : "stock.reverseBody")}</Text>
        <Textarea label={t("stock.reason")} required value={reason} onChange={(e) => setReason(e.currentTarget.value)} error={error} autosize minRows={2} data-testid="reverse-reason" />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color="red" onClick={confirm} loading={busy} data-testid="reverse-confirm">{t("stock.reverse")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
