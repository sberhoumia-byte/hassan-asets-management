import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, FileButton, Grid, Group, Modal, SegmentedControl, Select, Stack, Table, Text, TextInput, Textarea, Title } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArchive, IconArchiveOff, IconDownload, IconEdit, IconFileUpload, IconLock, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { DOCUMENT_MAX_BYTES, documentMetaSchema, type DocumentMetaInput } from "@hassan/validation";
import { api, fileToBase64, saveDownload, type DocumentDetail, type DocumentLinkType } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, handleFormError, notifyError } from "../../lib/forms";

const ACCEPT = "application/pdf,image/png,image/jpeg";
const LINK_TYPES: DocumentLinkType[] = ["ASSET", "SUPPLIER"];
const kb = (n?: number) => (n === undefined ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const todayIso = () => new Date().toISOString().slice(0, 10);

/** فحص أولي في المتصفح (الخادم يتحقق من التوقيع الحقيقي للملف). */
function checkFile(f: File): string | null {
  if (f.size > DOCUMENT_MAX_BYTES) return "errors.fileTooLarge";
  if (!ACCEPT.split(",").includes(f.type)) return "errors.fileType";
  return null;
}

/**
 * الوثائق المرفوعة: فواتير، محاضر، عقود... بإصدارات متتالية لا تُحذف،
 * ربط بالممتلكات والموردين، اطلاع مقيد، وأرشفة بدل الحذف.
 */
export function DocumentsPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.documents) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("documents.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <DocumentsScreen sid={activeSchool.id} />;
}

