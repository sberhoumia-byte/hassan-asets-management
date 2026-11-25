import { Button, Card, Group, Skeleton, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconBallFootball,
  IconBook2,
  IconBuildingCommunity,
  IconChartPie,
  IconClockExclamation,
  IconDeviceDesktop,
  IconHistory,
  IconPackages,
  IconTool,
  type Icon,
} from "@tabler/icons-react";
import { api, type DashboardStats } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";

const CARDS: { key: keyof DashboardStats; icon: Icon; color: string }[] = [
  { key: "assets", icon: IconDeviceDesktop, color: "brand" },
  { key: "stockItems", icon: IconPackages, color: "teal" },
  { key: "buildingsRooms", icon: IconBuildingCommunity, color: "indigo" },
  { key: "facilities", icon: IconBallFootball, color: "violet" },
  { key: "resources", icon: IconBook2, color: "cyan" },
  { key: "activeLoans", icon: IconArrowsExchange, color: "blue" },
  { key: "overdueLoans", icon: IconClockExclamation, color: "red" },
  { key: "openMaintenance", icon: IconTool, color: "orange" },
];

const QUICK: { key: string; phase: number }[] = [
  { key: "addAsset", phase: 4 },
  { key: "addStock", phase: 4 },
  { key: "newLoan", phase: 5 },
  { key: "newReturn", phase: 5 },
  { key: "newInventory", phase: 6 },
  { key: "newMaintenance", phase: 6 },
  { key: "newReport", phase: 7 },
  { key: "importExcel", phase: 7 },
];

const CHARTS: { key: string; phase: number }[] = [
  { key: "assetsByCategory", phase: 4 },
  { key: "stockStatus", phase: 4 },
  { key: "resourcesDistribution", phase: 5 },
  { key: "loansStatus", phase: 5 },
  { key: "acquisitions", phase: 6 },
  { key: "maintenance", phase: 6 },
  { key: "inventoryResults", phase: 6 },
];

export function DashboardPage() {
  const { t, fmtDateTime } = useI18n();
  const { activeSchool } = useAuth();
  const sid = activeSchool?.id;
  const stats = useQuery({ queryKey: ["dash", "stats", sid], queryFn: () => api.dashboardStats(sid!), enabled: !!sid });
  const alerts = useQuery({ queryKey: ["dash", "alerts", sid], queryFn: () => api.dashboardAlerts(sid!), enabled: !!sid });
  const activity = useQuery({ queryKey: ["dash", "activity", sid], queryFn: () => api.recentActivity(sid!, 8), enabled: !!sid });

  return (
    <>
      <Title order={2}>{t("nav.dashboard")}</Title>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4" data-testid="stat-cards">
        {CARDS.map(({ key, icon: I, color }) => (
          <Card key={key} padding="md">
            <Group wrap="nowrap" gap="sm">
              <ThemeIcon size={44} radius="md" variant="light" color={color}>
                <I size={22} />
              </ThemeIcon>
              <div className="min-w-0">
                {stats.isLoading ? (
                  <Skeleton h={26} w={40} />
                ) : (
                  <div className="font-cairo text-2xl font-extrabold" data-testid={`stat-${key}`}>
                    {stats.data?.[key] ?? "—"}
                  </div>
                )}
                <Text size="sm" c="dimmed" className="font-tajawal truncate">{t(`dash.stats.${key}`)}</Text>
              </div>
            </Group>
          </Card>
        ))}
      </div>

      <Card>
        <Title order={4} mb="sm">{t("dash.quick.title")}</Title>
        <Group gap="xs">
          {QUICK.map((q) => (
            <Tooltip key={q.key} label={t("nav.comingInPhase", { phase: q.phase })}>
              <span>
                <Button variant="light" disabled data-testid={`quick-${q.key}`}>
                  {t(`dash.quick.${q.key}`)}
                </Button>
              </span>
            </Tooltip>
          ))}
        </Group>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 grid gap-4 md:grid-cols-2">
          {CHARTS.map((c) => (
            <Card key={c.key}>
              <Title order={5} mb="sm">{t(`dash.charts.${c.key}`)}</Title>
              <div className="h-40 rounded-lg border border-dashed border-[var(--line)] bg-[#fafbfd] grid place-items-center text-center p-3">
                <div>
                  <IconChartPie size={28} color="#9aa7ba" />
                  <Text size="sm" c="dimmed">{t("dash.charts.empty")}</Text>
                  <Text size="xs" c="dimmed">{t("nav.comingInPhase", { phase: c.phase })}</Text>
                </div>
              </div>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 content-start">
          <Card>
            <Group gap="xs" mb="sm">
              <IconAlertTriangle size={18} color="#c98a12" />
              <Title order={4}>{t("dash.alerts.title")}</Title>
            </Group>
            {(alerts.data ?? []).length === 0 ? (
              <Text size="sm" c="dimmed" data-testid="alerts-empty">{t("dash.alerts.empty")}</Text>
            ) : (
              alerts.data!.map((a) => (
                <Text key={a.kind} size="sm">{t(`dash.alerts.${a.kind}`)}: {a.count}</Text>
              ))
            )}
          </Card>
          <Card>
            <Group gap="xs" mb="sm">
              <IconHistory size={18} color="#1d5fa8" />
              <Title order={4}>{t("dash.activity.title")}</Title>
            </Group>
            {(activity.data ?? []).length === 0 ? (
              <Text size="sm" c="dimmed">{t("dash.activity.empty")}</Text>
            ) : (
              <ul className="list-none p-0 m-0 flex flex-col gap-2" data-testid="activity-list">
                {activity.data!.map((a) => (
                  <li key={a.id} className="border-b border-[var(--line)] last:border-0 pb-2">
                    <Text size="sm">
                      {t(a.action)}
                      {a.entity ? ` — ${a.entity}` : ""}
                    </Text>
                    <Text size="xs" c="dimmed">{a.by} · {fmtDateTime(a.at)}</Text>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
