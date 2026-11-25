import { useState } from "react";
import { useSearchParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Switch, Table, Tabs, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import {
  IconAdjustments,
  IconArrowBackUp,
  IconArrowsExchange,
  IconChevronDown,
  IconEdit,
  IconLogin2,
  IconLogout2,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { api, type StockItem, type StockLevel, type Warehouse } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { fmtQty } from "../../lib/forms";
import { MovementModal, type MovementKind } from "./MovementModal";
import { ItemFormModal, WarehouseFormModal } from "./StockForms";
import { MovementsTab } from "./MovementsTab";
import { AlertsTab } from "./AlertsTab";

export const LEVEL_COLOR: Record<StockLevel, string> = { ok: "green", low: "orange", out: "red" };

/** شاشة المخزون (المادة 7): المواد وأرصدتها، الحركات، المخازن، التنبيهات. */
export function StockPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.stock) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("stock.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <StockScreen schoolId={activeSchool.id} />;
}

function StockScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "items";
  const alerts = useQuery({ queryKey: ["stock-alerts", schoolId], queryFn: () => api.stock!.alerts(schoolId) });
  const alertCount = alerts.data ? alerts.data.out.length + alerts.data.low.length + alerts.data.expiring.length : 0;

  return (
    <>
      <Card>
        <Title order={4}>{t("nav.stock")}</Title>
        <Text size="sm" c="dimmed">{t("stock.intro")}</Text>
      </Card>
      <Tabs value={tab} onChange={(v) => v && setParams({ tab: v }, { replace: true })} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="items" data-testid="tab-items">{t("stock.tab.items")}</Tabs.Tab>
          <Tabs.Tab value="movements" data-testid="tab-movements">{t("stock.tab.movements")}</Tabs.Tab>
          <Tabs.Tab value="warehouses" data-testid="tab-warehouses">{t("stock.tab.warehouses")}</Tabs.Tab>
          <Tabs.Tab value="alerts" data-testid="tab-alerts" rightSection={alertCount > 0 ? <Badge size="xs" color="red" circle>{alertCount}</Badge> : undefined}>
            {t("stock.tab.alerts")}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="items" pt="md">
          <ItemsTab schoolId={schoolId} />
        </Tabs.Panel>
        <Tabs.Panel value="movements" pt="md">
          <MovementsTab schoolId={schoolId} />
        </Tabs.Panel>
        <Tabs.Panel value="warehouses" pt="md">
          <WarehousesTab schoolId={schoolId} />
        </Tabs.Panel>
        <Tabs.Panel value="alerts" pt="md">
          <AlertsTab data={alerts.data} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}

export function useStockRefs(schoolId: string, includeInactive = false) {
  const items = useQuery({ queryKey: ["stock-items", schoolId, includeInactive], queryFn: () => api.stock!.items(schoolId, { all: includeInactive }) });
  const warehouses = useQuery({ queryKey: ["warehouses", schoolId], queryFn: () => api.stock!.warehouses(schoolId) });
  return { items: items.data ?? [], warehouses: warehouses.data ?? [], loading: items.isLoading || warehouses.isLoading, error: items.isError || warehouses.isError };
}

function ItemsTab({ schoolId }: { schoolId: string }) {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const [showInactive, setShowInactive] = useState(false);
  const { items, warehouses, error } = useStockRefs(schoolId, showInactive);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 200);
  const [mv, setMv] = useState<null | { kind: MovementKind; itemId?: string }>(null);
  const [edit, setEdit] = useState<null | { item?: StockItem }>(null);
  const shown = items.filter((i) => !dq || `${i.code} ${i.name}`.toLowerCase().includes(dq.toLowerCase()));
  const whName = new Map(warehouses.map((w) => [w.id, w.name]));
  const unit = (i: StockItem) => (locale === "fr" && i.unitFr ? i.unitFr : (i.unitAr ?? ""));
  const canMove = can("stock.create");
  const noWarehouse = warehouses.filter((w) => w.isActive).length === 0;

  return (
    <Card>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Group gap="sm">
          <TextInput leftSection={<IconSearch size={16} />} placeholder={t("stock.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => setQ(e.currentTarget.value)} />
          <Switch label={t("stock.showInactive")} checked={showInactive} onChange={(e) => setShowInactive(e.currentTarget.checked)} />
        </Group>
        <Group gap="sm">
          {can("stock.create") && (
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-item">
              {t("stock.addItem")}
            </Button>
          )}
          {canMove && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button rightSection={<IconChevronDown size={16} />} disabled={noWarehouse || items.length === 0} data-testid="new-movement">
                  {t("stock.newMovement")}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconLogin2 size={16} />} onClick={() => setMv({ kind: "in" })} data-testid="mv-in">{t("stock.mv.in")}</Menu.Item>
                <Menu.Item leftSection={<IconLogout2 size={16} />} onClick={() => setMv({ kind: "out" })} data-testid="mv-out">{t("stock.mv.out")}</Menu.Item>
                <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={() => setMv({ kind: "return" })} data-testid="mv-return">{t("stock.mv.return")}</Menu.Item>
                <Menu.Item leftSection={<IconArrowsExchange size={16} />} onClick={() => setMv({ kind: "transfer" })} disabled={warehouses.filter((w) => w.isActive).length < 2} data-testid="mv-transfer">
                  {t("stock.mv.transfer")}
                </Menu.Item>
                {can("stock.adjust") && (
                  <Menu.Item leftSection={<IconAdjustments size={16} />} onClick={() => setMv({ kind: "adjust" })} data-testid="mv-adjust">{t("stock.mv.adjust")}</Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </Group>
      {noWarehouse && <Alert color="yellow" mb="md">{t("stock.noWarehouseHint")}</Alert>}
      {error && <Alert color="red">{t("errors.unexpected")}</Alert>}
      <Table.ScrollContainer minWidth={820}>
        <Table striped highlightOnHover verticalSpacing="sm" data-testid="items-table">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("stock.code")}</Table.Th>
              <Table.Th>{t("stock.itemName")}</Table.Th>
              <Table.Th>{t("stock.total")}</Table.Th>
              <Table.Th>{t("stock.minQuantity")}</Table.Th>
              <Table.Th>{t("stock.byWarehouse")}</Table.Th>
              <Table.Th>{t("stock.level")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shown.map((i) => (
              <Table.Tr key={i.id} data-testid={`item-row-${i.code}`} className={i.isActive ? "" : "opacity-60"}>
                <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{i.code}</Table.Td>
                <Table.Td fw={600}>
                  {i.name}
                  {!i.isActive && <Badge ms={6} size="xs" color="gray">{t("common.inactive")}</Badge>}
                </Table.Td>
                <Table.Td data-testid={`item-total-${i.code}`}>
                  <b>{fmtQty(i.total)}</b> <Text span size="xs" c="dimmed">{unit(i)}</Text>
                </Table.Td>
                <Table.Td>{fmtQty(i.minQuantity)}</Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {i.balances.filter((b) => b.quantity !== 0).map((b) => (
                      <Badge key={b.warehouseId} size="sm" variant="outline" color="gray">
                        {whName.get(b.warehouseId)}: {fmtQty(b.quantity)}
                      </Badge>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge size="sm" variant="light" color={LEVEL_COLOR[i.level]} data-testid={`item-level-${i.code}`}>{t(`stock.levelName.${i.level}`)}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={2} justify="flex-end" wrap="nowrap">
                    {canMove && i.isActive && !noWarehouse && (
                      <>
                        <Tooltip label={t("stock.mv.in")}>
                          <ActionIcon variant="subtle" color="green" aria-label={t("stock.mv.in")} onClick={() => setMv({ kind: "in", itemId: i.id })}>
                            <IconLogin2 size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t("stock.mv.out")}>
                          <ActionIcon variant="subtle" color="orange" aria-label={t("stock.mv.out")} onClick={() => setMv({ kind: "out", itemId: i.id })} disabled={i.total <= 0}>
                            <IconLogout2 size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </>
                    )}
                    {can("stock.update") && (
                      <Tooltip label={t("common.edit")}>
                        <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ item: i })}>
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
      {shown.length === 0 && <Text c="dimmed" ta="center" py="lg">{dq ? t("common.noResults") : t("stock.noItems")}</Text>}
      {mv && <MovementModal schoolId={schoolId} kind={mv.kind} itemId={mv.itemId} items={items} warehouses={warehouses} onClose={() => setMv(null)} />}
      {edit && <ItemFormModal schoolId={schoolId} item={edit.item} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function WarehousesTab({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { warehouses, items } = useStockRefs(schoolId, true);
  const [edit, setEdit] = useState<null | { w?: Warehouse }>(null);
  const totals = new Map<string, number>();
  for (const i of items) for (const b of i.balances) if (b.quantity) totals.set(b.warehouseId, (totals.get(b.warehouseId) ?? 0) + 1);
  return (
    <Card>
      <Group justify="space-between" mb="md">
        <Text size="sm" c="dimmed">{t("stock.warehousesIntro")}</Text>
        {can("stock.create") && (
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-warehouse">
            {t("stock.addWarehouse")}
          </Button>
        )}
      </Group>
      <Table striped verticalSpacing="sm" data-testid="warehouses-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("stock.code")}</Table.Th>
            <Table.Th>{t("stock.warehouseName")}</Table.Th>
            <Table.Th>{t("stock.itemsStored")}</Table.Th>
            <Table.Th>{t("users.status")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {warehouses.map((w) => (
            <Table.Tr key={w.id}>
              <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{w.code}</Table.Td>
              <Table.Td fw={600}>{w.name}</Table.Td>
              <Table.Td>{totals.get(w.id) ?? 0}</Table.Td>
              <Table.Td>
                <Badge size="sm" color={w.isActive ? "green" : "gray"}>{t(w.isActive ? "common.active" : "common.inactive")}</Badge>
              </Table.Td>
              <Table.Td>
                {can("stock.update") && (
                  <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ w })}>
                    <IconEdit size={16} />
                  </ActionIcon>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {warehouses.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("stock.noWarehouses")}</Text>}
      {edit && <WarehouseFormModal schoolId={schoolId} warehouse={edit.w} onClose={() => setEdit(null)} />}
    </Card>
  );
}
