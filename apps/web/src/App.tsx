import { useEffect, type ReactNode } from "react";
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
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { SchoolInfoPage } from "./pages/settings/SchoolInfoPage";
import { HierarchyPage } from "./pages/settings/HierarchyPage";
import { BrandingPage } from "./pages/settings/BrandingPage";
import { PrintPreviewPage } from "./pages/settings/PrintPreviewPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { UsersPage } from "./pages/UsersPage";
import { ForcePasswordPage } from "./pages/ForcePasswordPage";
import { AssetsPage } from "./pages/assets/AssetsPage";
import { StockPage } from "./pages/stock/StockPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { ScanPage } from "./pages/ScanPage";
import { CatalogPage } from "./pages/settings/CatalogPage";
import { StaffPage } from "./pages/settings/StaffPage";
import { SpacesPage } from "./pages/spaces/SpacesPage";
import { FacilitiesPage } from "./pages/spaces/FacilitiesPage";
import { ResourcesPage } from "./pages/resources/ResourcesPage";
import { LoansPage } from "./pages/loans/LoansPage";
import { LoanReceiptPage } from "./pages/loans/LoanReceiptPage";

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
                      <Route path="scan/:token" element={<ScanPage />} />
                      <Route path="settings" element={<SettingsLayout />}>
                        <Route index element={<Navigate to="school" replace />} />
                        <Route path="school" element={<SchoolInfoPage />} />
                        <Route path="hierarchy" element={<HierarchyPage />} />
                        <Route path="branding" element={<BrandingPage />} />
                        <Route path="print-preview" element={<PrintPreviewPage />} />
                        <Route path="catalog" element={<CatalogPage />} />
                        <Route path="staff" element={<StaffPage />} />
                      </Route>
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </AuthProvider>
              </HashRouter>
            </ModalsProvider>
          </QueryClientProvider>
        </MantineProvider>
      </DirectionProvider>
    </I18nProvider>
  );
}
