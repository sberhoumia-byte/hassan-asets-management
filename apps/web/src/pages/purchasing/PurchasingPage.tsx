import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, Loader, Modal, NumberInput, Pagination, Select, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { PO_TARGETS, purchaseOrderSchema, type PurchaseOrderInput } from "@hassan/validation";
import { api, type PoStatus, type PurchaseOrder } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, fmtMoney, handleFormError } from "../../lib/forms";

const PAGE_SIZE = 25;
export const PO_COLOR: Record<PoStatus, string> = {
  NEED_RECORDED: "gray",
  ESTIMATED: "cyan",
  PENDING_APPROVAL: "yellow",
  APPROVED: "teal",
  REJECTED: "red",
  ORDERED: "blue",
  PARTIALLY_DELIVERED: "orange",
  DELIVERED: "green",
  INVOICED: "indigo",
  CLOSED: "dark",
  CANCELLED: "red",
};
export function PoStatusBadge({ status }: { status: PoStatus }) {
  const { t } = useI18n();
  return (
    <Badge color={PO_COLOR[status]} variant={status === "CANCELLED" || status === "REJECTED" ? "outline" : "light"} data-testid="po-status">
      {t(`poStatus.${status}`)}
    </Badge>
  );
}

/** الطلبيات والاقتناء (المادة 17): من تسجيل الحاجة إلى الأرشفة، بمسار مصادقة يُختار حسب مصدر التمويل. */
export function PurchasingPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.purchasing) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("purchasing.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <PurchasingScreen schoolId={activeSchool.id} />;
}

