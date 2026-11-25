import { Injectable } from "@nestjs/common";
import type { AcademyInput, DirectorateInput, SchoolInput } from "@hassan/validation";
import { schoolYearLabel } from "@hassan/validation";
import { matchesQuery } from "@hassan/shared";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../common/audit.service";
import { AccessService } from "../rbac/access.service";
import { E } from "../common/errors";
import { compact, nullify, UUID_RE } from "../common/util";
import { parse } from "../common/zod";
import type { AppRequest } from "../common/context";

const byName = <T extends { nameAr: string }>(a: T, b: T) => a.nameAr.localeCompare(b.nameAr, "ar");

type SchoolRow = {
  id: string;
  directorateId: string;
  nameAr: string;
  nameFr: string | null;
  adminCode: string | null;
  cycle: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  schoolYears?: { label: string }[];
};

export function schoolDto(s: SchoolRow) {
  return compact({
    id: s.id,
    directorateId: s.directorateId,
    nameAr: s.nameAr,
    nameFr: s.nameFr,
    adminCode: s.adminCode,
    cycle: s.cycle,
    address: s.address,
    phone: s.phone,
    email: s.email,
    schoolYear: s.schoolYears?.[0]?.label,
  });
}

const withCurrentYear = { schoolYears: { where: { isCurrent: true }, select: { label: true } } } as const;

