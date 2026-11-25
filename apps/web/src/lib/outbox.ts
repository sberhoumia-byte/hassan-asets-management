/**
 * طابور العمليات دون اتصال (Outbox) في IndexedDB.
 * كل عملية تحمل clientOpId ثابتاً؛ الخادم يطبقها مرة واحدة مهما أعيد الإرسال.
 * لا تُخزن هنا أي استجابات من الخادم ولا رموز دخول: فقط ما أدخله المستخدم نفسه.
 */
import { createStore, del, entries, get, set, type UseStore } from "idb-keyval";
import type { SyncApi, SyncOperation, SyncResult } from "../api";
import { ApiError } from "../api";

export type OutboxStatus = "PENDING" | "APPLIED" | "CONFLICT" | "REJECTED";
export interface OutboxEntry {
  clientOpId: string;
  userId: string;
  schoolId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  /** وصف مختصر للعرض (رمز المادة والكمية...). */
  label: string;
  clientCreatedAt: string;
  status: OutboxStatus;
  error?: string;
  details?: unknown;
  attempts: number;
  syncedAt?: string;
}

const KEEP_APPLIED_MS = 7 * 86400_000;
const BATCH = 50;
let store: UseStore | null = null;
const db = () => (store ??= createStore("hassan-outbox", "ops"));

export function deviceId(): string {
  try {
    let id = localStorage.getItem("hassan.deviceId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hassan.deviceId", id);
    }
    return id;
  } catch {
    return "unknown-device";
  }
}

export async function addToOutbox(e: Omit<OutboxEntry, "status" | "attempts" | "clientCreatedAt"> & { clientCreatedAt?: string }) {
  const prev = await get<OutboxEntry>(e.clientOpId, db());
  if (prev) return prev; // نفس النموذج أُرسل مرتين: عملية واحدة
  const entry: OutboxEntry = { ...e, clientCreatedAt: e.clientCreatedAt ?? new Date().toISOString(), status: "PENDING", attempts: 0 };
  await set(e.clientOpId, entry, db());
  return entry;
}

export async function listOutbox(userId: string): Promise<OutboxEntry[]> {
  const all = (await entries<string, OutboxEntry>(db())).map(([, v]) => v).filter((v) => v.userId === userId);
  // سجل محلي فقط: العمليات المطبقة منذ أكثر من أسبوع تُزال (تبقى في سجل المزامنة على الخادم)
  const old = all.filter((v) => v.status === "APPLIED" && v.syncedAt && Date.now() - Date.parse(v.syncedAt) > KEEP_APPLIED_MS);
  await Promise.all(old.map((v) => del(v.clientOpId, db())));
  return all.filter((v) => !old.includes(v)).sort((a, b) => b.clientCreatedAt.localeCompare(a.clientCreatedAt));
}

/** إخفاء عملية مرفوضة أو متعارضة بعد اطلاع المستخدم عليها (لا تُخفى العمليات المعلقة). */
export async function dismissOutbox(clientOpId: string) {
  const e = await get<OutboxEntry>(clientOpId, db());
  if (e && e.status !== "PENDING") await del(clientOpId, db());
}

let running: Promise<FlushResult> | null = null;
export interface FlushResult {
  sent: number;
  applied: number;
  failed: number;
  offline: boolean;
}

/** يرسل العمليات المعلقة لهذا المستخدم بالترتيب الزمني، مؤسسة بمؤسسة. تنفيذ واحد في كل مرة. */
export function flushOutbox(sync: SyncApi, userId: string): Promise<FlushResult> {
  return (running ??= doFlush(sync, userId).finally(() => (running = null)));
}

async function doFlush(sync: SyncApi, userId: string): Promise<FlushResult> {
  const out: FlushResult = { sent: 0, applied: 0, failed: 0, offline: false };
  const pending = (await listOutbox(userId)).filter((e) => e.status === "PENDING").sort((a, b) => a.clientCreatedAt.localeCompare(b.clientCreatedAt));
  const bySchool = new Map<string, OutboxEntry[]>();
  for (const e of pending) bySchool.set(e.schoolId, [...(bySchool.get(e.schoolId) ?? []), e]);
  for (const [sid, ops] of bySchool) {
    for (let i = 0; i < ops.length; i += BATCH) {
      const chunk = ops.slice(i, i + BATCH);
      let results: SyncResult[];
      try {
        results = (await sync.push(sid, deviceId(), chunk.map((e) => ({ clientOpId: e.clientOpId, operation: e.operation, payload: e.payload, clientCreatedAt: e.clientCreatedAt })))).results;
      } catch (err) {
        if (err instanceof ApiError && err.code === "NETWORK_ERROR") {
          out.offline = true;
          return out;
        }
        // خطأ عام (انتهاء الجلسة، فقدان الوصول للمؤسسة...): تبقى معلقة وتُعاد المحاولة لاحقاً
        await Promise.all(chunk.map((e) => set(e.clientOpId, { ...e, attempts: e.attempts + 1, error: err instanceof ApiError ? err.code : "ERROR" }, db())));
        break;
      }
      out.sent += chunk.length;
      for (const r of results) {
        const e = chunk.find((x) => x.clientOpId === r.clientOpId);
        if (!e) continue;
        const status: OutboxStatus = r.status === "RECEIVED" ? "PENDING" : r.status;
        if (status === "APPLIED") out.applied++;
        else if (status !== "PENDING") out.failed++;
        await set(e.clientOpId, { ...e, status, error: r.error, details: r.details, attempts: e.attempts + 1, syncedAt: status === "PENDING" ? undefined : new Date().toISOString() }, db());
      }
    }
  }
  return out;
}
