import { Button, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";
import { useI18n } from "../i18n";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <Stack align="center" py="xl">
      <Title order={2}>{t("notFound.title")}</Title>
      <Text c="dimmed">{t("notFound.body")}</Text>
      <Button component={Link} to="/">{t("nav.dashboard")}</Button>
    </Stack>
  );
}
