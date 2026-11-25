import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type SyncApi } from "../api";
import { addToOutbox, dismissOutbox, flushOutbox, listOutbox } from "./outbox";

const op = (id: string, userId = "u1", schoolId = "s1") => ({ clientOpId: id, userId, schoolId, operation: "stock.out" as const, payload: { itemId: "i", warehouseId: "w", quantity: 1, reason: "r" }, label: id });

describe("طابور العمليات دون اتصال", () => {
  it("نفس clientOpId مرتين ← إدخال واحد، ولكل مستخدم طابوره", async () => {
    await addToOutbox(op("a"));
    await addToOutbox(op("a"));
    await addToOutbox(op("z", "u2"));
    expect((await listOutbox("u1")).map((e) => e.clientOpId)).toEqual(["a"]);
    expect((await listOutbox("u2")).map((e) => e.clientOpId)).toEqual(["z"]);
  });

  it("انقطاع الشبكة أثناء الإرسال يُبقي العمليات معلقة", async () => {
    const sync: SyncApi = { push: vi.fn().mockRejectedValue(new ApiError("NETWORK_ERROR")), history: vi.fn() };
    const r = await flushOutbox(sync, "u1");
    expect(r).toMatchObject({ offline: true, sent: 0 });
    expect((await listOutbox("u1"))[0]!.status).toBe("PENDING");
  });

  it("النتائج تُسجل لكل عملية، وRECEIVED تبقى معلقة، وتشغيلان متزامنان يرسلان مرة واحدة", async () => {
    await addToOutbox(op("b"));
    await addToOutbox(op("c"));
    const push = vi.fn(async (_sid: string, _dev: string, ops: { clientOpId: string }[]) => ({
      results: ops.map((o) => ({ clientOpId: o.clientOpId, status: o.clientOpId === "b" ? ("CONFLICT" as const) : o.clientOpId === "c" ? ("RECEIVED" as const) : ("APPLIED" as const), error: o.clientOpId === "b" ? "STOCK_INSUFFICIENT" : undefined })),
    }));
    const sync: SyncApi = { push, history: vi.fn() };
    const [r1, r2] = await Promise.all([flushOutbox(sync, "u1"), flushOutbox(sync, "u1")]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
    expect(r1).toMatchObject({ sent: 3, applied: 1, failed: 1 });
    const by = Object.fromEntries((await listOutbox("u1")).map((e) => [e.clientOpId, e.status]));
    expect(by).toEqual({ a: "APPLIED", b: "CONFLICT", c: "PENDING" });
    // الإخفاء لا يمس المعلقة
    await dismissOutbox("c");
    await dismissOutbox("b");
    expect((await listOutbox("u1")).map((e) => e.clientOpId).sort()).toEqual(["a", "c"]);
  });
});
