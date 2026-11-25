import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, FileButton, Grid, Group, Modal, SegmentedControl, Select, Stack, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCircle, IconDeviceFloppy, IconEdit, IconMapPin, IconPhoto, IconPlus, IconPointer, IconPolygon, IconSquare, IconTrash, IconX } from "@tabler/icons-react";
import { FLOORPLAN_IMAGE_MAX_BYTES } from "@hassan/validation";
import { api, type FloorPlanDetail, type FloorPlanShape, type ShapeLevel } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { readImage } from "../../lib/files";
import { notifyError } from "../../lib/forms";
import { FloorCanvas, LEVEL_COLOR, type EditableShape, type Tool } from "./FloorCanvas";

const IMG = ["image/png", "image/jpeg", "image/webp"] as const;
const LEVELS: ShapeLevel[] = ["GOOD", "WARN", "BAD", "NONE"];
let seq = 0;
const withKeys = (shapes: FloorPlanShape[]): EditableShape[] => shapes.map((s) => ({ ...s, key: s.id ?? `n${++seq}` }));

/**
 * المخطط التفاعلي: صورة المؤسسة (أو شبكة فارغة) وعليها الفضاءات والمرافق مرسومة،
 * ملونة حسب حالتها الحية (حالة الفضاء، صيانة مفتوحة، ممتلكات معطوبة). وضع التعديل لمن يملك floorplan.update.
 */
