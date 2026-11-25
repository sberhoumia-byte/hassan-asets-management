import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ActionIcon, Avatar, Badge, Group, Menu, Select, Text, Tooltip } from "@mantine/core";
import { IconLanguage, IconLogout, IconMenu2, IconUserCircle } from "@tabler/icons-react";
import { useI18n } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { SchoolLogo } from "../components/SchoolLogo";
import { ProfileModal } from "./ProfileModal";
import { NotificationBell } from "./NotificationBell";
import { OfflineIndicator } from "./OfflineIndicator";

function Clock() {
  const { fmtDateTime } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text size="sm" c="dimmed" className="hidden lg:block" data-testid="clock">
      {fmtDateTime(now)}
    </Text>
  );
}

export function Header({ onToggleMenu }: { onToggleMenu: () => void }) {
  const { t, pick, locale, setLocale } = useI18n();
  const { user, roleLabel, schools, activeSchool, setActiveSchoolId, logout } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState(false);

  const doLogout = async () => {
    await logout();
    nav("/login", { replace: true });
  };

  return (
    <header className="no-print sticky top-0 z-10 bg-white border-b border-[var(--line)] flex items-center gap-3 px-3 md:px-5 py-2.5">
      <Tooltip label={t("header.toggleMenu")}>
        <ActionIcon variant="default" size="lg" onClick={onToggleMenu} aria-label={t("header.toggleMenu")} data-testid="toggle-menu">
          <IconMenu2 size={20} />
        </ActionIcon>
      </Tooltip>
      <SchoolLogo size={38} />
      <div className="min-w-0 leading-tight">
        <div className="font-cairo font-bold text-[15px] truncate" data-testid="header-school">
          {activeSchool ? pick(activeSchool) : "—"}
        </div>
        <div className="text-xs text-[var(--muted)] truncate">HASSAN IBN THABIT – ASSETS MANAGEMENT</div>
      </div>
      {schools.length > 1 && (
        <Select
          size="xs"
          w={220}
          className="hidden md:block"
          aria-label={t("header.activeSchool")}
          data={schools.map((s) => ({ value: s.id, label: pick(s) }))}
          value={activeSchool?.id ?? null}
          onChange={(v) => v && setActiveSchoolId(v)}
          allowDeselect={false}
        />
      )}
      <div className="flex-1" />
      <Clock />
      <OfflineIndicator />
      <NotificationBell />
      <Menu position="bottom-end" width={230} shadow="md">
        <Menu.Target>
          <button className="flex items-center gap-2 bg-transparent border-0 cursor-pointer p-1 rounded-lg hover:bg-[#f4f6fa]" data-testid="user-menu">
            <Avatar color="brand" radius="xl" size={34}>{user?.fullNameAr.slice(0, 1)}</Avatar>
            <div className="hidden sm:block text-start leading-tight">
              <div className="text-sm">{user?.fullNameAr}</div>
              {roleLabel && <Badge size="xs" variant="light">{t(`roles.${roleLabel}`)}</Badge>}
            </div>
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconUserCircle size={16} />} onClick={() => setProfile(true)}>
            {t("header.profile")}
          </Menu.Item>
          <Menu.Item
            leftSection={<IconLanguage size={16} />}
            onClick={() => setLocale(locale === "ar" ? "fr" : "ar")}
            data-testid="switch-language"
          >
            {locale === "ar" ? "Français" : "العربية"}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={doLogout} data-testid="logout">
            {t("header.logout")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Group gap={0} className="hidden" />
      <ProfileModal opened={profile} onClose={() => setProfile(false)} />
    </header>
  );
}
