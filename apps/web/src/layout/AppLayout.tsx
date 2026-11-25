import { Suspense, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { Alert, Center, Drawer, Loader } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconInfoCircle } from "@tabler/icons-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useI18n } from "../i18n";
import { api } from "../api";

const COLLAPSE_KEY = "hassan.sidebarCollapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppLayout() {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  const mobile = useMediaQuery("(max-width: 62em)");
  const loc = useLocation();

  useEffect(() => setDrawer(false), [loc.pathname]);

  const toggle = () => {
    if (mobile) return setDrawer((v) => !v);
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* غير متاح */
      }
      return !v;
    });
  };

  return (
    <div className="app-grid" data-collapsed={collapsed && !mobile}>
      <Sidebar />
      <Drawer
        opened={drawer}
        onClose={() => setDrawer(false)}
        // Mantine يقلب left/right في RTL: «left» = بداية السطر (اليمين في العربية)
        position="left"
        size={280}
        withCloseButton={false}
        padding={0}
        className="mobile-drawer no-print"
      >
        <Sidebar />
      </Drawer>
      <div className="min-w-0 flex flex-col">
        <Header onToggleMenu={toggle} />
        <main className="print-root flex-1 p-4 md:p-6 flex flex-col gap-5">
          {api.mode === "review" && (
            <Alert className="no-print" variant="light" color="yellow" icon={<IconInfoCircle />} p="xs">
              {t("review.banner")}
            </Alert>
          )}
          <Suspense fallback={<Center py="xl"><Loader /></Center>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
