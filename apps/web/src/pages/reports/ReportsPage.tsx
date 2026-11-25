import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Code,
  Group,
  Loader,
  Pagination,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArchive, IconDownload, IconEye, IconFileSpreadsheet, IconFileTypePdf, IconSearch } from "@tabler/icons-react";
import { reportFiltersSchema, type ReportFilters } from "@hassan/validation";
import { api, ApiError, saveDownload, type DocLang, type ReportInfo } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { usePlaces } from "../../hooks/usePlaces";
import { notifyError } from "../../lib/forms";

const GROUPS = ["assets", "stock", "spaces", "resources", "maintenance", "purchasing", "custody", "inventory", "general"] as const;
const ARCHIVE_PAGE = 20;

/**
 * التقارير (المادتان 22 و23): كتالوج حسب الصلاحيات، مرشحات خاصة بكل تقرير، معاينة بنفس قالب PDF،
 * تنزيل PDF (Chromium على الخادم) أو Excel؛ كل ملف يُؤرشف برقم وبصمة ويظهر في تبويب الأرشيف.
 */
export function ReportsPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.reports) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("reports.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <ReportsScreen schoolId={activeSchool.id} />;
}

function ReportsScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "archive" ? "archive" : "generate";
  return (
    <Stack>
      <Card>
        <Title order={3}>{t("reports.title")}</Title>
        <Text size="sm" c="dimmed">{t("reports.intro")}</Text>
      </Card>
      <Tabs value={tab} onChange={(v) => setParams(v === "archive" ? { tab: "archive" } : {})} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="generate" leftSection={<IconFileTypePdf size={16} />} data-testid="tab-generate">
            {t("reports.tabs.generate")}
          </Tabs.Tab>
          <Tabs.Tab value="archive" leftSection={<IconArchive size={16} />} data-testid="tab-archive">
            {t("reports.tabs.archive")}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="generate" pt="md">
          <Generator schoolId={schoolId} initialKey={params.get("key") ?? undefined} />
        </Tabs.Panel>
        <Tabs.Panel value="archive" pt="md">
          <ArchiveList schoolId={schoolId} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

// =====================================================================
function Generator({ schoolId, initialKey }: { schoolId: string; initialKey?: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["reports", schoolId], queryFn: () => api.reports!.catalog(schoolId) });
  const [key, setKey] = useState<string | null>(initialKey ?? null);
  const [lang, setLang] = useState<DocLang>(locale === "fr" ? "fr" : "ar");
  const [filters, setFilters] = useState<ReportFilters>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [html, setHtml] = useState<{ html: string; rows: number } | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "pdf" | "xlsx">("");

  const list = catalog.data ?? [];
  const def = list.find((r) => r.key === key);
  useEffect(() => {
    if (!key && list.length) setKey(list[0]!.key);
  }, [key, list]);
  // تغيير التقرير يمسح المرشحات والمعاينة السابقة
  useEffect(() => {
    setFilters(key === "ANNUAL" ? { year: new Date().getFullYear() } : {});
    setErrors({});
    setHtml(null);
  }, [key]);

  const options = GROUPS.map((g) => ({
    group: t(`reports.group.${g}`),
    items: list.filter((r) => r.group === g).map((r) => ({ value: r.key, label: t(`rpt.title.${r.key}`) })),
  })).filter((g) => g.items.length);

  /** التحقق محلياً بنفس مخطط الخادم قبل الإرسال. */
  const valid = (): ReportFilters | null => {
    const r = reportFiltersSchema.safeParse(filters);
    if (r.success) {
      setErrors({});
      return r.data;
    }
    const e: Record<string, string> = {};
    for (const i of r.error.issues) e[String(i.path[0] ?? "_")] ??= i.message;
    setErrors(e);
    return null;
  };
  const fail = (e: unknown) => {
    const fields = e instanceof ApiError && e.code === "VALIDATION_ERROR" ? (e.details as { fields?: Record<string, string> } | undefined)?.fields : undefined;
    if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k.replace(/^filters\./, ""), v])));
    else notifyError(t, e);
  };

  const run = async (kind: "preview" | "pdf" | "xlsx") => {
    if (!def) return;
    const f = valid();
    if (!f) return;
    setBusy(kind);
    try {
      if (kind === "preview") {
        const p = await api.reports!.preview(schoolId, def.key, lang, f);
        setHtml({ html: p.html, rows: p.rowCount });
      } else {
        const d = kind === "pdf" ? await api.reports!.pdf(schoolId, def.key, lang, f) : await api.reports!.xlsx(schoolId, def.key, lang, f);
        saveDownload(d);
        notifications.show({ color: "green", message: t("reports.generated", { n: d.number }), id: "report-generated" });
        void qc.invalidateQueries({ queryKey: ["report-archive", schoolId] });
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  };

  if (catalog.isLoading)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  if (!list.length) return <Alert color="gray">{t("reports.none")}</Alert>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <Card>
        <Stack gap="sm">
          <Select label={t("reports.choose")} data={options} value={key} onChange={setKey} allowDeselect={false} searchable maxDropdownHeight={420} data-testid="report-select" />
          {def && <Text size="sm" c="dimmed" data-testid="report-desc">{t(`rpt.desc.${def.key}`)}</Text>}
          <div>
            <Text size="sm" fw={500} mb={4}>{t("reports.lang")}</Text>
            <SegmentedControl
              fullWidth
              value={lang}
              onChange={(v) => setLang(v as DocLang)}
              data={[
                { value: "ar", label: t("reports.lang.ar") },
                { value: "fr", label: t("reports.lang.fr") },
              ]}
              data-testid="report-lang"
            />
          </div>
          {def && <FilterFields def={def} schoolId={schoolId} value={filters} onChange={setFilters} errors={errors} />}
          <Group grow gap="xs">
            <Button variant="default" leftSection={<IconEye size={16} />} loading={busy === "preview"} disabled={!!busy && busy !== "preview"} onClick={() => run("preview")} data-testid="report-preview-btn">
              {t("reports.preview")}
            </Button>
          </Group>
          <Group grow gap="xs">
            <Tooltip label={t("reports.needPrint")} disabled={!!def?.canPrint}>
              <Button leftSection={<IconFileTypePdf size={16} />} loading={busy === "pdf"} disabled={!def?.canPrint || (!!busy && busy !== "pdf")} onClick={() => run("pdf")} data-testid="report-pdf-btn">
                {t("reports.pdf")}
              </Button>
            </Tooltip>
            <Tooltip label={t("reports.needExport")} disabled={!!def?.canExport}>
              <Button color="teal" leftSection={<IconFileSpreadsheet size={16} />} loading={busy === "xlsx"} disabled={!def?.canExport || (!!busy && busy !== "xlsx")} onClick={() => run("xlsx")} data-testid="report-xlsx-btn">
                {t("reports.xlsx")}
              </Button>
            </Tooltip>
          </Group>
        </Stack>
      </Card>
      <Card padding={0} className="overflow-hidden">
        {html ? (
          <>
            <Group justify="space-between" px="md" py="xs" className="border-b border-[var(--line)]">
              <Text size="sm" c="dimmed">{t("reports.previewHint")}</Text>
              <Badge variant="light" data-testid="report-rows">{t("reports.rows", { n: html.rows })}</Badge>
            </Group>
            {/* المعاينة في إطار معزول: بلا سكربتات ولا وصول للصفحة الأم */}
            <iframe title={t("reports.preview")} srcDoc={html.html} sandbox="" className="block w-full border-0 bg-[#dde3ec]" style={{ height: "78vh" }} data-testid="report-preview" />
          </>
        ) : (
          <Center h={360} p="md">
            <Stack align="center" gap={6}>
              <IconEye size={30} color="#9aa7ba" />
              <Text size="sm" c="dimmed" ta="center">{def ? t(`rpt.desc.${def.key}`) : ""}</Text>
            </Stack>
          </Center>
        )}
      </Card>
    </div>
  );
}

