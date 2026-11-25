import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type SyncOperation } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";
import { addToOutbox, dismissOutbox, flushOutbox, listOutbox, type OutboxEntry } from "../lib/outbox";

interface Ctx {
  enabled: boolean;
  online: boolean;
  entries: OutboxEntry[];
  pending: number;
  syncing: boolean;
  queue: (op: { schoolId: string; clientOpId: string; operation: SyncOperation; payload: Record<string, unknown>; label: string }) => Promise<void>;
  flush: () => Promise<void>;
  dismiss: (clientOpId: string) => Promise<void>;
}
const OutboxCtx = createContext<Ctx | null>(null);

/** هل يجب حفظ العملية في الطابور بدل إرسالها؟ (لا اتصال، أو فشل الشبكة أثناء الإرسال) */
export const isOfflineError = (e: unknown) => e instanceof ApiError && e.code === "NETWORK_ERROR";

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const enabled = !!api.sync && !!user;
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return setEntries([]);
    try {
      setEntries(await listOutbox(user!.id));
    } catch {
      setEntries([]);
    }
  }, [enabled, user]);

  const flush = useCallback(async () => {
    if (!enabled || !navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await flushOutbox(api.sync!, user!.id);
      if (r.sent) {
        await Promise.all(["stock-items", "stock-movements", "stock-alerts", "inv-session", "inv-lines", "inv-disc", "inventory"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
        if (r.failed) notifications.show({ color: "orange", message: t("outbox.doneWithIssues", { applied: r.applied, failed: r.failed }) });
        else notifications.show({ color: "green", message: t("outbox.done", { n: r.applied }) });
      }
    } finally {
      setSyncing(false);
      await reload();
    }
  }, [enabled, user, qc, t, reload]);

  useEffect(() => {
    void reload().then(() => flush());
  }, [reload, flush]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      void flush();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [flush]);

  const pending = entries.filter((e) => e.status === "PENDING").length;
  // محاولة دورية ما دامت هناك عمليات معلقة (حالة اتصال متقطع لا يطلق حدث online)
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => void flush(), 30_000);
    return () => window.clearInterval(id);
  }, [pending, flush]);

  const value = useMemo<Ctx>(
    () => ({
      enabled,
      online,
      entries,
      pending,
      syncing,
      queue: async (op) => {
        await addToOutbox({ ...op, userId: user!.id });
        await reload();
      },
      flush,
      dismiss: async (id) => {
        await dismissOutbox(id);
        await reload();
      },
    }),
    [enabled, online, entries, pending, syncing, user, reload, flush],
  );
  return <OutboxCtx.Provider value={value}>{children}</OutboxCtx.Provider>;
}

export function useOutbox(): Ctx {
  const c = useContext(OutboxCtx);
  if (!c) throw new Error("useOutbox outside OutboxProvider");
  return c;
}
