import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Group,
  Loader,
  NumberInput,
  Radio,
  SegmentedControl,
  SimpleGrid,
  Slider,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPhotoUp, IconPlus, IconPrinter, IconRefresh, IconTrash, IconX } from "@tabler/icons-react";
import {
  LETTERHEAD_MAX_BYTES,
  LETTERHEAD_TYPES,
  letterheadSchema,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
} from "@hassan/validation";
import { api, type Branding } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { readImage } from "../../lib/files";
import { defaultLetterhead } from "../../lib/defaults";
import { ReportDocument } from "../../print/ReportDocument";
import { ScaledPreview } from "../../print/ScaledPreview";
import { sampleRows } from "../../print/sampleReport";
import { errorKey } from "../../lib/errors";

type Draft = Omit<Branding, "schoolId" | "updatedAt" | "updatedBy">;

export function BrandingPage() {
  const { t, fmtDateTime } = useI18n();
  const { activeSchool, can } = useAuth();
  const canEdit = can("branding.update");
  const sid = activeSchool?.id;
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["branding", sid], queryFn: () => api.getBranding(sid!), enabled: !!sid });
  const hist = useQuery({ queryKey: ["brandingHistory", sid], queryFn: () => api.brandingHistory(sid!), enabled: !!sid });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const fromServer = (b: Branding): Draft => {
    const { schoolId: _s, updatedAt: _u, updatedBy: _b, ...rest } = b;
    return rest;
  };

  useEffect(() => {
    if (q.data) setDraft(fromServer(q.data));
  }, [q.data]);

  const dirty = useMemo(() => {
    if (!q.data || !draft) return false;
    const { schoolId: _s, updatedAt: _u, updatedBy: _b, ...rest } = q.data;
    return JSON.stringify(rest) !== JSON.stringify(draft);
  }, [q.data, draft]);

  if (!draft || !activeSchool) return <Loader />;

  const lh = draft.letterhead;
  const setLh = (patch: Partial<Draft["letterhead"]>) => setDraft({ ...draft, letterhead: { ...lh, ...patch } });

  const fileError = (e: "type" | "size", types: string, mb: number) =>
    notifications.show({ color: "red", message: e === "type" ? t("branding.fileType", { types }) : t("branding.fileSize", { mb }) });

  const onLogo = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const r = await readImage(f, LOGO_TYPES, LOGO_MAX_BYTES);
    if (!r.ok) return fileError(r.error, "PNG, JPG, WEBP", 2);
    setDraft({ ...draft, logoDataUrl: r.dataUrl });
  };
  const onLetterheadImage = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const r = await readImage(f, LETTERHEAD_TYPES, LETTERHEAD_MAX_BYTES);
    if (!r.ok) return fileError(r.error, "PNG, JPG", 5);
    setLh({ imageDataUrl: r.dataUrl });
  };

  const confirm = (title: string, body: string, onConfirm: () => void, danger = true) =>
    modals.openConfirmModal({
      title,
      centered: true,
      children: <Text size="sm">{body}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      confirmProps: { color: danger ? "red" : "brand", "data-testid": "confirm-ok" } as never,
      onConfirm,
    });

  const save = async () => {
    const parsed = letterheadSchema.safeParse(lh);
    if (!parsed.success) {
      notifications.show({ color: "red", message: t("branding.invalid") });
      return;
    }
    setSaving(true);
    try {
      await api.saveBranding(sid!, draft);
      await qc.invalidateQueries({ queryKey: ["branding", sid] });
      await qc.invalidateQueries({ queryKey: ["brandingHistory", sid] });
      await qc.invalidateQueries({ queryKey: ["dash"] });
      notifications.show({ color: "green", message: t("branding.saved") });
    } catch (e) {
      notifications.show({ color: "red", message: t(errorKey(e)) });
    } finally {
      setSaving(false);
    }
  };

  const reset = () =>
    confirm(t("branding.resetTitle"), t("branding.resetBody"), async () => {
      try {
        await api.resetBranding(sid!);
      } catch (e) {
        notifications.show({ color: "red", message: t(errorKey(e)) });
        return;
      }
      await qc.invalidateQueries({ queryKey: ["branding", sid] });
      await qc.invalidateQueries({ queryKey: ["brandingHistory", sid] });
      await qc.invalidateQueries({ queryKey: ["dash"] });
      notifications.show({ color: "green", message: t("branding.resetDone") });
    });

  const refillFromSchool = async () => {
    const dirs = await api.listDirectorates();
    const d = dirs.find((x) => x.id === activeSchool.directorateId);
    const a = d ? (await api.listAcademies()).find((x) => x.id === d.academyId) : undefined;
    const fresh = defaultLetterhead(a, d, activeSchool);
    setLh({ linesAr: fresh.linesAr, linesFr: fresh.linesFr });
  };

  const lineEditor = (key: "linesAr" | "linesFr", dir: "rtl" | "ltr") => (
    <Stack gap={6}>
      {lh[key].map((line, i) => (
        <Group key={i} gap={6} wrap="nowrap">
          <TextInput
            className="flex-1"
            dir={dir}
            value={line}
            aria-label={`${t("branding.line")} ${i + 1}`}
            data-testid={`${key}-${i}`}
            onChange={(e) => {
              const next = [...lh[key]];
              next[i] = e.currentTarget.value;
              setLh({ [key]: next } as Partial<Draft["letterhead"]>);
            }}
          />
          <ActionIcon variant="subtle" color="red" aria-label={t("common.delete")} onClick={() => setLh({ [key]: lh[key].filter((_, j) => j !== i) } as Partial<Draft["letterhead"]>)}>
            <IconX size={16} />
          </ActionIcon>
        </Group>
      ))}
      {lh[key].length < 8 && (
        <Button size="compact-sm" variant="subtle" leftSection={<IconPlus size={14} />} onClick={() => setLh({ [key]: [...lh[key], ""] } as Partial<Draft["letterhead"]>)} className="self-start">
          {t("branding.addLine")}
        </Button>
      )}
    </Stack>
  );

  const previewBranding: Branding = { ...draft, schoolId: sid! };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)] items-start">
      <Card>
        <Title order={4} mb={4}>{t("settings.branding")}</Title>
        <Text size="sm" c="dimmed" mb="md">{t("branding.intro")}</Text>
        <Tabs defaultValue="letterhead">
          <Tabs.List mb="md">
            <Tabs.Tab value="school">{t("branding.tabs.school")}</Tabs.Tab>
            <Tabs.Tab value="logo" data-testid="btab-logo">{t("branding.tabs.logo")}</Tabs.Tab>
            <Tabs.Tab value="letterhead" data-testid="btab-letterhead">{t("branding.tabs.letterhead")}</Tabs.Tab>
            <Tabs.Tab value="print" data-testid="btab-print">{t("branding.tabs.print")}</Tabs.Tab>
            <Tabs.Tab value="history">{t("branding.tabs.history")}</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="school">
            <Stack gap="xs">
              <Text size="sm">{t("branding.schoolTabBody")}</Text>
              <Group>
                <Button variant="light" onClick={() => nav("/settings/school")}>{t("settings.schoolInfo")}</Button>
                <Button variant="light" onClick={() => nav("/settings/hierarchy")}>{t("settings.hierarchy")}</Button>
              </Group>
              <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={refillFromSchool} data-testid="refill-lines">
                {t("branding.refill")}
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="logo">
            <Stack>
              {draft.logoDataUrl ? (
                <Group align="center">
                  <img src={draft.logoDataUrl} alt="" className="w-24 h-24 object-contain border border-[var(--line)] rounded-lg bg-white" data-testid="logo-preview" />
                  <Stack gap={6}>
                    <Dropzone onDrop={onLogo} accept={[...LOGO_TYPES]} maxFiles={1} p={0} className="border-0 bg-transparent" activateOnClick>
                      <Button variant="light" component="span" leftSection={<IconPhotoUp size={16} />}>{t("branding.changeLogo")}</Button>
                    </Dropzone>
                    <Button
                      variant="subtle"
                      color="red"
                      leftSection={<IconTrash size={16} />}
                      onClick={() => confirm(t("branding.deleteLogoTitle"), t("branding.deleteLogoBody"), () => setDraft({ ...draft, logoDataUrl: undefined }))}
                      data-testid="delete-logo"
                    >
                      {t("branding.deleteLogo")}
                    </Button>
                  </Stack>
                </Group>
              ) : (
                <Dropzone onDrop={onLogo} onReject={() => fileError("type", "PNG, JPG, WEBP", 2)} accept={[...LOGO_TYPES]} maxSize={LOGO_MAX_BYTES} maxFiles={1} data-testid="logo-drop">
                  <Stack align="center" gap={4} py="md">
                    <IconPhotoUp size={32} color="#1d5fa8" />
                    <Text size="sm">{t("branding.uploadLogo")}</Text>
                    <Text size="xs" c="dimmed">PNG · JPG · WEBP — ≤ 2 MB</Text>
                  </Stack>
                </Dropzone>
              )}
              <div>
                <Text size="sm" fw={500} mb={4}>{t("branding.logoWidth")}: {draft.logoWidthMm} {t("unit.mm")}</Text>
                <Slider min={10} max={60} step={1} value={draft.logoWidthMm} onChange={(v) => setDraft({ ...draft, logoWidthMm: v })} />
              </div>
              <div>
                <Text size="sm" fw={500} mb={4}>{t("branding.logoPosition")}</Text>
                <SegmentedControl
                  fullWidth
                  value={draft.logoAlign}
                  onChange={(v) => setDraft({ ...draft, logoAlign: v as Draft["logoAlign"] })}
                  data={[
                    { value: "right", label: t("branding.pos.right") },
                    { value: "center", label: t("branding.pos.center") },
                    { value: "left", label: t("branding.pos.left") },
                  ]}
                />
              </div>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="letterhead">
            <Stack>
              <Radio.Group label={t("branding.source")} value={lh.mode} onChange={(v) => setLh({ mode: v as "IMAGE" | "GENERATED" })}>
                <Group mt={6}>
                  <Radio value="GENERATED" label={t("branding.generated")} data-testid="mode-generated" />
                  <Radio value="IMAGE" label={t("branding.image")} data-testid="mode-image" />
                </Group>
              </Radio.Group>

              {lh.mode === "IMAGE" ? (
                <>
                  {lh.imageDataUrl && <img src={lh.imageDataUrl} alt="" className="w-full border border-[var(--line)] rounded-lg bg-white" />}
                  <Dropzone onDrop={onLetterheadImage} onReject={() => fileError("type", "PNG, JPG", 5)} accept={[...LETTERHEAD_TYPES]} maxSize={LETTERHEAD_MAX_BYTES} maxFiles={1}>
                    <Stack align="center" gap={4} py="sm">
                      <IconPhotoUp size={28} color="#1d5fa8" />
                      <Text size="sm">{lh.imageDataUrl ? t("branding.replaceImage") : t("branding.uploadImage")}</Text>
                      <Text size="xs" c="dimmed">PNG · JPG — ≤ 5 MB</Text>
                    </Stack>
                  </Dropzone>
                  {!lh.imageDataUrl && <Alert color="yellow" variant="light">{t("branding.noImageFallback")}</Alert>}
                  <SimpleGrid cols={2}>
                    <NumberInput label={t("branding.widthMm")} min={50} max={210} value={lh.imageWidthMm} onChange={(v) => setLh({ imageWidthMm: Number(v) || 50 })} />
                    <NumberInput label={t("branding.heightMm")} min={10} max={80} value={lh.imageHeightMm} onChange={(v) => setLh({ imageHeightMm: Number(v) || 10 })} />
                  </SimpleGrid>
                  <SegmentedControl
                    value={lh.imageAlign}
                    onChange={(v) => setLh({ imageAlign: v as typeof lh.imageAlign })}
                    data={[
                      { value: "right", label: t("branding.pos.right") },
                      { value: "center", label: t("branding.pos.center") },
                      { value: "left", label: t("branding.pos.left") },
                    ]}
                  />
                </>
              ) : (
                <>
                  <Text size="sm" fw={500}>{t("branding.linesAr")}</Text>
                  {lineEditor("linesAr", "rtl")}
                  <Switch label={t("branding.showFrench")} checked={lh.showFrenchBlock} onChange={(e) => setLh({ showFrenchBlock: e.currentTarget.checked })} />
                  {lh.showFrenchBlock && (
                    <>
                      <Text size="sm" fw={500}>{t("branding.linesFr")}</Text>
                      {lineEditor("linesFr", "ltr")}
                    </>
                  )}
                  <Switch label={t("branding.showLogo")} checked={lh.showLogo} onChange={(e) => setLh({ showLogo: e.currentTarget.checked })} data-testid="toggle-logo" />
                  <Switch label={t("branding.showContact")} checked={lh.showContact} onChange={(e) => setLh({ showContact: e.currentTarget.checked })} />
                  <div>
                    <Text size="sm" fw={500} mb={4}>{t("branding.headerHeight")}: {lh.heightMm} {t("unit.mm")}</Text>
                    <Slider min={15} max={80} value={lh.heightMm} onChange={(v) => setLh({ heightMm: v })} />
                  </div>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="print">
            <Stack>
              <Radio.Group label={t("branding.placement")} value={lh.placement} onChange={(v) => setLh({ placement: v as typeof lh.placement })}>
                <Group mt={6}>
                  <Radio value="ALL_PAGES" label={t("branding.allPages")} data-testid="placement-all" />
                  <Radio value="FIRST_PAGE" label={t("branding.firstPage")} data-testid="placement-first" />
                </Group>
              </Radio.Group>
              <Text size="sm" fw={500}>{t("branding.margins")}</Text>
              <SimpleGrid cols={4}>
                {(["top", "right", "bottom", "left"] as const).map((k) => (
                  <NumberInput
                    key={k}
                    label={t(`branding.margin.${k}`)}
                    min={5}
                    max={40}
                    value={lh.marginsMm[k]}
                    onChange={(v) => setLh({ marginsMm: { ...lh.marginsMm, [k]: Number(v) || 5 } })}
                  />
                ))}
              </SimpleGrid>
              <Switch label={t("branding.showFooter")} checked={lh.showFooter} onChange={(e) => setLh({ showFooter: e.currentTarget.checked })} />
              {lh.showFooter && <TextInput label={t("branding.footerText")} value={lh.footerText} onChange={(e) => setLh({ footerText: e.currentTarget.value })} />}
              <Switch label={t("branding.pageNumbers")} checked={lh.showPageNumbers} onChange={(e) => setLh({ showPageNumbers: e.currentTarget.checked })} />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="history">
            {(hist.data ?? []).length === 0 ? (
              <Text size="sm" c="dimmed">{t("branding.noHistory")}</Text>
            ) : (
              <Table data-testid="history-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("branding.version")}</Table.Th>
                    <Table.Th>{t("branding.when")}</Table.Th>
                    <Table.Th>{t("branding.by")}</Table.Th>
                    <Table.Th>{t("branding.what")}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {hist.data!.map((h) => (
                    <Table.Tr key={h.version + h.at}>
                      <Table.Td>{h.version}</Table.Td>
                      <Table.Td>{fmtDateTime(h.at)}</Table.Td>
                      <Table.Td>{h.by}</Table.Td>
                      <Table.Td>{t(h.summaryKey)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>
        </Tabs>

        <Group mt="xl" gap="xs">
          {canEdit && (
            <>
              <Button onClick={save} loading={saving} disabled={!dirty} data-testid="branding-save">{t("common.save")}</Button>
              <Button variant="default" onClick={() => q.data && setDraft(fromServer(q.data))} disabled={!dirty} data-testid="branding-discard">{t("branding.discard")}</Button>
            </>
          )}
          <Button variant="light" leftSection={<IconPrinter size={16} />} onClick={() => nav("/settings/print-preview")} data-testid="go-print-preview">
            {t("branding.testOnReport")}
          </Button>
          {canEdit && <Button variant="subtle" color="red" onClick={reset} data-testid="branding-reset">{t("branding.reset")}</Button>}
        </Group>
        {dirty && <Text size="xs" c="orange" mt="xs">{t("branding.unsaved")}</Text>}
        {q.data?.updatedAt && (
          <Text size="xs" c="dimmed" mt="xs">
            {t("branding.lastSaved", { when: fmtDateTime(q.data.updatedAt), by: q.data.updatedBy ?? "" })}
          </Text>
        )}
      </Card>

      <div className="xl:sticky xl:top-20">
        <Text size="sm" c="dimmed" mb="xs">{t("branding.livePreview")}</Text>
        <div className="rounded-xl bg-[#dde3ec] p-3" data-testid="live-preview">
          <ScaledPreview>
            <ReportDocument
              branding={previewBranding}
              school={activeSchool}
              title={t("print.sampleTitle")}
              columns={[
                { key: "n", label: t("print.col.number"), render: (r) => String(r.n) },
                { key: "item", label: t("print.col.item"), render: () => t("print.sampleCell") },
                { key: "cat", label: t("print.col.category"), render: () => "—" },
                { key: "loc", label: t("print.col.location"), render: () => "—" },
                { key: "st", label: t("print.col.status"), render: () => "—" },
              ]}
              rows={sampleRows(5)}
              pageLabel={(p, n) => t("print.pageOf", { p, n })}
            />
          </ScaledPreview>
        </div>
      </div>
    </div>
  );
}
