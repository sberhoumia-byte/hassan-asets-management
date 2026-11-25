import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Group, Pagination, SegmentedControl, Select, Table, Text, TextInput, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { IconPlus, IconSearch } from "@tabler/icons-react";
import { api, type Asset, type AssetStatus } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { AssetFormModal } from "./AssetFormModal";
import { AssetDetailModal } from "./AssetDetailModal";

export const STATUS_COLOR: Record<AssetStatus, string> = { AVAILABLE: "green", DAMAGED: "red", UNDER_REPAIR: "orange", DISPOSED: "gray" };
const PAGE_SIZE = 25;

/** شاشة الممتلكات والتجهيزات (المادة 6): قائمة مع بحث وتصفية، إضافة وتعديل، تفاصيل مع QR وسجل. */
export function AssetsPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.assets) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("assets.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <AssetsScreen schoolId={activeSchool.id} />;
}

function AssetsScreen({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const nav = useNavigate();
  const { id: openId } = useParams();
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [archived, setArchived] = useState("active");
  const [page, setPage] = useState(1);
  const [params, setParams] = useSearchParams();
  // ?new=1 (الإجراء السريع في لوحة القيادة) يفتح نموذج الإضافة مباشرة
  const [form, setForm] = useState<null | { asset?: Asset }>(() => (params.get("new") && can("assets.create") ? {} : null));
  useEffect(() => {
    if (params.get("new")) setParams({}, { replace: true });
  }, []);

  useEffect(() => setPage(1), [dq, categoryId, status, archived]);

  const list = useQuery({
    queryKey: ["assets", schoolId, dq, categoryId, status, archived, page],
    queryFn: () => api.assets!.list(schoolId, { q: dq, categoryId: categoryId ?? undefined, status: status ?? undefined, archived: archived === "archived", page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.assets")}</Title>
            <Text size="sm" c="dimmed">{t("assets.intro")}</Text>
          </div>
          {can("assets.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setForm({})} data-testid="add-asset">
              {t("assets.add")}
            </Button>
          )}
        </Group>
      </Card>

      <Card>
        <Group gap="sm" align="flex-end" wrap="wrap">
          <TextInput
            className="min-w-[220px] flex-1"
            leftSection={<IconSearch size={16} />}
            placeholder={t("assets.searchPh")}
            aria-label={t("common.search")}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            data-testid="asset-search"
          />
          <Select className="w-[230px]" placeholder={t("assets.category")} aria-label={t("assets.category")} data={cat.categoryOptions} value={categoryId} onChange={setCategoryId} clearable searchable />
          <Select
            className="w-[170px]"
            placeholder={t("assets.status")}
            aria-label={t("assets.status")}
            data={(["AVAILABLE", "DAMAGED", "UNDER_REPAIR"] as const).map((s) => ({ value: s, label: t(`assetStatus.${s}`) }))}
            value={status}
            onChange={setStatus}
            clearable
            disabled={archived === "archived"}
          />
          <SegmentedControl
            value={archived}
            onChange={setArchived}
            data={[
              { value: "active", label: t("assets.active") },
              { value: "archived", label: t("assets.archived") },
            ]}
          />
        </Group>
      </Card>

      <Card>
        {list.isError && <Alert color="red">{t("errors.unexpected")}</Alert>}
        <Table.ScrollContainer minWidth={820}>
          <Table striped highlightOnHover verticalSpacing="sm" data-testid="assets-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("assets.inventoryNumber")}</Table.Th>
                <Table.Th>{t("assets.name")}</Table.Th>
                <Table.Th>{t("assets.category")}</Table.Th>
                <Table.Th>{t("assets.quantity")}</Table.Th>
                <Table.Th>{t("assets.status")}</Table.Th>
                <Table.Th>{t("assets.acquisitionDate")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.items ?? []).map((a) => (
                <Table.Tr key={a.id} className="cursor-pointer" onClick={() => nav(`/assets/${a.id}`)} data-testid={`asset-row-${a.inventoryNumber}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{a.inventoryNumber}</Table.Td>
                  <Table.Td fw={600}>{a.name}</Table.Td>
                  <Table.Td>{a.category ? cat.catName(a.category as { nameAr: string; nameFr?: string }) : ""}</Table.Td>
                  <Table.Td>{a.quantity}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={STATUS_COLOR[a.status]}>{t(`assetStatus.${a.status}`)}</Badge>
                  </Table.Td>
                  <Table.Td>{a.acquisitionDate ? fmtDate(a.acquisitionDate) : "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {data && data.total === 0 && (
          <Text c="dimmed" ta="center" py="lg" data-testid="assets-empty">
            {dq || categoryId || status ? t("common.noResults") : archived === "archived" ? t("assets.noArchived") : t("assets.empty")}
          </Text>
        )}
        {data && data.total > 0 && (
          <Group justify="space-between" mt="md">
            <Text size="sm" c="dimmed">{t("common.totalCount", { n: data.total })}</Text>
            {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
          </Group>
        )}
      </Card>

      {form && <AssetFormModal schoolId={schoolId} asset={form.asset} onClose={() => setForm(null)} onSaved={(a) => { setForm(null); nav(`/assets/${a.id}`); }} />}
      {openId && !form && <AssetDetailModal schoolId={schoolId} id={openId} onClose={() => nav("/assets")} onEdit={(a) => setForm({ asset: a })} />}
    </>
  );
}
