import {
  IconLayoutDashboard,
  IconDeviceDesktop,
  IconPackages,
  IconBuildingCommunity,
  IconBallFootball,
  IconBook2,
  IconArrowsExchange,
  IconClipboardCheck,
  IconTool,
  IconTruckDelivery,
  IconUserShare,
  IconAddressBook,
  IconMap2,
  IconFileSpreadsheet,
  IconArchive,
  IconChartBar,
  IconUsers,
  IconSettings,
  type Icon,
} from "@tabler/icons-react";

export interface NavItem {
  key: string; // مفتاح الترجمة nav.<key>
  icon: Icon;
  to?: string; // مسار الشاشة إن كانت منجزة
  phase?: number; // المرحلة التي تُبنى فيها الوحدة إن لم تكن منجزة
  perm?: string; // تُخفى إن لم يملك المستخدم هذه الصلاحية
  serverOnly?: boolean; // تتطلب الخادم (غير متاحة في نسخة المراجعة المحلية)
}

/** ترتيب القائمة الرئيسية كما في المادة 5 من المواصفات. */
export const NAV: NavItem[] = [
  { key: "dashboard", icon: IconLayoutDashboard, to: "/" },
  { key: "assets", icon: IconDeviceDesktop, to: "/assets", perm: "assets.view", serverOnly: true },
  { key: "stock", icon: IconPackages, to: "/stock", perm: "stock.view", serverOnly: true },
  { key: "spaces", icon: IconBuildingCommunity, to: "/spaces", perm: "spaces.view", serverOnly: true },
  { key: "facilities", icon: IconBallFootball, to: "/facilities", perm: "facilities.view", serverOnly: true },
  { key: "resources", icon: IconBook2, to: "/resources", perm: "resources.view", serverOnly: true },
  { key: "loans", icon: IconArrowsExchange, to: "/loans", perm: "loans.view", serverOnly: true },
  { key: "inventory", icon: IconClipboardCheck, to: "/inventory", perm: "inventory.view", serverOnly: true },
  { key: "maintenance", icon: IconTool, to: "/maintenance", perm: "maintenance.view", serverOnly: true },
  { key: "purchasing", icon: IconTruckDelivery, to: "/purchasing", perm: "purchasing.view", serverOnly: true },
  { key: "custody", icon: IconUserShare, to: "/custody", perm: "custody.view", serverOnly: true },
  { key: "suppliers", icon: IconAddressBook, to: "/suppliers", perm: "suppliers.view", serverOnly: true },
  { key: "floorplan", icon: IconMap2, phase: 8 },
  { key: "excel", icon: IconFileSpreadsheet, phase: 7 },
  { key: "documents", icon: IconArchive, phase: 7 },
  { key: "reports", icon: IconChartBar, phase: 7 },
  { key: "users", icon: IconUsers, to: "/users", perm: "users.manage", serverOnly: true },
  { key: "settings", icon: IconSettings, to: "/settings" },
];

/** صفحات قسم الإعدادات (المرجعيات في المرحلة 4، الموظفون في المرحلة 5، مسارات المصادقة في المرحلة 6). */
export const SETTINGS_PAGES = [
  { key: "schoolInfo", to: "/settings/school" },
  { key: "hierarchy", to: "/settings/hierarchy" },
  { key: "branding", to: "/settings/branding" },
  { key: "printPreview", to: "/settings/print-preview" },
  { key: "catalog", to: "/settings/catalog" },
  { key: "staff", to: "/settings/staff" },
  { key: "workflows", to: "/settings/workflows" },
] as const;