export function FloorPlanPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  const sid = activeSchool?.id ?? "";
  const qc = useQueryClient();
  const allowed = !!api.floorplan && !!sid && can("floorplan.view");
  const plans = useQuery({ queryKey: ["floorplans", sid], queryFn: () => api.floorplan!.list(sid), enabled: allowed });
  const [planId, setPlanId] = useState<string | null>(null);
  const current = planId ?? plans.data?.[0]?.id ?? null;
  const detail = useQuery({ queryKey: ["floorplan", sid, current], queryFn: () => api.floorplan!.get(sid, current!), enabled: allowed && !!current });
  const rooms = useQuery({ queryKey: ["rooms", sid], queryFn: () => api.spaces!.rooms(sid), enabled: allowed && !!api.spaces });
  const facilities = useQuery({ queryKey: ["facilities", sid], queryFn: () => api.spaces!.facilities(sid), enabled: allowed && !!api.spaces });

  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    setBg(null);
    if (!detail.data?.hasBackground) return;
    let url = "";
    let alive = true;
    api.floorplan!.background(sid, detail.data.id).then((blob) => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => alive && setBg(img);
      img.src = url;
    }, () => undefined);
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [sid, detail.data?.id, detail.data?.hasBackground, detail.data?.updatedAt]);

  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [draft, setDraft] = useState<EditableShape[]>([]);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<"create" | "edit" | "delete" | null>(null);
  const [polyPts, setPolyPts] = useState(0);
  const finishRef = useRef<(() => void) | null>(null);
  const [width, box] = useWidth();

  const shapes = useMemo(() => (editing ? draft : withKeys(detail.data?.shapes ?? [])), [editing, draft, detail.data]);
  const sel = shapes.find((s) => s.key === selected) ?? null;

  const targetName = useCallback(
    (s: FloorPlanShape) => {
      if (s.roomId) {
        const r = rooms.data?.find((x) => x.id === s.roomId);
        return r ? `${r.code} — ${r.name}` : s.status?.targetName ?? "";
      }
      if (s.facilityId) {
        const f = facilities.data?.find((x) => x.id === s.facilityId);
        return f ? `${f.code} — ${f.name}` : s.status?.targetName ?? "";
      }
      return "";
    },
    [rooms.data, facilities.data],
  );
  const labelOf = useCallback((s: EditableShape) => s.label || s.status?.targetCode || (s.roomId ? rooms.data?.find((x) => x.id === s.roomId)?.code : s.facilityId ? facilities.data?.find((x) => x.id === s.facilityId)?.code : "") || "", [rooms.data, facilities.data]);

  const startEdit = () => {
    setDraft(withKeys(detail.data?.shapes ?? []));
    setDirty(false);
    setTool("select");
    setEditing(true);
  };
  const stopEdit = () => {
    setEditing(false);
    setDirty(false);
    setSelected(null);
  };
  const patch = (key: string, p: Partial<FloorPlanShape>) => {
    setDraft((d) => d.map((s) => (s.key === key ? { ...s, ...p, status: p.roomId !== undefined || p.facilityId !== undefined ? undefined : s.status } : s)));
    setDirty(true);
  };
  const add = (s: Omit<EditableShape, "key">) => {
    const key = `n${++seq}`;
    setDraft((d) => [...d, { ...s, key }]);
    setSelected(key);
    setDirty(true);
    setTool("select");
  };
  const removeSel = () => {
    if (!selected) return;
    setDraft((d) => d.filter((s) => s.key !== selected));
    setSelected(null);
    setDirty(true);
  };
  useEffect(() => {
    if (!editing) return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") removeSel();
      if (e.key === "Escape") setTool("select");
      if (e.key === "Enter" && tool === "POLYGON") finishRef.current?.();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const save = async () => {
    if (!detail.data) return;
    setSaving(true);
    try {
      const r = await api.floorplan!.saveShapes(sid, detail.data.id, draft);
      qc.setQueryData(["floorplan", sid, r.id], r);
      qc.invalidateQueries({ queryKey: ["floorplans", sid] });
      notifications.show({ color: "green", message: t("fp.saved") });
      stopEdit();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setSaving(false);
    }
  };

  if (!api.floorplan) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;
  if (!allowed) return <Alert color="red" mt="md">{t("errors.forbidden")}</Alert>;
  const plan = detail.data;
  const ratio = plan ? plan.heightPx / plan.widthPx : 0.625;
  const linkValue = (s: FloorPlanShape) => (s.roomId ? `room:${s.roomId}` : s.facilityId ? `fac:${s.facilityId}` : null);
  const linkData = [
    { group: t("fp.rooms"), items: (rooms.data ?? []).map((r) => ({ value: `room:${r.id}`, label: `${r.code} — ${r.name}` })) },
    { group: t("fp.facilities"), items: (facilities.data ?? []).map((f) => ({ value: `fac:${f.id}`, label: `${f.code} — ${f.name}` })) },
  ];

  return (
    <Stack mt="md">
      <Group justify="space-between" wrap="wrap">
        <Group gap="sm">
          <Title order={3}>{t("fp.title")}</Title>
          {(plans.data?.length ?? 0) > 0 && (
            <Select data-testid="fp-select" w={240} disabled={editing} data={(plans.data ?? []).map((p) => ({ value: p.id, label: p.name }))} value={current} onChange={(v) => (setPlanId(v), setSelected(null))} allowDeselect={false} />
          )}
        </Group>
        <Group gap="xs">
          {!editing && plan && can("floorplan.update") && (
            <>
              <Button variant="default" leftSection={<IconPhoto size={16} />} onClick={() => setModal("edit")} data-testid="fp-props">{t("fp.props")}</Button>
              <Button leftSection={<IconEdit size={16} />} onClick={startEdit} data-testid="fp-edit">{t("fp.edit")}</Button>
            </>
          )}
          {!editing && plan && can("floorplan.archive") && (
            <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => setModal("delete")} data-testid="fp-delete">{t("common.delete")}</Button>
          )}
          {!editing && can("floorplan.create") && (
            <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setModal("create")} data-testid="fp-new">{t("fp.new")}</Button>
          )}
          {editing && (
            <>
              <Button variant="default" leftSection={<IconX size={16} />} onClick={stopEdit} data-testid="fp-cancel">{t("common.cancel")}</Button>
              <Button leftSection={<IconDeviceFloppy size={16} />} onClick={save} loading={saving} disabled={!dirty} data-testid="fp-save">{t("common.save")}</Button>
            </>
          )}
        </Group>
      </Group>

      {plans.isSuccess && !plans.data.length && <Alert color="blue" data-testid="fp-empty">{t(can("floorplan.create") ? "fp.emptyCreate" : "fp.empty")}</Alert>}

      {plan && (
        <Grid>
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Card p="xs">
              {editing && (
                <Group mb="xs" gap="xs" wrap="wrap">
                  <SegmentedControl
                    size="xs"
                    value={tool}
                    onChange={(v) => setTool(v as Tool)}
                    data-testid="fp-tools"
                    data={[
                      { value: "select", label: <Tooltip label={t("fp.tool.select")}><span data-testid="fp-tool-select" style={{ display: "inline-flex" }}><IconPointer size={16} aria-label={t("fp.tool.select")} /></span></Tooltip> },
                      { value: "RECTANGLE", label: <Tooltip label={t("fp.tool.RECTANGLE")}><span data-testid="fp-tool-RECTANGLE" style={{ display: "inline-flex" }}><IconSquare size={16} aria-label={t("fp.tool.RECTANGLE")} /></span></Tooltip> },
                      { value: "POLYGON", label: <Tooltip label={t("fp.tool.POLYGON")}><span data-testid="fp-tool-POLYGON" style={{ display: "inline-flex" }}><IconPolygon size={16} aria-label={t("fp.tool.POLYGON")} /></span></Tooltip> },
                      { value: "CIRCLE", label: <Tooltip label={t("fp.tool.CIRCLE")}><span data-testid="fp-tool-CIRCLE" style={{ display: "inline-flex" }}><IconCircle size={16} aria-label={t("fp.tool.CIRCLE")} /></span></Tooltip> },
                      { value: "MARKER", label: <Tooltip label={t("fp.tool.MARKER")}><span data-testid="fp-tool-MARKER" style={{ display: "inline-flex" }}><IconMapPin size={16} aria-label={t("fp.tool.MARKER")} /></span></Tooltip> },
                    ]}
                  />
                  <Text size="xs" c="dimmed" data-testid="fp-hint">{t(`fp.hint.${tool}`)}</Text>
                  {tool === "POLYGON" && (
                    <Button size="xs" variant="light" disabled={polyPts < 3} onClick={() => finishRef.current?.()} data-testid="fp-poly-done">{t("fp.polyDone", { n: polyPts })}</Button>
                  )}
                </Group>
              )}
              <div ref={box} style={{ width: "100%", overflow: "hidden", borderRadius: 6 }} dir="ltr" data-testid="fp-canvas">
                {width > 0 && (
                  <FloorCanvas
                    width={width}
                    ratio={ratio}
                    background={bg}
                    shapes={shapes}
                    selected={selected}
                    onSelect={setSelected}
                    editing={editing}
                    tool={tool}
                    onChange={patch}
                    onAdd={add}
                    labelOf={labelOf}
                    finishRef={finishRef}
                    onPolyChange={setPolyPts}
                  />
                )}
              </div>
              <Group gap="md" mt="xs" data-testid="fp-legend">
                {LEVELS.map((l) => (
                  <Group key={l} gap={6}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: LEVEL_COLOR[l], display: "inline-block" }} />
                    <Text size="xs">{t(`fp.level.${l}`)}</Text>
                  </Group>
                ))}
              </Group>
            </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Card data-testid="fp-panel">
              {!sel && <Text size="sm" c="dimmed">{t(editing ? "fp.pickToEdit" : "fp.pickToView")}</Text>}
              {sel && !editing && (
                <Stack gap={6}>
                  <Text fw={700}>{sel.label || targetName(sel) || t(`fp.tool.${sel.kind}`)}</Text>
                  {targetName(sel) && <Text size="sm">{targetName(sel)}</Text>}
                  <Badge color={LEVEL_COLOR[sel.status?.level ?? "NONE"]} variant="filled" data-testid="fp-level">{t(`fp.level.${sel.status?.level ?? "NONE"}`)}</Badge>
                  {sel.status?.spaceStatus && <Text size="sm">{t("fp.spaceStatus")}: {t(`spaceStatus.${sel.status.spaceStatus}`)}</Text>}
                  {sel.status && sel.status.level !== "NONE" && (
                    <>
                      <Text size="sm" data-testid="fp-maint">{t("fp.openMaintenance", { n: sel.status.openMaintenance })}</Text>
                      <Text size="sm">{t("fp.assets", { n: sel.status.assets, d: sel.status.damagedAssets })}</Text>
                    </>
                  )}
                </Stack>
              )}
              {sel && editing && (
                <Stack gap="xs">
                  <Text size="sm" fw={600}>{t(`fp.tool.${sel.kind}`)}</Text>
                  <TextInput label={t("fp.label")} value={sel.label ?? ""} maxLength={80} onChange={(e) => patch(sel.key, { label: e.currentTarget.value })} data-testid="fp-label" />
                  <Select
                    label={t("fp.link")}
                    data={linkData}
                    value={linkValue(sel)}
                    searchable
                    clearable
                    data-testid="fp-link"
                    onChange={(v) => patch(sel.key, { roomId: v?.startsWith("room:") ? v.slice(5) : "", facilityId: v?.startsWith("fac:") ? v.slice(4) : "" })}
                  />
                  <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={removeSel} data-testid="fp-shape-delete">{t("fp.removeShape")}</Button>
                </Stack>
              )}
            </Card>
          </Grid.Col>
        </Grid>
      )}

      {plan && (
        <Card>
          <Text size="sm" fw={600} mb="xs">{t("fp.tableTitle")}</Text>
          <Table.ScrollContainer minWidth={560}>
            <Table fz="sm" data-testid="fp-table" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("fp.label")}</Table.Th>
                  <Table.Th>{t("fp.link")}</Table.Th>
                  <Table.Th>{t("fp.status")}</Table.Th>
                  <Table.Th>{t("fp.maintShort")}</Table.Th>
                  <Table.Th>{t("fp.damagedShort")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shapes.map((s) => (
                  <Table.Tr key={s.key} onClick={() => setSelected(s.key)} className="cursor-pointer" bg={s.key === selected ? "var(--mantine-color-blue-light)" : undefined}>
                    <Table.Td>{s.label || "—"}</Table.Td>
                    <Table.Td>{targetName(s) || "—"}</Table.Td>
                    <Table.Td>{s.status ? t(`fp.level.${s.status.level}`) : t("fp.pendingSave")}</Table.Td>
                    <Table.Td>{s.status?.openMaintenance ?? "—"}</Table.Td>
                    <Table.Td>{s.status?.damagedAssets ?? "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <PlanModal
        mode={modal === "create" || modal === "edit" ? modal : null}
        plan={plan}
        onClose={() => setModal(null)}
        onSaved={(p) => {
          qc.invalidateQueries({ queryKey: ["floorplans", sid] });
          qc.setQueryData(["floorplan", sid, p.id], p);
          setPlanId(p.id);
          setModal(null);
        }}
      />
      <Modal opened={modal === "delete"} onClose={() => setModal(null)} title={t("fp.deleteTitle")} centered>
        <Text size="sm" mb="md">{t("fp.deleteConfirm", { name: plan?.name ?? "" })}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setModal(null)}>{t("common.cancel")}</Button>
          <Button
            color="red"
            data-testid="fp-delete-confirm"
            onClick={async () => {
              try {
                await api.floorplan!.remove(sid, plan!.id);
                setPlanId(null);
                setModal(null);
                qc.invalidateQueries({ queryKey: ["floorplans", sid] });
              } catch (e) {
                notifyError(t, e);
              }
            }}
          >
            {t("common.delete")}
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}

/** عرض عنصر يُركَّب لاحقاً (مرجع بدالة، لأن الحاوية لا تظهر إلا بعد تحميل المخطط). */
function useWidth(): [number, (el: HTMLDivElement | null) => void] {
  const [width, setWidth] = useState(0);
  const obs = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    obs.current?.disconnect();
    if (!el) return;
    setWidth(el.clientWidth);
    obs.current = new ResizeObserver(([e]) => setWidth(Math.floor(e!.contentRect.width)));
    obs.current.observe(el);
  }, []);
  return [width, ref];
}

function PlanModal({ mode, plan, onClose, onSaved }: { mode: "create" | "edit" | null; plan?: FloorPlanDetail; onClose: () => void; onSaved: (p: FloorPlanDetail) => void }) {
  const { t } = useI18n();
  const { activeSchool } = useAuth();
  const sid = activeSchool?.id ?? "";
  const [name, setName] = useState("");
  const [image, setImage] = useState<{ dataUrl: string; file: string } | "" | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!mode) return;
    setName(mode === "edit" ? plan?.name ?? "" : "");
    setImage(undefined);
    setErr(null);
  }, [mode, plan]);

  const pick = async (f: File | null) => {
    if (!f) return;
    const r = await readImage(f, IMG, FLOORPLAN_IMAGE_MAX_BYTES);
    if (!r.ok) return setErr(r.error === "size" ? "errors.fileTooLarge" : "errors.fileType");
    setErr(null);
    setImage({ dataUrl: r.dataUrl, file: f.name });
  };
  const submit = async () => {
    if (!name.trim()) return setErr("errors.required");
    setBusy(true);
    try {
      const body = { name: name.trim(), background: image === undefined ? undefined : image === "" ? "" : image.dataUrl };
      onSaved(mode === "edit" ? await api.floorplan!.update(sid, plan!.id, body) : await api.floorplan!.create(sid, body));
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened={!!mode} onClose={onClose} title={t(mode === "edit" ? "fp.props" : "fp.new")} centered>
      <Stack data-testid="fp-form">
        <TextInput label={t("fp.name")} value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={120} required data-testid="fp-name" />
        <div>
          <Text size="sm" fw={500} mb={4}>{t("fp.background")}</Text>
          <Text size="xs" c="dimmed" mb={6}>{t("fp.backgroundHint")}</Text>
          <Group gap="xs">
            <FileButton onChange={pick} accept={IMG.join(",")}>
              {(p) => <Button {...p} variant="default" size="xs" leftSection={<IconPhoto size={14} />} data-testid="fp-bg">{t("fp.chooseImage")}</Button>}
            </FileButton>
            {mode === "edit" && plan?.hasBackground && image === undefined && (
              <Button size="xs" variant="subtle" color="red" onClick={() => setImage("")} data-testid="fp-bg-remove">{t("fp.removeBackground")}</Button>
            )}
          </Group>
          {image && <Text size="xs" mt={4} data-testid="fp-bg-name">{image.file}</Text>}
          {image === "" && <Text size="xs" mt={4} c="red">{t("fp.backgroundRemoved")}</Text>}
        </div>
        {err && <Text size="sm" c="red">{t(err)}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={submit} loading={busy} data-testid="fp-form-save">{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
