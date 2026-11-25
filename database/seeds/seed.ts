/**
 * seed الإنتاج — آمن للتكرار (idempotent):
 *  - الأدوار والصلاحيات الأساسية وربطها.
 *  - القوائم المرجعية العامة.
 *  - التسلسل الإداري الافتراضي (المادة 7) إن لم توجد أي مؤسسة.
 * لا يُنشئ أي مستخدم: حساب المدير يُنشأ من شاشة «الإعداد الأول».
 */
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "./adapter";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  allPermissionCodes,
  defaultRolePermissions,
  DEFAULT_HIERARCHY,
  GLOBAL_LOOKUPS,
  ROLE_CODES,
  ROLE_NAMES,
} from "../../packages/shared/src/index";

const envFile = resolve(__dirname, "../../.env");
if (existsSync(envFile) && !process.env.DATABASE_URL) process.loadEnvFile(envFile);

export async function seedBase(prisma: PrismaClient) {
  // الصلاحيات
  for (const code of allPermissionCodes()) {
    const [module, action] = code.split(".") as [string, string];
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, module, action } });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));

  // الأدوار وصلاحياتها الافتراضية (لا تُمس الأدوار التي عدّلها المدير لاحقاً إلا بإضافة ما ينقص)
  const defaults = defaultRolePermissions();
  for (const code of ROLE_CODES) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { nameAr: ROLE_NAMES[code].ar, nameFr: ROLE_NAMES[code].fr, isSystem: true },
      create: { code, nameAr: ROLE_NAMES[code].ar, nameFr: ROLE_NAMES[code].fr, isSystem: true },
    });
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      await prisma.rolePermission.createMany({
        data: defaults[code].map((p) => ({ roleId: role.id, permissionId: perms.get(p)! })),
        skipDuplicates: true,
      });
    }
  }

  // القوائم العامة (schoolId = null)
  for (const [listKey, values] of Object.entries(GLOBAL_LOOKUPS)) {
    for (const [i, v] of values.entries()) {
      const found = await prisma.lookupValue.findFirst({ where: { schoolId: null, listKey, code: v.code } });
      if (!found) {
        await prisma.lookupValue.create({
          data: { listKey, code: v.code, labelAr: v.ar, labelFr: v.fr, sortOrder: i },
        });
      }
    }
  }

  // التسلسل الإداري الافتراضي
  if ((await prisma.school.count()) === 0) {
    const academy = await prisma.academy.create({ data: DEFAULT_HIERARCHY.academy });
    const directorate = await prisma.provincialDirectorate.create({
      data: { academyId: academy.id, ...DEFAULT_HIERARCHY.directorate },
    });
    const school = await prisma.school.create({ data: { directorateId: directorate.id, ...DEFAULT_HIERARCHY.school } });
    await prisma.schoolSettings.create({ data: { schoolId: school.id } });
  }
}

async function main() {
  const prisma = new PrismaClient({ adapter: pgAdapter(process.env.DATABASE_URL!) });
  try {
    await seedBase(prisma);
    console.log("seed: OK");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
