import { useState } from "react";
import { Alert, Badge, Button, Card, FileButton, Group, Modal, PasswordInput, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDatabaseExport, IconDownload, IconRestore, IconShieldCheck, IconUpload } from "@tabler/icons-react";
import { api, ApiError, saveDownload, type Backup, type BackupStatus, type BackupVerify } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { notifyError } from "../../lib/forms";

const COLOR: Record<BackupStatus, string> = { RUNNING: "blue", SUCCEEDED: "teal", VERIFIED: "green", RESTORED: "grape", FAILED: "red" };
const mb = (n?: number) => (n === undefined ? "—" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/**
 * النسخ الاحتياطي للنظام كله (مدير النظام فقط): إنشاء نسخة مشفرة، التحقق منها، تنزيلها، رفع نسخة من خادم آخر،
 * والاستعادة بكلمة المرور وعبارة التأكيد (مع نسخة أمان تلقائية قبلها).
 */
export function BackupPage() {
  const { t, fmtDateTime } = useI18n();
  const { isSystemAdmin } = useAuth();
  const qc = useQueryClient();
  const allowed = !!api.backups && isSystemAdmin;
  const list = useQuery({ queryKey: ["backups"], queryFn: () => api.backups!.list(), enabled: allowed });
  const [busy, setBusy] = useState<string | null>(null);
  const [checked, setChecked] = useState<BackupVerify | null>(null);
  const [restoring, setRestoring] = useState<Backup | null>(null);
  if (!api.backups) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;
  if (!isSystemAdmin) return <Alert color="red" mt="md">{t("errors.forbidden")}</Alert>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["backups"] });
  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) notifications.show({ color: "green", message: ok });
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(null);
      await refresh();
    }
  };
  const d = list.data;

  return (
    <Stack mt="md">
      <Card>
        <Text size="sm" mb="sm">{t("backup.intro")}</Text>
        {d && !d.encryption && <Alert color="red" mb="sm" data-testid="backup-nokey">{t("backup.noKey")}</Alert>}
        <Text size="xs" c="dimmed" mb="sm" data-testid="backup-schedule">
          {d?.dailyHour === null || d?.dailyHour === undefined ? t("backup.scheduleOff") : t("backup.scheduleOn", { hour: d.dailyHour })}
        </Text>
        <Group gap="sm">
          <Button leftSection={<IconDatabaseExport size={16} />} loading={busy === "create"} disabled={!d?.encryption} onClick={() => act("create", () => api.backups!.create(), t("backup.created"))} data-testid="backup-create">
            {t("backup.create")}
          </Button>
          <FileButton accept=".hbk,application/octet-stream" onChange={(f) => f && act("upload", () => api.backups!.upload(f), t("backup.uploaded"))}>
            {(p) => <Button {...p} variant="default" leftSection={<IconUpload size={16} />} loading={busy === "upload"} disabled={!d?.encryption} data-testid="backup-upload">{t("backup.upload")}</Button>}
          </FileButton>
        </Group>
      </Card>
      <Card>
        <Table.ScrollContainer minWidth={820}>
          <Table fz="sm" striped data-testid="backup-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("backup.at")}</Table.Th>
                <Table.Th>{t("backup.status")}</Table.Th>
                <Table.Th>{t("backup.size")}</Table.Th>
                <Table.Th>{t("backup.hash")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(d?.items ?? []).map((b) => {
                const usable = b.status !== "FAILED" && b.status !== "RUNNING";
                return (
                  <Table.Tr key={b.id} data-testid={`backup-row-${b.id}`}>
                    <Table.Td>
                      {fmtDateTime(b.startedAt)}
                      {b.scheduled && <Badge ms={6} size="xs" variant="light">{t("backup.auto")}</Badge>}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={COLOR[b.status]} variant="light">{t(`backup.st.${b.status}`)}</Badge>
                      {b.error && <Text size="xs" c="red">{b.error}</Text>}
                    </Table.Td>
                    <Table.Td>{mb(b.sizeBytes)}</Table.Td>
                    <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-xs">{b.sha256?.slice(0, 16) ?? "—"}</Table.Td>
                    <Table.Td>
                      {usable && (
                        <Group gap={4} wrap="nowrap">
                          <Button size="compact-xs" variant="light" leftSection={<IconShieldCheck size={14} />} loading={busy === `v${b.id}`} onClick={() => act(`v${b.id}`, async () => setChecked(await api.backups!.verify(b.id)))} data-testid={`backup-verify-${b.id}`}>{t("backup.verify")}</Button>
                          <Button size="compact-xs" variant="default" leftSection={<IconDownload size={14} />} loading={busy === `d${b.id}`} onClick={() => act(`d${b.id}`, async () => saveDownload(await api.backups!.download(b.id)))} data-testid={`backup-download-${b.id}`}>{t("backup.download")}</Button>
                          <Button size="compact-xs" color="red" variant="light" leftSection={<IconRestore size={14} />} onClick={() => setRestoring(b)} data-testid={`backup-restore-${b.id}`}>{t("backup.restore")}</Button>
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {d && !d.items.length && <Text c="dimmed" ta="center" py="md">{t("backup.none")}</Text>}
      </Card>

      <Modal opened={!!checked} onClose={() => setChecked(null)} title={t("backup.verifyTitle")} centered>
        {checked && (
          <Stack gap="xs" data-testid="backup-verified">
            <Alert color="green">{t("backup.verifyOk", { date: fmtDateTime(checked.manifest.createdAt) })}</Alert>
            {checked.manifest.migration !== checked.currentMigration && <Alert color="orange">{t("backup.mismatch")}</Alert>}
            <Text size="sm">{t("backup.counts", { assets: checked.manifest.counts.assets ?? 0, users: checked.manifest.counts.users ?? 0, movements: checked.manifest.counts.stock_movements ?? 0, audit: checked.manifest.counts.audit_logs ?? 0 })}</Text>
          </Stack>
        )}
      </Modal>
      {restoring && d && <RestoreModal backup={restoring} phrase={d.restorePhrase} onClose={() => setRestoring(null)} onDone={refresh} />}
    </Stack>
  );
}

function RestoreModal({ backup, phrase, onClose, onDone }: { backup: Backup; phrase: string; onClose: () => void; onDone: () => unknown }) {
  const { t, fmtDateTime } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.backups!.restore(backup.id, password, confirm);
      notifications.show({ color: "green", autoClose: false, message: t("backup.restored") });
      await onDone();
      onClose();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setErr(code === "INVALID_CREDENTIALS" || code === "WRONG_PASSWORD" ? t("errors.wrongPassword") : code === "BACKUP_SCHEMA_MISMATCH" ? t("backup.mismatch") : code === "VALIDATION_ERROR" ? t("errors.confirmPhrase") : null);
      if (!["INVALID_CREDENTIALS", "WRONG_PASSWORD", "BACKUP_SCHEMA_MISMATCH", "VALIDATION_ERROR"].includes(code)) notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={t("backup.restoreTitle")} centered>
      <Stack data-testid="restore-form">
        <Alert color="red">{t("backup.restoreWarn", { date: fmtDateTime(backup.startedAt) })}</Alert>
        <PasswordInput label={t("backup.password")} value={password} onChange={(e) => setPassword(e.currentTarget.value)} data-testid="restore-password" />
        <TextInput label={t("backup.typePhrase", { phrase })} value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} data-testid="restore-confirm" />
        {err && <Text size="sm" c="red" data-testid="restore-error">{err}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color="red" loading={busy} disabled={!password || confirm !== phrase} onClick={go} data-testid="restore-go">{t("backup.restore")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
