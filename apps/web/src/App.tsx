import { lazy, useEffect, type ComponentType, type ReactNode } from "react";
import { DirectionProvider, MantineProvider, Center, Loader, useDirection } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { ModalsProvider } from "@mantine/modals";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { theme } from "./theme";
import { I18nProvider, useI18n } from "./i18n";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ForcePasswordPage } from "./pages/ForcePasswordPage";
import { OutboxProvider } from "./offline/OutboxProvider";

/** الصفحات غير الأساسية تُحمّل عند فتحها (تقسيم الحزمة)؛ اللوحة وتسجيل الدخول تبقى في الحزمة الأولى. */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}
const SettingsLayout = lazyPage(() => import("./pages/settings/SettingsLayout"), "SettingsLayout");
const SchoolInfoPage = lazyPage(() => import("./pages/settings/SchoolInfoPage"), "SchoolInfoPage");
const HierarchyPage = lazyPage(() => import("./pages/settings/HierarchyPage"), "HierarchyPage");
const BrandingPage = lazyPage(() => import("./pages/settings/BrandingPage"), "BrandingPage");
const PrintPreviewPage = lazyPage(() => import("./pages/settings/PrintPreviewPage"), "PrintPreviewPage");
const UsersPage = lazyPage(() => import("./pages/UsersPage"), "UsersPage");
const AssetsPage = lazyPage(() => import("./pages/assets/AssetsPage"), "AssetsPage");
const StockPage = lazyPage(() => import("./pages/stock/StockPage"), "StockPage");
const SuppliersPage = lazyPage(() => import("./pages/SuppliersPage"), "SuppliersPage");
const ScanPage = lazyPage(() => import("./pages/ScanPage"), "ScanPage");
const CatalogPage = lazyPage(() => import("./pages/settings/CatalogPage"), "CatalogPage");
const StaffPage = lazyPage(() => import("./pages/settings/StaffPage"), "StaffPage");
const SpacesPage = lazyPage(() => import("./pages/spaces/SpacesPage"), "SpacesPage");
const FacilitiesPage = lazyPage(() => import("./pages/spaces/FacilitiesPage"), "FacilitiesPage");
const ResourcesPage = lazyPage(() => import("./pages/resources/ResourcesPage"), "ResourcesPage");
const LoansPage = lazyPage(() => import("./pages/loans/LoansPage"), "LoansPage");
const LoanReceiptPage = lazyPage(() => import("./pages/loans/LoanReceiptPage"), "LoanReceiptPage");
const MaintenancePage = lazyPage(() => import("./pages/maintenance/MaintenancePage"), "MaintenancePage");
const CustodyPage = lazyPage(() => import("./pages/custody/CustodyPage"), "CustodyPage");
const CustodyReportPage = lazyPage(() => import("./pages/custody/CustodyReportPage"), "CustodyReportPage");
const InventoryPage = lazyPage(() => import("./pages/inventory/InventoryPage"), "InventoryPage");
const InventorySessionPage = lazyPage(() => import("./pages/inventory/InventorySessionPage"), "InventorySessionPage");
const InventoryReportPage = lazyPage(() => import("./pages/inventory/InventoryReportPage"), "InventoryReportPage");
const PurchasingPage = lazyPage(() => import("./pages/purchasing/PurchasingPage"), "PurchasingPage");
const PurchaseOrderPage = lazyPage(() => import("./pages/purchasing/PurchaseOrderPage"), "PurchaseOrderPage");
const ReportsPage = lazyPage(() => import("./pages/reports/ReportsPage"), "ReportsPage");
const ImportPage = lazyPage(() => import("./pages/imports/ImportPage"), "ImportPage");
const DocumentsPage = lazyPage(() => import("./pages/documents/DocumentsPage"), "DocumentsPage");
const FloorPlanPage = lazyPage(() => import("./pages/floorplan/FloorPlanPage"), "FloorPlanPage");
const NotificationSettingsPage = lazyPage(() => import("./pages/settings/NotificationSettingsPage"), "NotificationSettingsPage");
const BackupPage = lazyPage(() => import("./pages/settings/BackupPage"), "BackupPage");
const AuditLogPage = lazyPage(() => import("./pages/settings/AuditLogPage"), "AuditLogPage");
const ApprovalWorkflowsPage = lazyPage(() => import("./pages/settings/ApprovalWorkflowsPage"), "ApprovalWorkflowsPage");

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

