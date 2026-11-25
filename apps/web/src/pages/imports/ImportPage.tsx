import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Alert, Badge, Button, Card, Checkbox, FileButton, Group, Select, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCheck, IconDownload, IconFileSpreadsheet, IconUpload, IconX } from "@tabler/icons-react";
import { api, fileToBase64, saveDownload, type ImportEntity, type ImportJob } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { notifyError } from "../../lib/forms";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 2000;
const STATUS_COLOR: Record<string, string> = { UPLOADED: "yellow", MAPPED: "blue", VALIDATED: "cyan", COMMITTED: "green", FAILED: "red", CANCELLED: "gray" };

/**
 * استيراد Excel: قالب ← رفع ← مطابقة الأعمدة ← تحقق بلا كتابة ← تقرير أخطاء ← اعتماد في معاملة واحدة.
 * المهمة الجارية في الرابط (?job=) فتُستأنف بعد إعادة التحميل.
 */
export function ImportPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.imports) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("imports.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <ImportScreen sid={activeSchool.id} />;
}

function ImportScreen({ sid }: { sid: string }) {
  const { t, locale, fmtDateTime } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const jobId = params.get("job");
  const [entity, setEntity] = useState<ImportEntity | null>(null);
  const [busy, setBusy] = useState("");
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [partial, setPartial] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const entities = useQuery({ queryKey: ["import-entities", sid], queryFn: () => api.imports!.entities(sid) });
  const history = useQuery({ queryKey: ["imports", sid], queryFn: () => api.imports!.list(sid) });
  const job = useQuery({ queryKey: ["import", sid, jobId], queryFn: () => api.imports!.get(sid, jobId!), enabled: !!jobId });
  const j = jobId ? job.data : undefined;
  const allowed = (entities.data ?? []).filter((e) => e.allowed);
  const canCreate = can("imports.create");

  useEffect(() => {
    if (!entity && allowed.length) setEntity(allowed[0]!.entity);
  }, [entity, allowed]);
  useEffect(() => {
    setMapping(j?.mapping ?? {});
    setConfirm(false);
    setPartial(false);
  }, [j?.id, j?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const spec = useMemo(() => entities.data?.find((e) => e.entity === j?.entity), [entities.data, j?.entity]);
  const label = (e: string, key: string) => t(`imp.col.${e}.${key}`);
  const missing = spec ? spec.fields.filter((f) => f.required && mapping[f.key] == null).map((f) => label(spec.entity, f.key)) : [];

  const act = async (name: string, fn: () => Promise<ImportJob | void>) => {
    setBusy(name);
    try {
      const r = await fn();
      if (r && "id" in r) {
        qc.setQueryData(["import", sid, r.id], r);
        if (r.id !== jobId) setParams({ job: r.id });
      }
      await qc.invalidateQueries({ queryKey: ["imports", sid] });
      return r;
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy("");
    }
  };

  const upload = async (file: File | null) => {
    if (!file || !entity) return;
    if (file.size > MAX_BYTES) return setFileError(t("errors.fileTooLarge"));
    if (!/\.xlsx$/i.test(file.name)) return setFileError(t("errors.fileType"));
    setFileError(null);
    await act("upload", async () => api.imports!.upload(sid, entity, file.name, await fileToBase64(file)));
  };

  const commit = async () => {
    const r = await act("commit", () => api.imports!.commit(sid, j!.id, partial));
    if (r) notifications.show({ color: "green", message: t("imp.committed", { n: r.created ?? 0 }) });
  };

  return (
    <Stack>
      <Card>
        <Title order={3}>{t("imp.title")}</Title>
        <Text size="sm" c="dimmed">{t("imp.intro")}</Text>
      </Card>

      {!j && (
        <Card data-testid="import-start">
          <Stack>
            {canCreate && !allowed.length && entities.data && <Alert color="yellow">{t("imp.noPermission")}</Alert>}
            <Select
              label={t("imp.entity")}
              data={(entities.data ?? []).map((e) => ({ value: e.entity, label: t(`imp.entity.${e.entity}`), disabled: !e.allowed }))}
              value={entity}
              onChange={(v) => setEntity(v as ImportEntity)}
              allowDeselect={false}
              maw={420}
              data-testid="import-entity"
            />
            <Group>
              <Button
                variant="light"
                leftSection={<IconDownload size={16} />}
                disabled={!entity}
                loading={busy === "template"}
                onClick={() => act("template", async () => saveDownload(await api.imports!.template(sid, entity!, locale)))}
                data-testid="import-template"
              >
                {t("imp.template")}
              </Button>
              {canCreate && (
                <FileButton onChange={upload} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                  {(props) => (
                    <Button {...props} leftSection={<IconUpload size={16} />} disabled={!entity || !allowed.some((a) => a.entity === entity)} loading={busy === "upload"} data-testid="import-upload">
                      {t("imp.upload")}
                    </Button>
                  )}
                </FileButton>
              )}
            </Group>
            <Text size="xs" c="dimmed">{t("imp.fileHint", { rows: MAX_ROWS })}</Text>
            {fileError && <Text size="sm" c="red">{fileError}</Text>}
          </Stack>
        </Card>
      )}

      {jobId && job.isError && <Alert color="red">{t("errors.notFound")}</Alert>}

      {j && spec && (
        <Card data-testid="import-job">
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <IconFileSpreadsheet size={20} />
              <Text fw={700}>{t(`imp.entity.${j.entity}`)}</Text>
              <Text size="sm" c="dimmed" dir="auto">{j.fileName}</Text>
              <Badge color={STATUS_COLOR[j.status]} data-testid="import-status">{t(`imp.status.${j.status}`)}</Badge>
            </Group>
            <Group gap="xs">
              {!["COMMITTED", "CANCELLED"].includes(j.status) && canCreate && (
                <Button size="xs" variant="subtle" color="gray" leftSection={<IconX size={14} />} loading={busy === "cancel"} onClick={() => act("cancel", () => api.imports!.cancel(sid, j.id))}>
                  {t("imp.cancel")}
                </Button>
              )}
              <Button size="xs" variant="light" onClick={() => setParams({})} data-testid="import-new">
                {t("imp.newImport")}
              </Button>
            </Group>
          </Group>

          {["UPLOADED", "MAPPED", "VALIDATED"].includes(j.status) && (
            <Stack gap="xs">
              <Title order={5}>{t("imp.mapping")}</Title>
              <Text size="sm" c="dimmed">{t("imp.mappingHint")}</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="xs">
                {spec.fields.map((f) => (
                  <Select
                    key={f.key}
                    size="xs"
                    label={label(j.entity, f.key) + (f.required ? " *" : "")}
                    data={[{ value: "", label: t("imp.notMapped") }, ...(j.headers ?? []).map((h, i) => ({ value: String(i), label: h || `#${i + 1}` }))]}
                    value={mapping[f.key] == null ? "" : String(mapping[f.key])}
                    onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v ? Number(v) : null }))}
                    allowDeselect={false}
                    disabled={!canCreate}
                    data-testid={`map-${f.key}`}
                  />
                ))}
              </SimpleGrid>
              {missing.length > 0 && <Alert color="orange" py={6}>{t("imp.missingRequired", { fields: missing.join("، ") })}</Alert>}
              {canCreate && (
                <Group>
                  <Button loading={busy === "validate"} disabled={missing.length > 0} onClick={() => act("validate", () => api.imports!.validate(sid, j.id, mapping))} data-testid="import-validate">
                    {t("imp.validate")}
                  </Button>
                  <Text size="xs" c="dimmed">{t("imp.validateHint")}</Text>
                </Group>
              )}
            </Stack>
          )}

          {(j.status === "VALIDATED" || j.status === "COMMITTED") && (
            <Stack gap="sm" mt="md">
              <Title order={5}>{t("imp.summary")}</Title>
              <SimpleGrid cols={3} maw={520} data-testid="import-summary">
                <Stat label={t("imp.total")} value={j.totalRows ?? 0} />
                <Stat label={t("imp.accepted")} value={j.acceptedRows ?? 0} color="green" testId="import-accepted" />
                <Stat label={t("imp.rejected")} value={j.rejectedRows ?? 0} color={(j.rejectedRows ?? 0) > 0 ? "red" : undefined} testId="import-rejected" />
              </SimpleGrid>
              {(j.errors ?? []).length > 0 && (
                <>
                  <Group justify="space-between">
                    <Text fw={600}>{t("imp.errorsTitle")}</Text>
                    <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} loading={busy === "errors"} onClick={() => act("errors", async () => saveDownload(await api.imports!.errorsFile(sid, j.id, locale)))} data-testid="import-errors-file">
                      {t("imp.errorsFile")}
                    </Button>
                  </Group>
                  <div className="max-h-80 overflow-auto">
                    <Table fz="xs" striped withTableBorder stickyHeader data-testid="import-errors">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{t("imp.row")}</Table.Th>
                          <Table.Th>{t("imp.field")}</Table.Th>
                          <Table.Th>{t("imp.problem")}</Table.Th>
                          <Table.Th>{t("imp.value")}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {j.errors!.map((e, i) => (
                          <Table.Tr key={i}>
                            <Table.Td>{e.row}</Table.Td>
                            <Table.Td>{e.field ? label(j.entity, e.field) : ""}</Table.Td>
                            <Table.Td>{t(e.code)}</Table.Td>
                            <Table.Td dir="auto">{e.value ?? ""}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </div>
                  {(j.errorCount ?? 0) > (j.errors ?? []).length && <Text size="xs" c="dimmed">{t("imp.errorsMore", { n: j.errors!.length })}</Text>}
                </>
              )}
              {j.status === "VALIDATED" && canCreate && (j.acceptedRows ?? 0) > 0 && (
                <Stack gap="xs">
                  {(j.rejectedRows ?? 0) > 0 && <Checkbox label={t("imp.acceptPartial")} checked={partial} onChange={(e) => setPartial(e.currentTarget.checked)} data-testid="import-partial" />}
                  {!confirm ? (
                    <Group>
                      <Button color="green" leftSection={<IconCheck size={16} />} disabled={(j.rejectedRows ?? 0) > 0 && !partial} onClick={() => setConfirm(true)} data-testid="import-commit">
                        {t("imp.commit")}
                      </Button>
                    </Group>
                  ) : (
                    <Alert color="green" title={t("imp.commit")}>
                      <Text size="sm" mb="xs">{t("imp.commitConfirm", { n: j.acceptedRows ?? 0 })}</Text>
                      <Group>
                        <Button color="green" size="xs" loading={busy === "commit"} onClick={commit} data-testid="import-commit-confirm">
                          {t("common.confirm")}
                        </Button>
                        <Button size="xs" variant="subtle" onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
                      </Group>
                    </Alert>
                  )}
                </Stack>
              )}
              {j.status === "COMMITTED" && (
                <Alert color="green" icon={<IconCheck size={18} />} data-testid="import-done">
                  {t("imp.committed", { n: j.acceptedRows ?? 0 })}
                  {j.committedAt ? ` — ${fmtDateTime(j.committedAt)}` : ""}
                </Alert>
              )}
            </Stack>
          )}
        </Card>
      )}

      <Card>
        <Title order={5} mb="sm">{t("imp.history")}</Title>
        {(history.data ?? []).length === 0 ? (
          <Text size="sm" c="dimmed">{t("imp.noHistory")}</Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table fz="sm" highlightOnHover data-testid="import-history">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("imp.entity")}</Table.Th>
                  <Table.Th>{t("imp.file")}</Table.Th>
                  <Table.Th>{t("imp.total")}</Table.Th>
                  <Table.Th>{t("imp.accepted")}</Table.Th>
                  <Table.Th>{t("imp.rejected")}</Table.Th>
                  <Table.Th />
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.data!.map((h) => (
                  <Table.Tr key={h.id} className="cursor-pointer" onClick={() => setParams({ job: h.id })}>
                    <Table.Td>{t(`imp.entity.${h.entity}`)}</Table.Td>
                    <Table.Td dir="auto">{h.fileName}</Table.Td>
                    <Table.Td>{h.totalRows ?? "—"}</Table.Td>
                    <Table.Td>{h.acceptedRows ?? "—"}</Table.Td>
                    <Table.Td>{h.rejectedRows ?? "—"}</Table.Td>
                    <Table.Td>
                      <Badge color={STATUS_COLOR[h.status]} variant="light">{t(`imp.status.${h.status}`)}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">{fmtDateTime(h.createdAt)}</Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}

function Stat({ label, value, color, testId }: { label: string; value: number; color?: string; testId?: string }) {
  return (
    <Card withBorder padding="sm">
      <Text size="xs" c="dimmed">{label}</Text>
      <Text fw={800} size="xl" c={color} data-testid={testId}>{value}</Text>
    </Card>
  );
}
