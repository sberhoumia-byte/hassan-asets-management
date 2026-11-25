import type { Paged } from "../phase4";
import type { AppNotification, AuditApi, AuditEntry, AuditQuery, FloorPlanApi, FloorPlanDetail, FloorPlanShape, FloorPlanSummary, NotificationsApi, NotificationType, SyncApi, SyncHistoryRow, SyncResult } from "../phase8";
import type { HttpApi } from "./httpApi";

type Pref = { type: NotificationType; enabled: boolean };

export class HttpNotificationsApi implements NotificationsApi {
  constructor(private h: HttpApi) {}
  list(unreadOnly?: boolean) {
    return this.h.request<{ unread: number; items: AppNotification[] }>("GET", "/notifications", { query: { unread: unreadOnly ? "1" : undefined } });
  }
  read(id: string) {
    return this.h.request("POST", `/notifications/${id}/read`, { body: {} });
  }
  readAll() {
    return this.h.request("POST", "/notifications/read-all", { body: {} });
  }
  preferences() {
    return this.h.request<Pref[]>("GET", "/notifications/preferences");
  }
  setPreferences(items: Pref[]) {
    return this.h.request<Pref[]>("PUT", "/notifications/preferences", { body: { items } });
  }
  runNow(sid: string) {
    return this.h.request<{ created: number; active: number }>("POST", `/schools/${sid}/notifications/run`, { body: {} });
  }
}

export class HttpAuditApi implements AuditApi {
  constructor(private h: HttpApi) {}
  list(sid: string, q: AuditQuery) {
    return this.h.request<Paged<AuditEntry>>("GET", `/schools/${sid}/audit-logs`, { query: { ...q } });
  }
  facets(sid: string) {
    return this.h.request<{ actions: string[]; entityTypes: string[]; users: { id: string; name: string }[] }>("GET", `/schools/${sid}/audit-logs/facets`);
  }
}

export class HttpFloorPlanApi implements FloorPlanApi {
  constructor(private h: HttpApi) {}
  list(sid: string) {
    return this.h.request<FloorPlanSummary[]>("GET", `/schools/${sid}/floor-plans`);
  }
  get(sid: string, id: string) {
    return this.h.request<FloorPlanDetail>("GET", `/schools/${sid}/floor-plans/${id}`);
  }
  create(sid: string, i: { name: string; background?: string }) {
    return this.h.request<FloorPlanDetail>("POST", `/schools/${sid}/floor-plans`, { body: i });
  }
  update(sid: string, id: string, i: { name: string; background?: string }) {
    return this.h.request<FloorPlanDetail>("PUT", `/schools/${sid}/floor-plans/${id}`, { body: i });
  }
  saveShapes(sid: string, id: string, shapes: FloorPlanShape[]) {
    const clean = shapes.map((s) => ({ kind: s.kind, geometry: s.geometry, label: s.label || undefined, roomId: s.roomId || undefined, facilityId: s.facilityId || undefined }));
    return this.h.request<FloorPlanDetail>("PUT", `/schools/${sid}/floor-plans/${id}/shapes`, { body: { shapes: clean } });
  }
  remove(sid: string, id: string) {
    return this.h.request("DELETE", `/schools/${sid}/floor-plans/${id}`);
  }
  async background(sid: string, id: string) {
    return (await this.h.requestFile("GET", `/schools/${sid}/floor-plans/${id}/background`)).blob;
  }
}

export class HttpSyncApi implements SyncApi {
  constructor(private h: HttpApi) {}
  push(sid: string, deviceId: string, operations: Parameters<SyncApi["push"]>[2]) {
    return this.h.request<{ results: SyncResult[] }>("POST", `/schools/${sid}/sync`, { body: { deviceId, operations } });
  }
  history(sid: string) {
    return this.h.request<SyncHistoryRow[]>("GET", `/schools/${sid}/sync`);
  }
}