function DirectionSync() {
  const { dir } = useI18n();
  const { setDirection } = useDirection();
  useEffect(() => setDirection(dir), [dir, setDirection]);
  return null;
}

function FullLoader() {
  return (
    <Center h="100vh">
      <Loader />
    </Center>
  );
}

/** يحرس المسارات: الإعداد الأول ← تسجيل الدخول ← التطبيق. */
function Gate({ children, area }: { children: ReactNode; area: "setup" | "login" | "app" }) {
  const { loading, needsSetup, user } = useAuth();
  const loc = useLocation();
  if (loading) return <FullLoader />;
  if (needsSetup) return area === "setup" ? <>{children}</> : <Navigate to="/setup" replace />;
  if (area === "setup") return <Navigate to={user ? "/" : "/login"} replace />;
  if (!user) return area === "login" ? <>{children}</> : <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (area === "login") return <Navigate to="/" replace />;
  if (user.mustChangePassword) return <ForcePasswordPage />;
  return <>{children}</>;
}

export function App() {
  return (
    <I18nProvider>
      <DirectionProvider initialDirection="rtl" detectDirection={false}>
        <MantineProvider theme={theme} defaultColorScheme="light">
          <DirectionSync />
          <QueryClientProvider client={queryClient}>
            <ModalsProvider>
              <Notifications position="top-center" />
              <HashRouter>
                <AuthProvider>
                  <OutboxProvider>
                  <Routes>
                    <Route path="/setup" element={<Gate area="setup"><SetupPage /></Gate>} />
                    <Route path="/login" element={<Gate area="login"><LoginPage /></Gate>} />
                    <Route element={<Gate area="app"><AppLayout /></Gate>}>
                      <Route index element={<DashboardPage />} />
                      <Route path="users" element={<UsersPage />} />
                      <Route path="assets" element={<AssetsPage />} />
                      <Route path="assets/:id" element={<AssetsPage />} />
                      <Route path="stock" element={<StockPage />} />
                      <Route path="suppliers" element={<SuppliersPage />} />
                      <Route path="spaces" element={<SpacesPage />} />
                      <Route path="facilities" element={<FacilitiesPage />} />
                      <Route path="resources" element={<ResourcesPage />} />
                      <Route path="resources/:id" element={<ResourcesPage />} />
                      <Route path="loans" element={<LoansPage />} />
                      <Route path="loans/:id/receipt" element={<LoanReceiptPage />} />
                      <Route path="maintenance" element={<MaintenancePage />} />
                      <Route path="custody" element={<CustodyPage />} />
                      <Route path="custody/:id/report" element={<CustodyReportPage />} />
                      <Route path="inventory" element={<InventoryPage />} />
                      <Route path="inventory/:id" element={<InventorySessionPage />} />
                      <Route path="inventory/:id/report" element={<InventoryReportPage />} />
                      <Route path="purchasing" element={<PurchasingPage />} />
                      <Route path="purchasing/:id" element={<PurchaseOrderPage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="imports" element={<ImportPage />} />
                      <Route path="documents" element={<DocumentsPage />} />
                      <Route path="floorplan" element={<FloorPlanPage />} />
                      <Route path="scan/:token" element={<ScanPage />} />
                      <Route path="settings" element={<SettingsLayout />}>
                        <Route index element={<Navigate to="school" replace />} />
                        <Route path="school" element={<SchoolInfoPage />} />
                        <Route path="hierarchy" element={<HierarchyPage />} />
                        <Route path="branding" element={<BrandingPage />} />
                        <Route path="print-preview" element={<PrintPreviewPage />} />
                        <Route path="catalog" element={<CatalogPage />} />
                        <Route path="staff" element={<StaffPage />} />
                        <Route path="workflows" element={<ApprovalWorkflowsPage />} />
                        <Route path="notifications" element={<NotificationSettingsPage />} />
                        <Route path="audit" element={<AuditLogPage />} />
                        <Route path="backup" element={<BackupPage />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                  </OutboxProvider>
                </AuthProvider>
              </HashRouter>
            </ModalsProvider>
          </QueryClientProvider>
        </MantineProvider>
      </DirectionProvider>
    </I18nProvider>
  );
}
