import { Badge, Card, SimpleGrid, Table, Text, Title } from "@mantine/core";
import type { StockAlerts } from "../../api";
import { useI18n } from "../../i18n";
import { fmtQty } from "../../lib/forms";

/** تنبيهات المخزون: نافد، تحت الحد الأدنى، وقرب انتهاء الصلاحية (30 يوماً). */
export function AlertsTab({ data }: { data?: StockAlerts }) {
  const { t, fmtDate } = useI18n();
  if (!data) return null;
  const none = !data.out.length && !data.low.length && !data.expiring.length;
  if (none) return <Card><Text c="dimmed" ta="center" py="lg" data-testid="no-alerts">{t("stock.noAlerts")}</Text></Card>;
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }}>
      {[
        { key: "out", rows: data.out, color: "red" },
        { key: "low", rows: data.low, color: "orange" },
      ].map((g) =>
        g.rows.length ? (
          <Card key={g.key} data-testid={`alerts-${g.key}`}>
            <Title order={5} mb="sm">
              <Badge color={g.color} me={8}>{g.rows.length}</Badge>
              {t(`stock.alert.${g.key}`)}
            </Title>
            <Table verticalSpacing={4}>
              <Table.Tbody>
                {g.rows.map((r) => (
                  <Table.Tr key={r.id}>
                    <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-xs">{r.code}</Table.Td>
                    <Table.Td>{r.name}</Table.Td>
                    <Table.Td>{t("stock.totalOfMin", { total: fmtQty(r.total), min: fmtQty(r.minQuantity) })}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        ) : null,
      )}
      {data.expiring.length > 0 && (
        <Card data-testid="alerts-expiring">
          <Title order={5} mb="sm">
            <Badge color="grape" me={8}>{data.expiring.length}</Badge>
            {t("stock.alert.expiring")}
          </Title>
          <Table verticalSpacing={4}>
            <Table.Tbody>
              {data.expiring.map((r) => (
                <Table.Tr key={r.movement}>
                  <Table.Td>{r.name}</Table.Td>
                  <Table.Td>{r.warehouse}</Table.Td>
                  <Table.Td>{fmtQty(r.quantity)}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={r.expired ? "red" : "grape"}>
                      {t(r.expired ? "stock.expiredOn" : "stock.expiresOn", { date: fmtDate(r.expiryDate) })}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </SimpleGrid>
  );
}
