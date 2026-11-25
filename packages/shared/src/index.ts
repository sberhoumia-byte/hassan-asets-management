/**
 * تعريف الصلاحيات والأدوار (RBAC) — مصدر واحد يستعمله الخادم وseed والواجهة.
 * صيغة الصلاحية: <module>.<action>
 */

export const MODULES = [
  "dashboard",
  "schools",
  "branding",
  "users",
  "assets",
  "stock",
  "spaces",
  "facilities",
  "resources",
  "loans",
  "inventory",
  "maintenance",
  "purchasing",
  "custody",
  "suppliers",
  "floorplan",
  "imports",
  "documents",
  "reports",
  "audit",
  "backup",
  "settings",
  "lookups",
] as const;
export type Module = (typeof MODULES)[number];

export const STANDARD_ACTIONS = ["view", "create", "update", "approve", "cancel", "archive", "export", "print"] as const;

/** أفعال خاصة خارج الأفعال المعيارية. */
export const SPECIAL_PERMISSIONS = [
  "stock.adjust",
  "stock.reverse",
  "inventory.validate",
  "backup.restore",
  "users.manage",
  "settings.manage",
  "lookups.manage",
  "reports.choose_letterhead",
] as const;

export function allPermissionCodes(): string[] {
  const std = MODULES.flatMap((m) => STANDARD_ACTIONS.map((a) => `${m}.${a}`));
  return [...std, ...SPECIAL_PERMISSIONS];
}

