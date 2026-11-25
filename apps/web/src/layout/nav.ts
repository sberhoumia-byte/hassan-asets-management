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
}

/** ترتيب القائمة الرئيسية كما في المادة 5 من المواصفات. */
export const NAV: NavItem[] = [
  { key: "dashboard", icon: IconLayoutDashboard, to: "/" },
  { key: "assets", icon: IconDeviceDesktop, phase: 4 },
  { key: "stock", icon: IconPackages, phase: 4 },
  { key: "spaces", icon: IconBuildingCommunity, phase: 5 },
  { key: "facilities", icon: IconBallFootball, phase: 5 },
  { key: "resources", icon: IconBook2, phase: 5 },
  { key: "loans", icon: IconArrowsExchange, phase: 5 },
  { key: "inventory", icon: IconClipboardCheck, phase: 6 },
  { key: "maintenance", icon: IconTool, phase: 6 },
  { key: "purchasing", icon: IconTruckDelivery, phase: 6 },
  { key: "custody", icon: IconUserShare, phase: 6 },
  { key: "suppliers", icon: IconAddressBook, phase: 4 },
  { key: "floorplan", icon: IconMap2, phase: 8 },
  { key: "excel", icon: IconFileSpreadsheet, phase: 7 },
  { key: "documents", icon: IconArchive, phase: 7 },
  { key: "reports", icon: IconChartBar, phase: 7 },
  { key: "users", icon: IconUsers, phase: 3 },
  { key: "settings", icon: IconSettings, to: "/settings" },
];

/** صفحات قسم الإعدادات المنجزة في المرحلة 2. */
export const SETTINGS_PAGES = [
  { key: "schoolInfo", to: "/settings/school" },
  { key: "hierarchy", to: "/settings/hierarchy" },
  { key: "branding", to: "/settings/branding" },
  { key: "printPreview", to: "/settings/print-preview" },
] as const;
