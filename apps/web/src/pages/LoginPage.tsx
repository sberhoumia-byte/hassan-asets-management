import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Alert, Button, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { loginSchema, type LoginInput } from "@hassan/validation";
import { AuthLayout } from "../components/AuthLayout";
import { useI18n } from "../i18n";
import { api, ApiError } from "../api";

export function LoginPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const err = (k: keyof LoginInput) => (formState.errors[k]?.message ? t(formState.errors[k]!.message!) : undefined);

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.login(v.username, v.password);
      await qc.invalidateQueries();
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from !== "/login" ? from : "/", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "ACCOUNT_LOCKED") setError(t("login.locked", { minutes: Number(e.details?.minutes ?? 5) }));
      else if (e instanceof ApiError && e.code === "INVALID_CREDENTIALS") setError(t("login.invalid"));
      else setError(t("errors.unexpected"));
    }
  });

  return (
    <AuthLayout>
      <form onSubmit={submit} noValidate>
        <Stack>
          <Title order={2}>{t("login.title")}</Title>
          <Text c="dimmed" size="sm">{t("login.subtitle")}</Text>
          {error && <Alert color="red" data-testid="login-error">{error}</Alert>}
          <TextInput label={t("login.username")} autoComplete="username" {...register("username")} error={err("username")} data-autofocus />
          <PasswordInput label={t("login.password")} autoComplete="current-password" {...register("password")} error={err("password")} />
          <Button type="submit" size="md" loading={formState.isSubmitting} data-testid="login-submit">
            {t("login.submit")}
          </Button>
          <Text size="xs" c="dimmed">{t("login.lockNote")}</Text>
        </Stack>
      </form>
    </AuthLayout>
  );
}