export const ROLE_CODES = [
  "ADMIN",
  "DIRECTOR",
  "ASSET_MANAGER",
  "STOCK_MANAGER",
  "MAINTENANCE_MANAGER",
  "EDUCATIONAL_RESOURCES_MANAGER",
  "INVENTORY_MANAGER",
  "DOCUMENT_MANAGER",
  "VIEWER",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_NAMES: Record<RoleCode, { ar: string; fr: string }> = {
  ADMIN: { ar: "مدير النظام", fr: "Administrateur" },
  DIRECTOR: { ar: "مدير المؤسسة", fr: "Directeur" },
  ASSET_MANAGER: { ar: "مسؤول الممتلكات", fr: "Gestionnaire des biens" },
  STOCK_MANAGER: { ar: "مسؤول المخزون", fr: "Gestionnaire du stock" },
  MAINTENANCE_MANAGER: { ar: "مسؤول الصيانة", fr: "Responsable maintenance" },
  EDUCATIONAL_RESOURCES_MANAGER: { ar: "مسؤول الوسائل التعليمية", fr: "Responsable moyens didactiques" },
  INVENTORY_MANAGER: { ar: "مسؤول الجرد", fr: "Responsable inventaire" },
  DOCUMENT_MANAGER: { ar: "مسؤول الوثائق", fr: "Responsable documents" },
  VIEWER: { ar: "اطلاع فقط", fr: "Consultation" },
};

const all = (m: Module) => STANDARD_ACTIONS.map((a) => `${m}.${a}`);
const view = (...ms: Module[]) => ms.map((m) => `${m}.view`);

/** الصلاحيات الافتراضية لكل دور (المدير يخصصها لكل مستخدم بعد ذلك). */
export function defaultRolePermissions(): Record<RoleCode, string[]> {
  const everything = allPermissionCodes();
  return {
    ADMIN: everything,
    DIRECTOR: everything.filter((p) => p !== "backup.restore"),
    ASSET_MANAGER: [...all("assets"), ...all("custody"), ...view("dashboard", "spaces", "facilities", "suppliers", "documents"), "spaces.update", "reports.view", "reports.export", "reports.print"],
    STOCK_MANAGER: [...all("stock"), ...all("suppliers"), ...view("dashboard", "purchasing", "documents"), "stock.reverse", "reports.view", "reports.export", "reports.print"],
    MAINTENANCE_MANAGER: [...all("maintenance"), ...all("facilities"), ...view("dashboard", "spaces", "assets", "suppliers", "documents"), "reports.view", "reports.print"],
    EDUCATIONAL_RESOURCES_MANAGER: [...all("resources"), ...all("loans"), ...view("dashboard", "spaces"), "reports.view", "reports.print"],
    INVENTORY_MANAGER: [...all("inventory").filter((p) => p !== "inventory.approve"), ...view("dashboard", "assets", "stock", "resources", "spaces"), "reports.view", "reports.print"],
    DOCUMENT_MANAGER: [...all("documents"), ...view("dashboard"), "reports.view"],
    VIEWER: MODULES.filter((m) => !["users", "audit", "backup", "settings"].includes(m)).map((m) => `${m}.view`),
  };
}

/** القوائم المرجعية العامة (قابلة للتعديل من الواجهة). لا تتضمن أي بيانات واقعية للمؤسسة. */
export const GLOBAL_LOOKUPS: Record<string, { code: string; ar: string; fr: string }[]> = {
  FUNDING_SOURCE: [
    { code: "SCHOOL_BUDGET", ar: "ميزانية المؤسسة", fr: "Budget de l'établissement" },
    { code: "ASSOCIATION", ar: "جمعية", fr: "Association" },
    { code: "PARTNERSHIP", ar: "شراكة", fr: "Partenariat" },
    { code: "DONATION", ar: "هبة", fr: "Don" },
    { code: "OTHER", ar: "أخرى", fr: "Autre" },
  ],
  UNIT_OF_MEASURE: [
    { code: "PCS", ar: "قطعة", fr: "Pièce" },
    { code: "BOX", ar: "علبة", fr: "Boîte" },
    { code: "PACK", ar: "رزمة", fr: "Paquet" },
    { code: "REAM", ar: "رزمة ورق", fr: "Rame" },
    { code: "L", ar: "لتر", fr: "Litre" },
    { code: "KG", ar: "كيلوغرام", fr: "Kilogramme" },
    { code: "M", ar: "متر", fr: "Mètre" },
  ],
  SPACE_TYPE: [
    { code: "CLASSROOM", ar: "حجرة دراسية", fr: "Salle de classe" },
    { code: "OFFICE", ar: "مكتب إداري", fr: "Bureau administratif" },
    { code: "TEACHERS_ROOM", ar: "قاعة الأساتذة", fr: "Salle des professeurs" },
    { code: "LIBRARY", ar: "المكتبة", fr: "Bibliothèque" },
    { code: "LAB", ar: "المختبر", fr: "Laboratoire" },
    { code: "IT_ROOM", ar: "قاعة الإعلاميات", fr: "Salle informatique" },
    { code: "STOREROOM", ar: "المستودع", fr: "Magasin" },
    { code: "SANITARY", ar: "المرافق الصحية", fr: "Sanitaires" },
    { code: "CANTEEN", ar: "المطعم", fr: "Cantine" },
    { code: "HOUSING", ar: "السكن الإداري", fr: "Logement administratif" },
    { code: "YARD", ar: "الساحة", fr: "Cour" },
    { code: "WALL", ar: "السور", fr: "Mur d'enceinte" },
    { code: "ENTRANCE", ar: "المدخل", fr: "Entrée" },
    { code: "GREEN", ar: "مساحة خضراء", fr: "Espace vert" },
    { code: "OTHER", ar: "فضاء آخر", fr: "Autre espace" },
  ],
  MAINTENANCE_TYPE_LABEL: [
    { code: "PREVENTIVE", ar: "وقائية", fr: "Préventive" },
    { code: "CORRECTIVE", ar: "إصلاحية", fr: "Corrective" },
    { code: "EMERGENCY", ar: "استعجالية", fr: "Urgente" },
  ],
  CONDITION: [
    { code: "GOOD", ar: "جيدة", fr: "Bon" },
    { code: "FAIR", ar: "متوسطة", fr: "Moyen" },
    { code: "POOR", ar: "سيئة", fr: "Mauvais" },
  ],
  DOCUMENT_CATEGORY: [
    { code: "INVOICE", ar: "فاتورة", fr: "Facture" },
    { code: "ORDER", ar: "سند طلب", fr: "Bon de commande" },
    { code: "REPORT", ar: "محضر", fr: "Procès-verbal" },
    { code: "CONTRACT", ar: "عقد", fr: "Contrat" },
    { code: "OTHER", ar: "أخرى", fr: "Autre" },
  ],
};

export const DEFAULT_HIERARCHY = {
  academy: {
    nameAr: "الأكاديمية الجهوية للتربية والتكوين لجهة سوس ماسة",
    nameFr: "Académie Régionale d'Éducation et de Formation Souss-Massa",
  },
  directorate: {
    nameAr: "المديرية الإقليمية أكادير إداوتنان",
    nameFr: "Direction Provinciale Agadir Ida-Outanane",
  },
  school: {
    nameAr: "مؤسسة حسان بن ثابت الابتدائية بأورير",
    nameFr: "École primaire Hassan Ibn Thabit – Aourir",
    cycle: "ابتدائي",
  },
} as const;
export * from "./branding";
export * from "./text";
export * from "./schoolYear";
export * from "./numbering";

/** القوائم المرجعية التي تديرها المؤسسة من الواجهة (المرحلة 4). */
export const LOOKUP_KEYS = ["ASSET_TYPE", "FUNDING_SOURCE", "UNIT_OF_MEASURE", "SUPPLIER_ACTIVITY", "CONDITION", "DOCUMENT_CATEGORY", "SPACE_TYPE", "MAINTENANCE_TYPE_LABEL"] as const;
export type LookupKey = (typeof LOOKUP_KEYS)[number];
