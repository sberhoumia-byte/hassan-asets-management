import { useEffect, useState } from "react";
import { Alert, Badge, Button, Center, Grid, Group, Image, Loader, Modal, Stack, Table, Tabs, Text, Textarea, Timeline } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconArchive, IconDownload, IconEdit, IconTool, IconUserShare } from "@tabler/icons-react";
import { useNavigate } from "react-router";
import QRCode from "qrcode";
import { api, ApiError, type Asset } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { usePlaces } from "../../hooks/usePlaces";
import { fmtMoney, notifyError } from "../../lib/forms";
import { STATUS_COLOR } from "./AssetsPage";

/** الرابط الذي يحمله رمز QR: يفتح شاشة المسح في نفس التطبيق، ولا يحمل إلا الرمز العشوائي. */
export function scanUrl(qrToken: string) {
  return `${window.location.origin}${window.location.pathname}#/scan/${qrToken}`;
}

export function AssetDetailModal({ schoolId, id, onClose, onEdit }: { schoolId: string; id: string; onClose: () => void; onEdit: (a: Asset) => void }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const q = useQuery({ queryKey: ["asset", schoolId, id], queryFn: () => api.assets!.get(schoolId, id) });
  const [archiving, setArchiving] = useState(false);
  const nav = useNavigate();
  const a = q.data;

  return (
    <Modal opened onClose={onClose} title={a ? `${a.inventoryNumber} — ${a.name}` : t("assets.details")} size="xl" centered>
      {q.isLoading && (
        <Center py="xl">
          <Loader />
        </Center>
      )}
      {q.isError && <Alert color="red">{t(q.error instanceof ApiError && q.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>}
      {a && (
        <Tabs defaultValue="info" keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="info">{t("assets.details")}</Tabs.Tab>
            <Tabs.Tab value="history" data-testid="asset-history-tab">{t("assets.history")}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="info">
            <Grid gutter="lg">
              <Grid.Col span={{ base: 12, sm: 8 }}>
                <Table variant="vertical" withTableBorder layout="fixed" data-testid="asset-details">
                  <Table.Tbody>
                    <Row k={t("assets.inventoryNumber")} v={<span dir="ltr" className="font-mono">{a.inventoryNumber}</span>} />
                    <Row k={t("assets.status")} v={<Badge variant="light" color={STATUS_COLOR[a.status]}>{t(`assetStatus.${a.status}`)}</Badge>} />
                    <Row k={t("assets.category")} v={cat.categoryLabel(a.categoryId)} />
                    <Row k={t("assets.type")} v={cat.lookupLabel(a.assetTypeId)} />
                    <Row k={t("assets.trackingMode")} v={`${t(`assets.mode.${a.trackingMode}`)} — ${t("assets.quantity")}: ${a.quantity}`} />
                    <Row k={t("assets.serialNumber")} v={a.serialNumber} />
                    <Row k={t("assets.acquisitionDate")} v={a.acquisitionDate ? fmtDate(a.acquisitionDate) : undefined} />
                    <Row k={t("assets.fundingSource")} v={cat.lookupLabel(a.fundingSourceId)} />
                    <Row k={t("assets.value")} v={a.acquisitionValue != null ? `${fmtMoney(a.acquisitionValue)} ${t("unit.mad")}` : undefined} />
                    <Row k={t("assets.supplier")} v={a.supplier?.name} />
                    <Row k={t("assets.room")} v={a.room} />
                    <Row k={t("assets.facility")} v={a.facility} />
                    <Row k={t("assets.responsible")} v={a.responsible} />
                    <Row k={t("assets.description")} v={a.description} />
                    {a.archivedAt && <Row k={t("assets.archivedAt")} v={fmtDate(a.archivedAt)} />}
                  </Table.Tbody>
                </Table>
              </Grid.Col>
              <Grid.Col span={{ base: 12, sm: 4 }}>
                <Stack align="center" gap="sm">
                  {a.photoDataUrl && <Image src={a.photoDataUrl} alt={t("assets.photo")} mah={160} fit="contain" radius="sm" className="border border-gray-200" />}
                  <QrBlock asset={a} />
                </Stack>
              </Grid.Col>
            </Grid>
            <Group justify="flex-end" mt="md">
              {!a.archivedAt && can("maintenance.create") && api.maintenance && (
                <Button variant="light" color="orange" leftSection={<IconTool size={16} />} onClick={() => nav(`/maintenance?new=1&targetType=asset&targetId=${a.id}`)} data-testid="asset-report-damage">
                  {t("assets.reportDamage")}
                </Button>
              )}
              {!a.archivedAt && can("custody.create") && api.custody && (
                <Button variant="light" leftSection={<IconUserShare size={16} />} onClick={() => nav(`/custody?new=1&asset=${a.id}`)} data-testid="asset-custody">
                  {t("assets.custodyOp")}
                </Button>
              )}
              {!a.archivedAt && can("assets.archive") && (
                <Button variant="light" color="red" leftSection={<IconArchive size={16} />} onClick={() => setArchiving(true)} data-testid="asset-archive">
                  {t("assets.archive")}
                </Button>
              )}
              {!a.archivedAt && can("assets.update") && (
                <Button leftSection={<IconEdit size={16} />} onClick={() => onEdit(a)} data-testid="asset-edit">
                  {t("common.edit")}
                </Button>
              )}
            </Group>
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <History schoolId={schoolId} id={a.id} />
          </Tabs.Panel>
        </Tabs>
      )}
      {a && archiving && <ArchiveModal schoolId={schoolId} asset={a} onClose={() => setArchiving(false)} />}
    </Modal>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <Table.Tr>
      <Table.Th w={150}>{k}</Table.Th>
      <Table.Td>{v || <Text span c="dimmed">—</Text>}</Table.Td>
    </Table.Tr>
  );
}

function QrBlock({ asset }: { asset: Asset }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(scanUrl(asset.qrToken), { errorCorrectionLevel: "M", margin: 1, width: 360 }).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [asset.qrToken]);
  if (!src) return null;
  return (
    <Stack align="center" gap={6} data-testid="asset-qr">
      <img src={src} alt={t("assets.qr")} width={150} height={150} />
      <Text size="xs" c="dimmed" ta="center">{t("assets.qrHint")}</Text>
      <Button component="a" href={src} download={`QR-${asset.inventoryNumber}.png`} size="xs" variant="light" leftSection={<IconDownload size={14} />}>
        {t("assets.downloadQr")}
      </Button>
    </Stack>
  );
}

const FIELD_KEYS: Record<string, string> = {
  inventoryNumber: "assets.inventoryNumber",
  name: "assets.name",
  categoryId: "assets.category",
  status: "assets.status",
  quantity: "assets.quantity",
  serialNumber: "assets.serialNumber",
  acquisitionDate: "assets.acquisitionDate",
  acquisitionValue: "assets.value",
  supplierId: "assets.supplier",
  description: "assets.description",
  roomId: "assets.room",
  facilityId: "assets.facility",
  responsibleStaffId: "assets.responsible",
};

function History({ schoolId, id }: { schoolId: string; id: string }) {
  const { t, fmtDateTime, dir } = useI18n();
  const cat = useCatalog();
  const places = usePlaces();
  const arrow = dir === "rtl" ? "←" : "→";
  const h = useQuery({ queryKey: ["asset-history", schoolId, id], queryFn: () => api.assets!.history(schoolId, id) });
  const show = (field: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "status") return t(`assetStatus.${String(v)}`);
    if (field === "categoryId") return cat.categoryLabel(String(v)) || String(v);
    if (field === "supplierId") return cat.suppliers.find((s) => s.id === v)?.name ?? "—";
    if (field === "roomId") return places.roomOptions.find((o) => o.value === v)?.label ?? "—";
    if (field === "facilityId") return places.facilityOptions.find((o) => o.value === v)?.label ?? "—";
    if (field === "responsibleStaffId") return places.staffOptions.find((o) => o.value === v)?.label ?? "—";
    return String(v);
  };
  if (h.isLoading) return <Loader size="sm" />;
  if (!h.data?.length) return <Text c="dimmed">{t("assets.noHistory")}</Text>;
  return (
    <Timeline bulletSize={14} lineWidth={2} data-testid="asset-history">
      {h.data.map((e, i) => (
        <Timeline.Item key={i} title={t(`assetAction.${e.action}`)}>
          <Text size="xs" c="dimmed">{fmtDateTime(e.at)} — {e.by}</Text>
          {e.reason && <Text size="sm">{t("assets.reason")}: {e.reason}</Text>}
          {e.changes?.map((c) => (
            <Text size="sm" key={c.field}>
              {t(FIELD_KEYS[c.field] ?? c.field)}: <Text span c="dimmed" td="line-through">{show(c.field, c.from)}</Text> {arrow} {show(c.field, c.to)}
            </Text>
          ))}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

function ArchiveModal({ schoolId, asset, onClose }: { schoolId: string; asset: Asset; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!reason.trim()) return setError(t("errors.required"));
    setBusy(true);
    try {
      await api.assets!.archive(schoolId, asset.id, reason.trim());
      await qc.invalidateQueries({ queryKey: ["assets", schoolId] });
      await qc.invalidateQueries({ queryKey: ["asset", schoolId, asset.id] });
      await qc.invalidateQueries({ queryKey: ["asset-history", schoolId, asset.id] });
      onClose();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={t("assets.archiveTitle")} centered>
      <Stack>
        <Text size="sm">{t("assets.archiveBody", { name: `${asset.inventoryNumber} — ${asset.name}` })}</Text>
        <Textarea label={t("assets.reason")} required value={reason} onChange={(e) => setReason(e.currentTarget.value)} error={error} autosize minRows={2} data-testid="archive-reason" />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color="red" onClick={confirm} loading={busy} data-testid="archive-confirm">{t("assets.archiveConfirm")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