@Injectable()
export class HierarchyService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private access: AccessService,
  ) {}

  async listAcademies() {
    const rows = await this.prisma.academy.findMany();
    return rows.sort(byName).map((a) => compact({ id: a.id, nameAr: a.nameAr, nameFr: a.nameFr, code: a.code }));
  }

  async createAcademy(input: AcademyInput, req: AppRequest) {
    const data = nullify(input);
    if (await this.prisma.academy.findFirst({ where: { nameAr: data.nameAr! } })) throw E.conflict("DUPLICATE_NAME");
    if (data.code && (await this.prisma.academy.findFirst({ where: { code: data.code } }))) throw E.conflict("DUPLICATE_CODE");
    const a = await this.prisma.$transaction(async (tx) => {
      const a = await tx.academy.create({ data: { nameAr: data.nameAr!, nameFr: data.nameFr, code: data.code } });
      await this.audit.log({ action: "ACADEMY_CREATE", entityType: "Academy", entityId: a.id, after: a }, req, tx);
      return a;
    });
    return compact({ id: a.id, nameAr: a.nameAr, nameFr: a.nameFr, code: a.code });
  }

  async listDirectorates(academyId?: string) {
    if (academyId && !UUID_RE.test(academyId)) return [];
    const rows = await this.prisma.provincialDirectorate.findMany({ where: academyId ? { academyId } : {} });
    return rows
      .sort(byName)
      .map((d) => compact({ id: d.id, academyId: d.academyId, nameAr: d.nameAr, nameFr: d.nameFr, code: d.code }));
  }

  async createDirectorate(input: DirectorateInput, req: AppRequest) {
    const data = nullify(input);
    if (!UUID_RE.test(input.academyId) || !(await this.prisma.academy.findUnique({ where: { id: input.academyId } })))
      throw E.rule("ACADEMY_NOT_FOUND");
    if (await this.prisma.provincialDirectorate.findFirst({ where: { academyId: input.academyId, nameAr: data.nameAr! } }))
      throw E.conflict("DUPLICATE_NAME");
    const d = await this.prisma.$transaction(async (tx) => {
      const d = await tx.provincialDirectorate.create({
        data: { academyId: input.academyId, nameAr: data.nameAr!, nameFr: data.nameFr, code: data.code },
      });
      await this.audit.log({ action: "DIRECTORATE_CREATE", entityType: "ProvincialDirectorate", entityId: d.id, after: d }, req, tx);
      return d;
    });
    return compact({ id: d.id, academyId: d.academyId, nameAr: d.nameAr, nameFr: d.nameFr, code: d.code });
  }

  /** المؤسسات المرئية للمستخدم فقط (مدير النظام: الكل). البحث يطبع العربية (تشكيل، همزات، ة/ه). */
  async listSchools(userId: string, params: { directorateId?: string; q?: string }) {
    const visible = await this.access.visibleSchoolIds(userId);
    if (params.directorateId && !UUID_RE.test(params.directorateId)) return [];
    const rows = await this.prisma.school.findMany({
      where: {
        ...(visible === "ALL" ? {} : { id: { in: visible } }),
        ...(params.directorateId ? { directorateId: params.directorateId } : {}),
      },
      include: withCurrentYear,
    });
    return rows
      .filter((s) => matchesQuery(params.q ?? "", s.nameAr, s.nameFr ?? undefined, s.adminCode ?? undefined))
      .sort(byName)
      .map(schoolDto);
  }

  async getSchool(id: string) {
    const s = await this.prisma.school.findUnique({ where: { id }, include: withCurrentYear });
    if (!s) throw E.notFound();
    return schoolDto(s);
  }

  private async checkSchoolInput(input: SchoolInput, exceptId?: string) {
    if (!UUID_RE.test(input.directorateId) || !(await this.prisma.provincialDirectorate.findUnique({ where: { id: input.directorateId } })))
      throw E.rule("DIRECTORATE_NOT_FOUND");
    if (input.adminCode) {
      const dup = await this.prisma.school.findFirst({ where: { adminCode: input.adminCode, ...(exceptId ? { NOT: { id: exceptId } } : {}) } });
      if (dup) throw E.conflict("DUPLICATE_ADMIN_CODE");
    }
  }

  async createSchool(input: SchoolInput, req: AppRequest) {
    await this.checkSchoolInput(input);
    const data = nullify(input);
    const s = await this.prisma.$transaction(async (tx) => {
      const s = await tx.school.create({
        data: { ...data, directorateId: input.directorateId, nameAr: data.nameAr! },
        include: withCurrentYear,
      });
      await tx.schoolSettings.create({ data: { schoolId: s.id } });
      await this.audit.log({ action: "SCHOOL_CREATE", entityType: "School", entityId: s.id, schoolId: s.id, after: schoolDto(s) }, req, tx);
      return s;
    });
    return schoolDto(s);
  }

  async updateSchool(id: string, input: SchoolInput & { schoolYear?: string }, req: AppRequest) {
    const before = await this.prisma.school.findUnique({ where: { id }, include: withCurrentYear });
    if (!before) throw E.notFound();
    await this.checkSchoolInput(input, id);
    const { schoolYear, ...rest } = input;
    if (schoolYear) parse(schoolYearLabel, schoolYear);
    const data = nullify(rest);
    const s = await this.prisma.$transaction(async (tx) => {
      await tx.school.update({ where: { id }, data: { ...data, directorateId: input.directorateId, nameAr: data.nameAr! } });
      if (schoolYear && schoolYear !== before.schoolYears[0]?.label) await this.setCurrentYear(tx, id, schoolYear);
      const after = await tx.school.findUniqueOrThrow({ where: { id }, include: withCurrentYear });
      await this.audit.log(
        { action: "SCHOOL_UPDATE", entityType: "School", entityId: id, schoolId: id, before: schoolDto(before), after: schoolDto(after) },
        req,
        tx,
      );
      return after;
    });
    return schoolDto(s);
  }

  /** سنة دراسية حالية واحدة لكل مؤسسة (فهرس فريد جزئي في القاعدة). من شتنبر إلى يوليوز. */
  private async setCurrentYear(tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0], schoolId: string, label: string) {
    const start = Number(label.slice(0, 4));
    await tx.schoolYear.updateMany({ where: { schoolId, isCurrent: true }, data: { isCurrent: false } });
    await tx.schoolYear.upsert({
      where: { schoolId_label: { schoolId, label } },
      create: { schoolId, label, startDate: new Date(Date.UTC(start, 8, 1)), endDate: new Date(Date.UTC(start + 1, 6, 31)), isCurrent: true },
      update: { isCurrent: true },
    });
  }
}