function PurchasingScreen({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<string | null>("open");
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(() => !!params.get("new") && can("purchasing.create"));
  const query = { status: status ?? undefined, q: dq, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ["purchase-orders", schoolId, query], queryFn: () => api.purchasing!.list(schoolId, query) });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const statuses: PoStatus[] = ["NEED_RECORDED", "ESTIMATED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ORDERED", "PARTIALLY_DELIVERED", "DELIVERED", "INVOICED", "CLOSED", "CANCELLED"];
  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.purchasing")}</Title>
            <Text size="sm" c="dimmed">{t("po.intro")}</Text>
          </div>
          {can("purchasing.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} data-testid="new-po">
              {t("po.new")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Group gap="sm" mb="md">
          <TextInput className="min-w-[200px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("po.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} />
          <Select
            w={220}
            placeholder={t("loans.view.all")}
            clearable
            data={[{ value: "open", label: t("po.openOnly") }, ...statuses.map((s) => ({ value: s, label: t(`poStatus.${s}`) }))]}
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            aria-label={t("assets.status")}
            data-testid="po-status-filter"
          />
        </Group>
        <Table.ScrollContainer minWidth={860}>
          <Table striped highlightOnHover verticalSpacing="sm" data-testid="po-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("po.number")}</Table.Th>
                <Table.Th>{t("po.title")}</Table.Th>
                <Table.Th>{t("po.supplier")}</Table.Th>
                <Table.Th>{t("po.estimatedTotal")}</Table.Th>
                <Table.Th>{t("po.createdAt")}</Table.Th>
                <Table.Th>{t("assets.status")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data?.items ?? []).map((p) => (
                <Table.Tr key={p.id} style={{ cursor: "pointer" }} onClick={() => nav(`/purchasing/${p.id}`)} data-testid={`po-row-${p.number}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{p.number}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{p.title}</Text>
                    <Text size="xs" c="dimmed">{t("po.itemsN", { n: p.items.length })}</Text>
                  </Table.Td>
                  <Table.Td>{p.supplier ?? "—"}</Table.Td>
                  <Table.Td>{p.estimatedTotal !== undefined ? `${fmtMoney(p.estimatedTotal)} ${t("unit.mad")}` : "—"}</Table.Td>
                  <Table.Td>{fmtDate(p.createdAt)}</Table.Td>
                  <Table.Td><PoStatusBadge status={p.status} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.isLoading && <Loader size="sm" />}
        {list.data && list.data.items.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("po.empty")}</Text>}
        {list.data && (
          <Group justify="space-between" mt="sm">
            <Text size="sm" c="dimmed">{t("common.totalCount", { n: list.data.total })}</Text>
            {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
          </Group>
        )}
      </Card>
      {creating && (
        <PoFormModal
          schoolId={schoolId}
          onClose={() => {
            setCreating(false);
            if (params.get("new")) setParams({}, { replace: true });
          }}
          onSaved={(id) => nav(`/purchasing/${id}`)}
        />
      )}
    </>
  );
}

export function PoFormModal({ schoolId, po, onClose, onSaved }: { schoolId: string; po?: PurchaseOrder; onClose: () => void; onSaved: (id: string) => unknown }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const stockItems = useQuery({ queryKey: ["stock-items", schoolId, "po"], queryFn: () => api.stock!.items(schoolId), enabled: can("stock.view") });
  const f = useForm<PurchaseOrderInput>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: po
      ? {
          title: po.title,
          needDescription: po.needDescription ?? "",
          fundingSourceId: po.fundingSourceId ?? "",
          budgetLine: po.budgetLine ?? "",
          supplierId: po.supplierId ?? "",
          items: po.items.map((i) => ({ description: i.description, quantity: i.quantity, unitId: i.unitId ?? "", estimatedUnitCost: i.estimatedUnitCost ?? null, targetKind: i.targetKind, inventoryItemId: i.inventoryItemId ?? "" })),
        }
      : { title: "", needDescription: "", fundingSourceId: "", budgetLine: "", supplierId: "", items: [{ description: "", quantity: 1, unitId: "", estimatedUnitCost: null, targetKind: "ASSET", inventoryItemId: "" }] },
  });
  const err = fieldError(f, t);
  const items = useFieldArray({ control: f.control, name: "items" });
  const watched = f.watch("items");
  const total = watched.reduce((s, i) => s + (i.estimatedUnitCost ?? 0) * (Number(i.quantity) || 0), 0);
  const submit = f.handleSubmit(async (v) => {
    try {
      const id = po ? (await api.purchasing!.update(schoolId, po.id, v), po.id) : (await api.purchasing!.create(schoolId, v)).id;
      await qc.invalidateQueries({ queryKey: ["purchase-orders", schoolId] });
      await qc.invalidateQueries({ queryKey: ["po", schoolId, id] });
      await onSaved(id);
    } catch (e) {
      handleFormError(f, t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={po ? `${t("common.edit")} — ${po.number}` : t("po.new")} size="xl" centered>
      <form onSubmit={submit} noValidate data-testid="po-form">
        <Stack>
          <TextInput label={t("po.title")} required {...f.register("title")} error={err("title")} data-testid="po-title" />
          <Textarea label={t("po.need")} autosize minRows={2} {...f.register("needDescription")} error={err("needDescription")} />
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="fundingSourceId" render={({ field }) => <Select label={t("po.funding")} description={t("po.fundingHint")} clearable data={cat.lookupOptions("FUNDING_SOURCE")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("fundingSourceId")} data-testid="po-funding" />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label={t("po.budgetLine")} {...f.register("budgetLine")} error={err("budgetLine")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller control={f.control} name="supplierId" render={({ field }) => <Select label={t("po.supplierSuggested")} clearable searchable data={cat.supplierOptions} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("supplierId")} />} />
            </Grid.Col>
          </Grid>
          <Text fw={600} size="sm">{t("po.items")}</Text>
          {typeof f.formState.errors.items?.message === "string" && <Text c="red" size="sm">{t(f.formState.errors.items.message)}</Text>}
          {items.fields.map((it, k) => (
            <Card key={it.id} withBorder p="xs" data-testid={`po-item-${k}`}>
              <Grid gutter="xs" align="flex-end">
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <TextInput label={t("po.itemDescription")} required {...f.register(`items.${k}.description`)} error={err(`items.${k}.description`)} data-testid={`po-item-desc-${k}`} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                  <Controller control={f.control} name={`items.${k}.targetKind`} render={({ field }) => <Select label={t("po.targetKind")} data={PO_TARGETS.map((x) => ({ value: x, label: t(`poTarget.${x}`) }))} value={field.value} onChange={(x) => field.onChange(x ?? "ASSET")} data-testid={`po-item-kind-${k}`} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                  <Controller control={f.control} name={`items.${k}.quantity`} render={({ field }) => <NumberInput label={t("assets.quantity")} required min={0} clampBehavior="none" value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err(`items.${k}.quantity`)} data-testid={`po-item-qty-${k}`} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 6, md: 2 }}>
                  <Controller control={f.control} name={`items.${k}.estimatedUnitCost`} render={({ field }) => <NumberInput label={t("po.unitCost")} min={0} decimalScale={2} value={field.value ?? ""} onChange={(x) => field.onChange(x === "" ? null : Number(x))} error={err(`items.${k}.estimatedUnitCost`)} data-testid={`po-item-cost-${k}`} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 5, md: 1 }}>
                  <Controller control={f.control} name={`items.${k}.unitId`} render={({ field }) => <Select label={t("stock.unit")} clearable data={cat.lookupOptions("UNIT_OF_MEASURE")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} />} />
                </Grid.Col>
                <Grid.Col span={{ base: 1, md: 1 }}>
                  <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} disabled={items.fields.length === 1} onClick={() => items.remove(k)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Grid.Col>
                {watched[k]?.targetKind === "STOCK" && (
                  <Grid.Col span={12}>
                    <Controller
                      control={f.control}
                      name={`items.${k}.inventoryItemId`}
                      render={({ field }) => (
                        <Select
                          label={t("po.stockItem")}
                          description={can("stock.view") ? undefined : t("po.stockItemNoPerm")}
                          required
                          searchable
                          data={(stockItems.data ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                          value={field.value || null}
                          onChange={(x) => field.onChange(x ?? "")}
                          error={err(`items.${k}.inventoryItemId`)}
                          data-testid={`po-item-stock-${k}`}
                        />
                      )}
                    />
                  </Grid.Col>
                )}
              </Grid>
            </Card>
          ))}
          <Group justify="space-between">
            <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => items.append({ description: "", quantity: 1, unitId: "", estimatedUnitCost: null, targetKind: "ASSET", inventoryItemId: "" })} data-testid="po-add-item">
              {t("po.addItem")}
            </Button>
            <Text size="sm" fw={600}>{t("po.estimatedTotal")}: {fmtMoney(total)} {t("unit.mad")}</Text>
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="po-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