function DocumentsScreen({ sid }: { sid: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [archived, setArchived] = useState("active");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<null | { doc?: DocumentDetail }>(null);
  const query = { q: dq || undefined, categoryId: categoryId ?? undefined, archived: archived === "archived" };
  const list = useQuery({ queryKey: ["documents", sid, query], queryFn: () => api.documents!.list(sid, query) });
  const reload = () => qc.invalidateQueries({ queryKey: ["documents", sid] });
  const docCats = cat.lookupOptions("DOCUMENT_CATEGORY");

  return (
    <Stack>
      <Card>
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={3}>{t("docs.title")}</Title>
            <Text size="sm" c="dimmed" maw={760}>{t("docs.intro")}</Text>
          </div>
          {can("documents.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setForm({})} data-testid="doc-add">
              {t("docs.add")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Group mb="sm" gap="sm" wrap="wrap">
          <TextInput leftSection={<IconSearch size={16} />} placeholder={t("docs.searchPh")} value={q} onChange={(e) => setQ(e.currentTarget.value)} className="flex-1 min-w-[220px]" data-testid="doc-search" />
          <Select placeholder={t("docs.category")} data={docCats} value={categoryId} onChange={setCategoryId} clearable w={200} />
          <SegmentedControl value={archived} onChange={setArchived} data={[{ value: "active", label: t("docs.active") }, { value: "archived", label: t("docs.archived") }]} />
        </Group>
        {(list.data ?? []).length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" py="lg">{t("docs.empty")}</Text>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover fz="sm" data-testid="doc-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("docs.docTitle")}</Table.Th>
                  <Table.Th>{t("docs.category")}</Table.Th>
                  <Table.Th>{t("docs.documentDate")}</Table.Th>
                  <Table.Th>{t("docs.issuingBody")}</Table.Th>
                  <Table.Th>{t("docs.version")}</Table.Th>
                  <Table.Th>{t("docs.size")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {list.data!.map((d) => (
                  <Table.Tr key={d.id} className="cursor-pointer" onClick={() => setOpen(d.id)} data-testid={`doc-row-${d.id}`}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        {d.accessLevel === "RESTRICTED" && <IconLock size={14} color="#b42318" aria-label={t("docs.restricted")} />}
                        <Text size="sm" fw={600}>{d.title}</Text>
                        {d.expiresAt && d.expiresAt < todayIso() && <Badge size="xs" color="red" variant="light">{t("docs.expired")}</Badge>}
                      </Group>
                      <Text size="xs" c="dimmed" dir="auto">{d.fileName}</Text>
                    </Table.Td>
                    <Table.Td>{cat.lookupLabel(d.categoryId)}</Table.Td>
                    <Table.Td>{d.documentDate ? fmtDate(d.documentDate) : ""}</Table.Td>
                    <Table.Td>{d.issuingBody ?? ""}</Table.Td>
                    <Table.Td>v{d.version}</Table.Td>
                    <Table.Td dir="ltr">{kb(d.sizeBytes)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      {open && <DocumentModal sid={sid} id={open} onClose={() => setOpen(null)} onEdit={(doc) => setForm({ doc })} onChanged={reload} />}
      {form && (
        <DocumentFormModal
          sid={sid}
          doc={form.doc}
          onClose={() => setForm(null)}
          onSaved={(d) => {
            setForm(null);
            reload();
            qc.setQueryData(["document", sid, d.id], d);
            setOpen(d.id);
          }}
        />
      )}
    </Stack>
  );
}

function DocumentModal({ sid, id, onClose, onEdit, onChanged }: { sid: string; id: string; onClose: () => void; onEdit: (d: DocumentDetail) => void; onChanged: () => void }) {
  const { t, fmtDate, fmtDateTime } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const doc = useQuery({ queryKey: ["document", sid, id], queryFn: () => api.documents!.get(sid, id) });
  const [busy, setBusy] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const d = doc.data;

  const run = async (name: string, fn: () => Promise<DocumentDetail | void>, ok?: (d: DocumentDetail) => string) => {
    setBusy(name);
    try {
      const r = await fn();
      if (r) {
        qc.setQueryData(["document", sid, id], r);
        onChanged();
        if (ok) notifications.show({ color: "green", message: ok(r) });
      }
      return r;
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy("");
    }
  };

  const upload = async () => {
    if (!file) return;
    const r = await run("version", async () => api.documents!.addVersion(sid, id, { fileName: file.name, dataBase64: await fileToBase64(file), changeNote: note }), (x) => t("docs.versionSaved", { n: x.version }));
    if (r) {
      setFile(null);
      setNote("");
    }
  };

  return (
    <Modal opened onClose={onClose} size="xl" title={d?.title ?? ""} data-testid="doc-modal">
      {!d ? (
        <Text size="sm" c="dimmed">…</Text>
      ) : (
        <Stack>
          <Group gap="xs">
            {d.archivedAt && <Badge color="gray">{t("docs.archived")}</Badge>}
            {d.accessLevel === "RESTRICTED" && <Badge color="red" variant="light" leftSection={<IconLock size={12} />}>{t("docs.restricted")}</Badge>}
            {d.expiresAt && d.expiresAt < todayIso() && <Badge color="red">{t("docs.expired")}</Badge>}
          </Group>
          <Grid gutter="xs">
            <Info label={t("docs.category")} value={cat.lookupLabel(d.categoryId)} />
            <Info label={t("docs.documentDate")} value={d.documentDate ? fmtDate(d.documentDate) : ""} />
            <Info label={t("docs.issuingBody")} value={d.issuingBody ?? ""} />
            <Info label={t("docs.expiresAt")} value={d.expiresAt ? fmtDate(d.expiresAt) : ""} />
            <Info label={t("docs.access")} value={t(`docs.access.${d.accessLevel}`)} />
            <Info label={t("docs.uploadedBy")} value={`${d.createdBy} · ${fmtDateTime(d.createdAt)}`} />
            {d.notes && <Info label={t("docs.notes")} value={d.notes} span={12} />}
          </Grid>
          <div>
            <Text fw={600} size="sm" mb={4}>{t("docs.links")}</Text>
            {d.links.length === 0 ? (
              <Text size="sm" c="dimmed">{t("docs.noLinks")}</Text>
            ) : (
              <Group gap={6} data-testid="doc-links">
                {d.links.map((l) => (
                  <Badge key={l.entityId} variant="outline" color="blue" tt="none">{t(`docs.link.${l.entityType}`)}: <bdi>{l.label}</bdi></Badge>
                ))}
              </Group>
            )}
          </div>
          <div>
            <Text fw={600} size="sm" mb={4}>{t("docs.versions")}</Text>
            <Table fz="xs" withTableBorder data-testid="doc-versions">
              <Table.Tbody>
                {d.versions.map((v) => (
                  <Table.Tr key={v.id}>
                    <Table.Td fw={700}>v{v.version}</Table.Td>
                    <Table.Td dir="auto">{v.fileName}</Table.Td>
                    <Table.Td dir="ltr">{kb(v.sizeBytes)}</Table.Td>
                    <Table.Td>{v.changeNote ?? ""}</Table.Td>
                    <Table.Td>{v.uploadedBy} · {fmtDateTime(v.createdAt)}</Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" aria-label={t("docs.download")} loading={busy === v.id} onClick={() => run(v.id, async () => saveDownload(await api.documents!.download(sid, id, v.id)))} data-testid={`doc-dl-v${v.version}`}>
                        <IconDownload size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
          {!d.archivedAt && can("documents.update") && (
            <Card withBorder padding="sm">
              <Text fw={600} size="sm" mb="xs">{t("docs.newVersion")}</Text>
              <Group align="flex-end" gap="xs" wrap="wrap">
                <FileButton
                  accept={ACCEPT}
                  onChange={(f) => {
                    const e = f ? checkFile(f) : null;
                    setFileErr(e ? t(e) : null);
                    setFile(e ? null : f);
                  }}
                >
                  {(props) => (
                    <Button {...props} variant="light" leftSection={<IconFileUpload size={16} />} data-testid="doc-version-file">
                      {file ? file.name : t("docs.file")}
                    </Button>
                  )}
                </FileButton>
                <TextInput label={t("docs.changeNote")} value={note} onChange={(e) => setNote(e.currentTarget.value)} className="flex-1 min-w-[200px]" maxLength={300} data-testid="doc-version-note" />
                <Button disabled={!file || !note.trim()} loading={busy === "version"} onClick={upload} data-testid="doc-version-save">
                  {t("common.save")}
                </Button>
              </Group>
              {fileErr && <Text size="xs" c="red" mt={4}>{fileErr}</Text>}
            </Card>
          )}
          <Group justify="flex-end">
            {!d.archivedAt && can("documents.update") && (
              <Button variant="light" leftSection={<IconEdit size={16} />} onClick={() => onEdit(d)} data-testid="doc-edit">
                {t("docs.edit")}
              </Button>
            )}
            {can("documents.archive") &&
              (d.archivedAt ? (
                <Button variant="light" leftSection={<IconArchiveOff size={16} />} loading={busy === "restore"} onClick={() => run("restore", () => api.documents!.restore(sid, id))}>
                  {t("docs.restore")}
                </Button>
              ) : (
                <Button variant="light" color="gray" leftSection={<IconArchive size={16} />} onClick={() => setArchiving(true)} data-testid="doc-archive">
                  {t("docs.archive")}
                </Button>
              ))}
          </Group>
          {archiving && !d.archivedAt && (
            <Alert color="gray" title={t("docs.archive")}>
              <Text size="sm" mb="xs">{t("docs.archiveBody")}</Text>
              <Group align="flex-end">
                <TextInput label={t("assets.reason")} value={reason} onChange={(e) => setReason(e.currentTarget.value)} className="flex-1" maxLength={300} data-testid="doc-archive-reason" />
                <Button
                  color="gray"
                  disabled={!reason.trim()}
                  loading={busy === "archive"}
                  onClick={async () => {
                    if (await run("archive", () => api.documents!.archive(sid, id, reason))) setArchiving(false);
                  }}
                  data-testid="doc-archive-confirm"
                >
                  {t("common.confirm")}
                </Button>
              </Group>
            </Alert>
          )}
        </Stack>
      )}
    </Modal>
  );
}

function Info({ label, value, span = 6 }: { label: string; value: string; span?: number }) {
  return (
    <Grid.Col span={{ base: 12, sm: span }}>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm">{value || "—"}</Text>
    </Grid.Col>
  );
}

function DocumentFormModal({ sid, doc, onClose, onSaved }: { sid: string; doc?: DocumentDetail; onClose: () => void; onSaved: (d: DocumentDetail) => void }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const f = useForm<DocumentMetaInput>({
    resolver: zodResolver(documentMetaSchema) as never,
    defaultValues: {
      title: doc?.title ?? "",
      categoryId: doc?.categoryId ?? "",
      documentDate: doc?.documentDate ?? "",
      issuingBody: doc?.issuingBody ?? "",
      expiresAt: doc?.expiresAt ?? "",
      notes: doc?.notes ?? "",
      accessLevel: doc?.accessLevel ?? "SCHOOL",
      links: doc?.links.map((l) => ({ entityType: l.entityType, entityId: l.entityId })) ?? [],
    },
  });
  const err = fieldError(f, t);
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<DocumentLinkType>("ASSET");
  const [assetQ, setAssetQ] = useState("");
  const [dAssetQ] = useDebouncedValue(assetQ, 250);
  const [labels, setLabels] = useState<Record<string, string>>(Object.fromEntries((doc?.links ?? []).map((l) => [l.entityId, l.label])));
  const assets = useQuery({
    queryKey: ["doc-asset-pick", sid, dAssetQ],
    queryFn: () => api.assets!.list(sid, { q: dAssetQ, pageSize: 20 }),
    enabled: !!api.assets && linkType === "ASSET",
  });
  const links = f.watch("links") ?? [];
  const pickOptions =
    linkType === "ASSET"
      ? (assets.data?.items ?? []).map((a) => ({ value: a.id, label: `${a.inventoryNumber} — ${a.name}` }))
      : cat.supplierOptions;

  const submit = f.handleSubmit(async (v) => {
    if (!doc && !file) return setFileErr(t("errors.required"));
    try {
      const r = doc ? await api.documents!.update(sid, doc.id, v) : await api.documents!.create(sid, { ...v, fileName: file!.name, dataBase64: await fileToBase64(file!) });
      notifications.show({ color: "green", message: t("docs.saved") });
      onSaved(r);
    } catch (e) {
      const fields = (e as { details?: { fields?: Record<string, string> } }).details?.fields;
      if (fields?.file) setFileErr(t(fields.file));
      else handleFormError(f, t, e);
    }
  });

  return (
    <Modal opened onClose={onClose} size="lg" title={doc ? t("docs.edit") : t("docs.add")} data-testid="doc-form">
      <form onSubmit={submit} noValidate>
        <Stack gap="sm">
          <TextInput label={t("docs.docTitle")} withAsterisk {...f.register("title")} error={err("title")} data-testid="doc-title" />
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller control={f.control} name="categoryId" render={({ field }) => <Select label={t("docs.category")} data={cat.lookupOptions("DOCUMENT_CATEGORY")} value={field.value || null} onChange={(v) => field.onChange(v ?? "")} clearable error={err("categoryId")} data-testid="doc-category" />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("docs.issuingBody")} {...f.register("issuingBody")} error={err("issuingBody")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput type="date" label={t("docs.documentDate")} {...f.register("documentDate")} error={err("documentDate")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput type="date" label={t("docs.expiresAt")} {...f.register("expiresAt")} error={err("expiresAt")} />
            </Grid.Col>
          </Grid>
          <Controller
            control={f.control}
            name="accessLevel"
            render={({ field }) => (
              <div>
                <Text size="sm" fw={500} mb={4}>{t("docs.access")}</Text>
                <SegmentedControl value={field.value} onChange={field.onChange} data={(["SCHOOL", "RESTRICTED"] as const).map((v) => ({ value: v, label: t(`docs.access.${v}`) }))} data-testid="doc-access" />
              </div>
            )}
          />
          <Textarea label={t("docs.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
          <div>
            <Text size="sm" fw={500} mb={4}>{t("docs.links")}</Text>
            <Group gap={6} mb={6}>
              {links.map((l, i) => (
                <Badge
                  key={l.entityId}
                  variant="outline"
                  tt="none"
                  rightSection={
                    <ActionIcon size="xs" variant="transparent" aria-label="x" onClick={() => f.setValue("links", links.filter((_, k) => k !== i))}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  }
                >
                  {t(`docs.link.${l.entityType}`)}: <bdi>{labels[l.entityId] ?? ""}</bdi>
                </Badge>
              ))}
            </Group>
            <Group gap="xs" align="flex-end">
              <Select w={140} data={LINK_TYPES.map((v) => ({ value: v, label: t(`docs.link.${v}`) }))} value={linkType} onChange={(v) => setLinkType((v as DocumentLinkType) ?? "ASSET")} allowDeselect={false} />
              <Select
                className="flex-1"
                placeholder={t("docs.addLink")}
                searchable
                data={pickOptions.filter((o) => !links.some((l) => l.entityId === o.value))}
                onSearchChange={linkType === "ASSET" ? setAssetQ : undefined}
                value={null}
                onChange={(v) => {
                  if (!v) return;
                  const o = pickOptions.find((x) => x.value === v);
                  setLabels((m) => ({ ...m, [v]: o?.label ?? "" }));
                  f.setValue("links", [...links, { entityType: linkType, entityId: v }]);
                }}
                data-testid="doc-link-pick"
              />
            </Group>
          </div>
          {!doc && (
            <div>
              <FileButton
                accept={ACCEPT}
                onChange={(x) => {
                  const e = x ? checkFile(x) : null;
                  setFileErr(e ? t(e) : null);
                  setFile(e ? null : x);
                }}
              >
                {(props) => (
                  <Button {...props} variant="light" leftSection={<IconFileUpload size={16} />} data-testid="doc-file">
                    {file ? file.name : t("docs.file")}
                  </Button>
                )}
              </FileButton>
              {fileErr && <Text size="xs" c="red" mt={4}>{fileErr}</Text>}
            </div>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="doc-save">
              {t("common.save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
