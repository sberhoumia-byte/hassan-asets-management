import { Button, Divider, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@hassan/validation";
import { useI18n } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { api, ApiError } from "../api";

const schema = z
  .object({ current: z.string().min(1, "errors.required"), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { message: "errors.passwordMismatch", path: ["confirm"] });
type Form = z.infer<typeof schema>;

export function ProfileModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { user, roleLabel } = useAuth();
  const { register, handleSubmit, formState, reset, setError } = useForm<Form>({ resolver: zodResolver(schema) });
  const err = (k: keyof Form) => (formState.errors[k]?.message ? t(formState.errors[k]!.message!) : undefined);

  const submit = handleSubmit(async (v) => {
    try {
      await api.changePassword(v.current, v.next);
      notifications.show({ color: "green", message: t("profile.passwordChanged") });
      reset();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVALID_CREDENTIALS") setError("current", { message: "errors.wrongPassword" });
      else throw e;
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={t("header.profile")} centered>
      <Stack gap={4}>
        <Text fw={700}>{user?.fullNameAr}</Text>
        <Text size="sm" c="dimmed">{t("profile.username")}: {user?.username}</Text>
        {roleLabel && <Text size="sm" c="dimmed">{t("profile.role")}: {t(`roles.${roleLabel}`)}</Text>}
      </Stack>
      <Divider my="md" label={t("profile.changePassword")} />
      <form onSubmit={submit}>
        <Stack>
          <PasswordInput label={t("profile.currentPassword")} {...register("current")} error={err("current")} />
          <PasswordInput label={t("profile.newPassword")} description={t("setup.passwordHint")} {...register("next")} error={err("next")} />
          <PasswordInput label={t("profile.confirmPassword")} {...register("confirm")} error={err("confirm")} />
          <Button type="submit" loading={formState.isSubmitting}>{t("common.save")}</Button>
        </Stack>
      </form>
    </Modal>
  );
}
