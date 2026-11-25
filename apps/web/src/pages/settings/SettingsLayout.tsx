import { Outlet, useLocation, useNavigate } from "react-router";
import { Tabs, Title } from "@mantine/core";
import { SETTINGS_PAGES } from "../../layout/nav";
import { useI18n } from "../../i18n";

export function SettingsLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const current = SETTINGS_PAGES.find((p) => pathname.startsWith(p.to))?.to ?? SETTINGS_PAGES[0].to;
  return (
    <>
      <Title order={2} className="no-print">{t("nav.settings")}</Title>
      <Tabs value={current} onChange={(v) => v && nav(v)} className="no-print" keepMounted={false}>
        <Tabs.List>
          {SETTINGS_PAGES.map((p) => (
            <Tabs.Tab key={p.key} value={p.to} data-testid={`tab-${p.key}`}>
              {t(`settings.${p.key}`)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <Outlet />
    </>
  );
}
