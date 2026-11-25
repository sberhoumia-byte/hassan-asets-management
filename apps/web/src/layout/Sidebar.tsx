import { NavLink, useLocation } from "react-router";
import { Tooltip } from "@mantine/core";
import { NAV } from "./nav";
import { useI18n } from "../i18n";
import { SchoolLogo } from "../components/SchoolLogo";

export function Sidebar() {
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <nav className="sidebar no-print" aria-label={t("nav.aria")}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-4 mb-2 border-b border-white/10">
        <SchoolLogo size={38} dark />
        <div className="side-head-text leading-tight">
          <div className="font-cairo text-white font-bold text-[15px]">{t("app.shortName")}</div>
          <div className="text-xs text-[#a9c1e0]">HASSAN IBN THABIT</div>
        </div>
      </div>
      {NAV.map((item, i) => {
        const Icon = item.icon;
        const label = `${i + 1}. ${t(`nav.${item.key}`)}`;
        if (!item.to) {
          return (
            <Tooltip key={item.key} label={t("nav.comingInPhase", { phase: item.phase ?? "" })} position="left" withArrow>
              <div className="side-link" aria-disabled="true" role="link" data-testid={`nav-${item.key}`}>
                <Icon size={20} stroke={1.6} />
                <span className="lbl">{t(`nav.${item.key}`)}</span>
                <span className="phase text-[10px] rounded px-1.5 bg-white/10">{t("nav.phaseShort", { phase: item.phase ?? "" })}</span>
              </div>
            </Tooltip>
          );
        }
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        return (
          <Tooltip key={item.key} label={label} position="left" withArrow disabled>
            <NavLink to={item.to} className="side-link" data-active={active} data-testid={`nav-${item.key}`} title={t(`nav.${item.key}`)}>
              <Icon size={20} stroke={1.6} />
              <span className="lbl">{t(`nav.${item.key}`)}</span>
            </NavLink>
          </Tooltip>
        );
      })}
      <div className="h-6" />
    </nav>
  );
}
