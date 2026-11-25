import { useState } from "react";
import { useNavigate } from "react-router";
import { Alert, Button, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setupAdminSchema, type SetupAdminInput } from "@hassan/validation";
import { AuthLayout } from "../components/AuthLayout";
import { useI18n } from "../i18n";
import { api, ApiError } from "../api";
import { errorKey } from "../lib/errors";

/** الإعداد الأول: إنشاء حساب المدير. لا توجد كلمة مرور افتراضية في الشيفرة. */
export function SetupPage() {
  const { t } = useI18n();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { register, handleSubmit, formState } = useForm<SetupAdminInput>({ resolver: zodResolver(setupAdminSchema) });
  const err = (k: keyof SetupAdminInput) => (formState.errors[k]?.message ? t(formState.errors[k]!.message!) : undefined);

  const tokenQ = useQuery({ queryKey: ["setupToken"], queryFn: () => api.setupTokenRequired?.() ?? false });
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.setup({ ...v, ...(tokenQ.data ? { setupToken: token } : {}) });
      await api.login(v.username, v.password);
      await qc.invalidateQueries();
      nav("/settings/school", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === "FORBIDDEN") setError(t("setup.badToken"));
      else if (e instanceof ApiError && e.code === "ALREADY_SET_UP") {
        await qc.invalidateQueries();
        nav("/login", { replace: true });
      } else setError(t(errorKey(e)));
    }
  });

  return (
    <AuthLayout>
      <form onSubmit={submit} noValidate>
        <Stack>
          <Title order={2}>{t("setup.title")}</Title>
          <Text c="dimmed" size="sm">{t("setup.subtitle")}</Text>
          <Alert variant="light" color="blue">{t("setup.hierarchyNote")}</Alert>
          {error && <Alert color="red">{error}</Alert>}
          {tokenQ.data && (
            <TextInput label={t("setup.token")} description={t("setup.tokenHint")} dir="ltr" value={token} onChange={(e) => setToken(e.currentTarget.value)} />
          )}
          <TextInput label={t("setup.fullName")} {...register("fullNameAr")} error={err("fullNameAr")} />
          <TextInput label={t("login.username")} dir="ltr" autoComplete="username" {...register("username")} error={err("username")} />
          <PasswordInput label={t("login.password")} description={t("setup.passwordHint")} autoComplete="new-password" {...register("password")} error={err("password")} />
          <PasswordInput label={t("profile.confirmPassword")} autoComplete="new-password" {...register("confirmPassword")} error={err("confirmPassword")} />
          <Button type="submit" size="md" loading={formState.isSubmitting} data-testid="setup-submit">
            {t("setup.submit")}
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