// =====================================================================
function FilterFields({ def, schoolId, value, onChange, errors }: { def: ReportInfo; schoolId: string; value: ReportFilters; onChange: (f: ReportFilters) => void; errors: Record<string, string> }) {
  const { t, locale } = useI18n();
  const places = usePlaces();
  const has = (k: string) => def.filters.includes(k);
  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) => onChange({ ...value, [k]: v === "" || v === null ? undefined : v });
  const err = (k: string) => (errors[k] ? t(errors[k]!) : undefined);
  const cats = useQuery({ queryKey: ["categories", schoolId], queryFn: () => api.catalog!.categories(schoolId), enabled: has("categoryId") && !!api.catalog });
  const whs = useQuery({ queryKey: ["warehouses", schoolId], queryFn: () => api.stock!.warehouses(schoolId), enabled: has("warehouseId") && !!api.stock });
  const sups = useQuery({ queryKey: ["suppliers", schoolId, "all"], queryFn: () => api.suppliers!.list(schoolId), enabled: has("supplierId") && !!api.suppliers });
  const sessions = useQuery({ queryKey: ["inv-sessions", schoolId], queryFn: () => api.inventory!.list(schoolId), enabled: has("sessionId") && !!api.inventory });
  const years = useMemo(() => Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() - i)), []);

  if (!def.filters.length) return <Text size="sm" c="dimmed">{t("reports.noFiltersFor")}</Text>;
  return (
    <Stack gap="xs" data-testid="report-filters">
      <Text size="sm" fw={600}>{t("reports.filters")}</Text>
      {has("sessionId") && (
        <Select
          label={t("rpt.f.sessionId")}
          placeholder={t("reports.chooseSession")}
          data={(sessions.data ?? []).map((s) => ({ value: s.id, label: `${s.number} — ${t(`invType.${s.type}`)}` }))}
          value={value.sessionId ?? null}
          onChange={(v) => set("sessionId", v ?? undefined)}
          error={err("sessionId")}
          required
          data-testid="f-sessionId"
        />
      )}
      {has("year") && (
        <Select label={t("rpt.f.year")} data={years} value={value.year ? String(value.year) : null} onChange={(v) => set("year", v ? Number(v) : undefined)} error={err("year")} allowDeselect={false} data-testid="f-year" />
      )}
      {has("q") && <TextInput label={t("rpt.f.q")} leftSection={<IconSearch size={14} />} value={value.q ?? ""} onChange={(e) => set("q", e.currentTarget.value)} error={err("q")} data-testid="f-q" />}
      {(has("from") || has("to")) && (
        <Group grow gap="xs" align="flex-start">
          <TextInput type="date" label={t("rpt.f.from")} value={value.from ?? ""} onChange={(e) => set("from", e.currentTarget.value)} error={err("from")} data-testid="f-from" />
          <TextInput type="date" label={t("rpt.f.to")} value={value.to ?? ""} onChange={(e) => set("to", e.currentTarget.value)} error={err("to")} data-testid="f-to" />
        </Group>
      )}
      {has("status") && def.statuses && (
        <Select
          label={t("rpt.f.status")}
          placeholder={t("reports.any")}
          data={def.statuses.values.map((v) => ({ value: v, label: t(`${def.statuses!.prefix}.${v}`) }))}
          value={value.status ?? null}
          onChange={(v) => set("status", v ?? undefined)}
          error={err("status")}
          clearable
          data-testid="f-status"
        />
      )}
      {has("categoryId") && (
        <Select
          label={t("rpt.f.categoryId")}
          placeholder={t("reports.any")}
          data={(cats.data ?? []).map((c) => ({ value: c.id, label: locale === "fr" && c.nameFr ? c.nameFr : c.nameAr }))}
          value={value.categoryId ?? null}
          onChange={(v) => set("categoryId", v ?? undefined)}
          error={err("categoryId")}
          clearable
          searchable
          data-testid="f-categoryId"
        />
      )}
      {has("roomId") && (
        <Select label={t("rpt.f.roomId")} placeholder={t("reports.any")} data={places.roomOptions} value={value.roomId ?? null} onChange={(v) => set("roomId", v ?? undefined)} error={err("roomId")} clearable searchable data-testid="f-roomId" />
      )}
      {has("warehouseId") && (
        <Select
          label={t("rpt.f.warehouseId")}
          placeholder={t("reports.any")}
          data={(whs.data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
          value={value.warehouseId ?? null}
          onChange={(v) => set("warehouseId", v ?? undefined)}
          error={err("warehouseId")}
          clearable
          data-testid="f-warehouseId"
        />
      )}
      {has("supplierId") && (
        <Select
          label={t("rpt.f.supplierId")}
          placeholder={t("reports.any")}
          data={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
          value={value.supplierId ?? null}
          onChange={(v) => set("supplierId", v ?? undefined)}
          error={err("supplierId")}
          clearable
          searchable
          data-testid="f-supplierId"
        />
      )}
      {has("includeArchived") && (
        <Checkbox label={t("rpt.f.includeArchived")} checked={!!value.includeArchived} onChange={(e) => set("includeArchived", e.currentTarget.checked || undefined)} data-testid="f-includeArchived" />
      )}
    </Stack>
  );
}

// =====================================================================
const KINDS = ["DOC_LOAN_RECEIPT", "DOC_INVENTORY", "DOC_CUSTODY"];
const kindLabel = (t: (k: string) => string, k: string) => (k.startsWith("DOC_") ? t(`archive.kind.${k}`) : t(`rpt.title.${k}`));
const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

function ArchiveList({ schoolId }: { schoolId: string }) {
  const { t, fmtDateTime } = useI18n();
  const [key, setKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const catalog = useQuery({ queryKey: ["reports", schoolId], queryFn: () => api.reports!.catalog(schoolId) });
  const query = { key: key ?? undefined, q: dq || undefined, page, pageSize: ARCHIVE_PAGE };
  const list = useQuery({ queryKey: ["report-archive", schoolId, query], queryFn: () => api.reports!.archive(schoolId, query) });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / ARCHIVE_PAGE)) : 1;
  const kinds = [...(catalog.data ?? []).map((r) => r.key as string), ...KINDS];

  const download = async (id: string) => {
    setBusy(id);
    try {
      saveDownload(await api.reports!.download(schoolId, id));
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <Alert color="blue" variant="light" mb="sm">{t("archive.note")}</Alert>
      <Group gap="xs" mb="sm">
        <TextInput placeholder={t("archive.search")} leftSection={<IconSearch size={14} />} value={q} onChange={(e) => (setQ(e.currentTarget.value), setPage(1))} className="min-w-[220px] flex-1" data-testid="archive-q" />
        <Select
          placeholder={t("archive.allKinds")}
          data={kinds.map((k) => ({ value: k, label: kindLabel(t, k) }))}
          value={key}
          onChange={(v) => (setKey(v), setPage(1))}
          clearable
          className="min-w-[220px]"
          data-testid="archive-kind"
        />
      </Group>
      {list.isLoading ? (
        <Center py="lg">
          <Loader />
        </Center>
      ) : !list.data?.items.length ? (
        <Text c="dimmed" size="sm" data-testid="archive-empty">{t("archive.empty")}</Text>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover data-testid="archive-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("archive.number")}</Table.Th>
                <Table.Th>{t("archive.title")}</Table.Th>
                <Table.Th>{t("archive.format")}</Table.Th>
                <Table.Th>{t("archive.rows")}</Table.Th>
                <Table.Th>{t("archive.pages")}</Table.Th>
                <Table.Th>{t("archive.size")}</Table.Th>
                <Table.Th>{t("archive.createdAt")}</Table.Th>
                <Table.Th>{t("archive.createdBy")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {list.data.items.map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td dir="ltr" className="whitespace-nowrap">
                    <Tooltip label={<><div>{t("archive.sha")}</div><Code>{r.sha256}</Code></>} multiline w={300}>
                      <span>{r.number}</span>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <div>{r.title}</div>
                    <Text size="xs" c="dimmed">{kindLabel(t, r.reportKey)} · {t(`reports.lang.${r.lang}`)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={r.format === "PDF" ? "red" : "teal"} variant="light">{r.format === "PDF" ? "PDF" : "Excel"}</Badge>
                  </Table.Td>
                  <Table.Td>{r.rowCount}</Table.Td>
                  <Table.Td>{r.pageCount ?? "—"}</Table.Td>
                  <Table.Td dir="ltr" className="whitespace-nowrap">{size(r.sizeBytes)}</Table.Td>
                  <Table.Td className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</Table.Td>
                  <Table.Td>{r.createdBy}</Table.Td>
                  <Table.Td>
                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} loading={busy === r.id} onClick={() => download(r.id)} data-testid={`archive-dl-${r.number}`}>
                      {t("archive.download")}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {pages > 1 && (
        <Group justify="center" mt="md">
          <Pagination value={page} onChange={setPage} total={pages} />
        </Group>
      )}
    </Card>
  );
}
