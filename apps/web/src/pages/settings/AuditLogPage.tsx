import { Alert, Badge, Card, Code, Group, Modal, Pagination, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type AuditEntry, type AuditQuery } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";

const PAGE = 50;

/** سجل التدقيق: قراءة فقط، تصفية بالمستخدم والفعل ونوع الكيان والفترة، وعرض القيم قبل وبعد. */
export function AuditLogPage() {
  const { t, fmtDateTime } = useI18n();
  const { activeSchool, can } = useAuth();
  const sid = activeSchool?.id ?? "";
  const [f, setF] = useState<Omit<AuditQuery, "page" | "pageSize">>({});
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const allowed = !!api.audit && !!sid && can("audit.view");
  const facets = useQuery({ queryKey: ["audit-facets", sid], queryFn: () => api.audit!.facets(sid), enabled: allowed });
  const q = { ...f, page, pageSize: PAGE };
  const list = useQuery({ queryKey: ["audit", sid, q], queryFn: () => api.audit!.list(sid, q), enabled: allowed });
  if (!api.audit) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;
  if (!allowed) return <Alert color="red" mt="md">{t("errors.forbidden")}</Alert>;
  const set = (k: keyof typeof f, v: string | null) => {
    setPage(1);
    setF((x) => ({ ...x, [k]: v || undefined }));
  };
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE)) : 1;

  return (
    <Stack mt="md">
      <Card>
        <Text size="sm" c="dimmed" mb="sm">{t("audit.intro")}</Text>
        <Group gap="sm" wrap="wrap" data-testid="audit-filters">
          <Select placeholder={t("audit.user")} data={(facets.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))} value={f.userId ?? null} onChange={(v) => set("userId", v)} clearable searchable w={220} />
          <Select placeholder={t("audit.action")} data={facets.data?.actions ?? []} value={f.action ?? null} onChange={(v) => set("action", v)} clearable searchable w={230} data-testid="audit-action" />
          <Select placeholder={t("audit.entity")} data={facets.data?.entityTypes ?? []} value={f.entityType ?? null} onChange={(v) => set("entityType", v)} clearable searchable w={200} />
          <TextInput type="date" aria-label={t("audit.from")} value={f.from ?? ""} onChange={(e) => set("from", e.currentTarget.value)} w={160} />
          <TextInput type="date" aria-label={t("audit.to")} value={f.to ?? ""} onChange={(e) => set("to", e.currentTarget.value)} w={160} />
        </Group>
      </Card>
      <Card>
        <Group justify="space-between" mb="xs">
          <Text size="sm" c="dimmed">{t("audit.total", { n: list.data?.total ?? 0 })}</Text>
          <Badge variant="light" color="gray">{t("audit.readOnly")}</Badge>
        </Group>
        <Table.ScrollContainer minWidth={760}>
          <Table fz="xs" striped highlightOnHover data-testid="audit-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("audit.at")}</Table.Th>
                <Table.Th>{t("audit.user")}</Table.Th>
                <Table.Th>{t("audit.action")}</Table.Th>
                <Table.Th>{t("audit.entity")}</Table.Th>
                <Table.Th>{t("audit.summary")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data?.items ?? []).map((r) => (
                <Table.Tr key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <Table.Td>{fmtDateTime(r.at)}</Table.Td>
                  <Table.Td>{r.user ?? "—"}</Table.Td>
                  <Table.Td dir="ltr"><Code>{r.action}</Code></Table.Td>
                  <Table.Td dir="ltr">{r.entityType}</Table.Td>
                  <Table.Td>{summary(r)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {pages > 1 && <Pagination mt="sm" total={pages} value={page} onChange={setPage} size="sm" />}
      </Card>
      <Modal opened={!!open} onClose={() => setOpen(null)} size="xl" title={open ? `${open.action} · ${fmtDateTime(open.at)}` : ""}>
        {open && (
          <Stack gap="xs" data-testid="audit-detail">
            <Text size="sm">{t("audit.user")}: {open.user ?? "—"}</Text>
            <Text size="sm" dir="ltr" ta="start">{open.entityType} {open.entityId ?? ""} · IP {open.ip ?? "—"} · {open.requestId ?? ""}</Text>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="min-w-0">
                <Text size="xs" fw={700}>{t("audit.before")}</Text>
                <Code block dir="ltr" className="max-h-80 overflow-auto">{open.before ? JSON.stringify(open.before, null, 2) : "—"}</Code>
              </div>
              <div className="min-w-0">
                <Text size="xs" fw={700}>{t("audit.after")}</Text>
                <Code block dir="ltr" className="max-h-80 overflow-auto">{open.after ? JSON.stringify(open.after, null, 2) : "—"}</Code>
              </div>
            </div>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

function summary(r: AuditEntry): string {
  const a = (r.after ?? {}) as Record<string, unknown>;
  return String(a.nameAr ?? a.title ?? a.number ?? a.username ?? a.code ?? "").slice(0, 80);
}
