import { Alert, Button, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { passwordSchema } from "@hassan/validation";
import { AuthLayout } from "../components/AuthLayout";
import { useI18n } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../api";

const schema = z
  .object({ current: z.string().min(1, "errors.required"), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "errors.passwordMismatch", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "errors.samePassword", path: ["next"] });
type Form = z.infer<typeof schema>;

/** حساب أنشأه المدير بكلمة مرور مؤقتة: لا يدخل التطبيق قبل اختيار كلمة مرور خاصة به. */
export function ForcePasswordPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const { register, handleSubmit, formState, setError } = useForm<Form>({ resolver: zodResolver(schema) });
  const err = (k: keyof Form) => (formState.errors[k]?.message ? t(formState.errors[k]!.message!) : undefined);

  const submit = handleSubmit(async (v) => {
    try {
      await api.changePassword(v.current, v.next);
      await qc.invalidateQueries();
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVALID_CREDENTIALS") setError("current", { message: "errors.wrongPassword" });
      else if (e instanceof ApiError && e.code === "SAME_PASSWORD") setError("next", { message: "errors.samePassword" });
      else setError("root", { message: "errors.unexpected" });
    }
  });

  return (
    <AuthLayout>
      <form onSubmit={submit} noValidate>
        <Stack>
          <Title order={2}>{t("forcePw.title")}</Title>
          <Text c="dimmed" size="sm">{t("forcePw.body", { name: user?.fullNameAr ?? "" })}</Text>
          {formState.errors.root?.message && <Alert color="red">{t(formState.errors.root.message)}</Alert>}
          <PasswordInput label={t("forcePw.temporary")} autoComplete="current-password" {...register("current")} error={err("current")} />
          <PasswordInput label={t("profile.newPassword")} description={t("setup.passwordHint")} autoComplete="new-password" {...register("next")} error={err("next")} />
          <PasswordInput label={t("profile.confirmPassword")} autoComplete="new-password" {...register("confirm")} error={err("confirm")} />
          <Button type="submit" size="md" loading={formState.isSubmitting} data-testid="force-pw-submit">{t("forcePw.submit")}</Button>
          <Button variant="subtle" color="gray" onClick={() => void logout()}>{t("header.logout")}</Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
