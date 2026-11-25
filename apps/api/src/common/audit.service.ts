import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AppRequest } from "./context";

type Tx = Prisma.TransactionClient | PrismaService;

export interface AuditEntry {
  action: string; // LOGIN, SETUP, SCHOOL_UPDATE, BRANDING_SAVE, ...
  entityType: string;
  entityId?: string | null;
  schoolId?: string | null;
  userId?: string | null;
  before?: unknown;
  after?: unknown;
}

const REDACT = /password|token|hash|secret|dataurl/i;

/** يحذف الحقول الحساسة والصور المضمنة قبل الحفظ في سجل التدقيق. */
export function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, REDACT.test(k) ? (x ? "[redacted]" : x) : redact(x)]),
    );
  }
  return v;
}

/** سجل التدقيق: إلحاق فقط (مشغّل في القاعدة يمنع التعديل والحذف). */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(entry: AuditEntry, req?: AppRequest, tx: Tx = this.prisma) {
    await tx.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        schoolId: entry.schoolId ?? req?.schoolId ?? null,
        userId: entry.userId ?? req?.user?.id ?? null,
        before: entry.before === undefined ? undefined : (redact(entry.before) as Prisma.InputJsonValue),
        after: entry.after === undefined ? undefined : (redact(entry.after) as Prisma.InputJsonValue),
        ipAddress: req?.ip ?? null,
        userAgent: req?.headers?.["user-agent"]?.slice(0, 300) ?? null,
        requestId: req?.requestId ?? null,
      },
    });
  }
}
