import type { Backup, BackupsApi, BackupVerify } from "../phase9";
import type { HttpApi } from "./httpApi";

export class HttpBackupsApi implements BackupsApi {
  constructor(private h: HttpApi) {}
  list() {
    return this.h.request<Awaited<ReturnType<BackupsApi["list"]>>>("GET", "/backups");
  }
  create() {
    return this.h.request<Backup>("POST", "/backups", { body: {} });
  }
  verify(id: string) {
    return this.h.request<BackupVerify>("POST", `/backups/${id}/verify`, { body: {} });
  }
  download(id: string) {
    return this.h.requestFile("GET", `/backups/${id}/download`);
  }
  upload(file: Blob) {
    return this.h.request<Backup>("POST", "/backups/upload", { raw: file });
  }
  restore(id: string, password: string, confirm: string) {
    return this.h.request<Awaited<ReturnType<BackupsApi["restore"]>>>("POST", `/backups/${id}/restore`, { body: { password, confirm } });
  }
}
