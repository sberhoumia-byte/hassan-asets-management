/** عقود المرحلة 9: النسخ الاحتياطي والاستعادة (مدير النظام، الخادم فقط). */
import type { GeneratedDownload } from "./phase7";

export type BackupStatus = "RUNNING" | "SUCCEEDED" | "FAILED" | "VERIFIED" | "RESTORED";
export interface Backup {
  id: string;
  kind: string;
  status: BackupStatus;
  sizeBytes?: number;
  sha256?: string;
  scheduled: boolean;
  startedAt: string;
  finishedAt?: string;
  verifiedAt?: string;
  restoredAt?: string;
  error?: string;
}
export interface BackupVerify extends Backup {
  manifest: { createdAt: string; migration: string; counts: Record<string, number> };
  currentMigration: string;
}
export interface BackupsApi {
  list(): Promise<{ items: Backup[]; encryption: boolean; dailyHour: number | null; restorePhrase: string }>;
  create(): Promise<Backup>;
  verify(id: string): Promise<BackupVerify>;
  download(id: string): Promise<GeneratedDownload>;
  upload(file: Blob): Promise<Backup>;
  restore(id: string, password: string, confirm: string): Promise<Backup & { safetyBackupId: string; counts: Record<string, number> }>;
}
