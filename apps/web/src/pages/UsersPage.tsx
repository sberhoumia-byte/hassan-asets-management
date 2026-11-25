import { useMemo, useState } from "react";
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  Modal,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconCopy, IconEdit, IconKey, IconPlus, IconShieldLock } from "@tabler/icons-react";
import { userCreateSchema, userUpdateSchema, type UserCreateInput, type UserUpdateInput } from "@hassan/validation";
import { api, ApiError, type ManagedUser, type PermissionOverride, type RoleCode, type UsersApi } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";

/** شاشة المستخدمين والصلاحيات (المادة 30): داخل المؤسسة النشطة فقط. */
export function UsersPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  const usersApi = api.users;
  if (!usersApi) return <Alert color="yellow">{t("users.serverOnly")}</Alert>;
  if (!activeSchool || !can("users.manage")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <UsersScreen u={usersApi} schoolId={activeSchool.id} />;
}

function UsersScreen({ u, schoolId }: { u: UsersApi; schoolId: string }) {
  const { t, pick } = useI18n();
  const { user: me, activeSchool } = useAuth();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ["users", schoolId], queryFn: () => u.list(schoolId) });
  const [modal, setModal] = useState<null | { kind: "create" } | { kind: "edit" | "access"; user: ManagedUser }>(null);
  const [temp, setTemp] = useState<null | { username: string; password: string }>(null);

  const reload = () => qc.invalidateQueries({ queryKey: ["users", schoolId] });

  const resetPassword = (x: ManagedUser) =>
    modals.openConfirmModal({
      title: t("users.resetPassword"),
      children: <Text size="sm">{t("users.resetConfirm", { name: x.fullNameAr })}</Text>,
      labels: { confirm: t("common.confirm"), cancel: t("common.cancel") },
      onConfirm: async () => {
        try {
          const r = await u.resetPassword(schoolId, x.id);
          setTemp({ username: x.username, password: r.temporaryPassword });
          await reload();
        } catch (e) {
          showError(t, e);
        }
      },
    });

  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.users")}</Title>
            <Text size="sm" c="dimmed">{t("users.intro", { school: activeSchool ? pick(activeSchool) : "" })}</Text>
          </div>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModal({ kind: "create" })} data-testid="add-user">
            {t("users.add")}
          </Button>
        </Group>
      </Card>
      <Card>
        <Table.ScrollContainer minWidth={760}>
          <Table striped highlightOnHover verticalSpacing="sm" data-testid="users-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("users.fullName")}</Table.Th>
                <Table.Th>{t("profile.username")}</Table.Th>
                <Table.Th>{t("users.roles")}</Table.Th>
                <Table.Th>{t("users.status")}</Table.Th>
                <Table.Th>{t("users.lastLogin")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(users.data ?? []).map((x) => (
                <Table.Tr key={x.id}>
                  <Table.Td>{x.fullNameAr}</Table.Td>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }}>{x.username}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {x.roles.length === 0 && <Text size="xs" c="dimmed">{t("users.noRole")}</Text>}
                      {x.roles.map((r) => (
                        <Badge key={r} size="sm" variant="light">{t(`roles.${r}`)}</Badge>
                      ))}
                      {x.overrides.length > 0 && <Badge size="sm" color="grape" variant="outline">{t("users.customized", { n: x.overrides.length })}</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge size="sm" color={x.status === "ACTIVE" ? "green" : "gray"}>{t(`users.status.${x.status}`)}</Badge>
                      {x.locked && <Badge size="sm" color="red">{t("users.locked")}</Badge>}
                      {x.mustChangePassword && <Badge size="sm" color="yellow">{t("users.mustChange")}</Badge>}
                    </Group>
                  </Table.Td>
                  <Table.Td>{x.lastLoginAt ? new Date(x.lastLoginAt).toLocaleString("fr-MA") : "—"}</Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      <Tooltip label={t("common.edit")}>
                        <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setModal({ kind: "edit", user: x })}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={t("users.access")}>
                        <ActionIcon variant="subtle" aria-label={t("users.access")} onClick={() => setModal({ kind: "access", user: x })} data-testid={`access-${x.username}`}>
                          <IconShieldLock size={16} />
                        </ActionIcon>
                      </Tooltip>
                      {x.id !== me?.id && (
                        <Tooltip label={t("users.resetPassword")}>
                          <ActionIcon variant="subtle" color="orange" aria-label={t("users.resetPassword")} onClick={() => resetPassword(x)}>
                            <IconKey size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {modal?.kind === "create" && (
        <CreateUserModal
          u={u}
          schoolId={schoolId}
          onClose={() => setModal(null)}
          onCreated={async (username, password) => {
            setModal(null);
            setTemp({ username, password });
            await reload();
          }}
        />
      )}
      {modal?.kind === "edit" && <EditUserModal u={u} schoolId={schoolId} user={modal.user} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.kind === "access" && <AccessModal u={u} schoolId={schoolId} user={modal.user} onClose={() => setModal(null)} onSaved={reload} />}
      <TempPasswordModal value={temp} onClose={() => setTemp(null)} />
    </>
  );
}

function showError(t: (k: string, v?: Record<string, string | number>) => string, e: unknown) {
  const code = e instanceof ApiError ? e.code : "";
  const key =
    code === "FORBIDDEN" ? "errors.forbidden" : code === "LAST_ADMIN" ? "errors.lastAdmin" : code === "CANNOT_DISABLE_SELF" ? "errors.cannotDisableSelf" : "errors.unexpected";
  notifications.show({ color: "red", message: t(key) });
}

function useRoleOptions() {
  const { t } = useI18n();
  const { isSystemAdmin } = useAuth();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.users!.listRoles() });
  // دور مدير النظام لا يمنحه إلا مدير نظام
  return (roles.data ?? []).filter((r) => isSystemAdmin || r.code !== "ADMIN").map((r) => ({ value: r.code, label: t(`roles.${r.code}`) }));
}

function TempPasswordModal({ value, onClose }: { value: null | { username: string; password: string }; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal opened={!!value} onClose={onClose} title={t("users.tempTitle")} centered closeOnClickOutside={false}>
      <Stack>
        <Text size="sm">{t("users.tempBody", { username: value?.username ?? "" })}</Text>
        <Group justify="space-between" className="rounded-md border border-gray-300 px-3 py-2">
          <Text ff="monospace" fw={700} size="lg" dir="ltr" data-testid="temp-password">{value?.password}</Text>
          <CopyButton value={value?.password ?? ""}>
            {({ copied, copy }) => (
              <Button size="xs" variant="light" leftSection={<IconCopy size={14} />} onClick={copy}>
                {copied ? t("users.copied") : t("users.copy")}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Alert color="yellow">{t("users.tempWarning")}</Alert>
        <Button onClick={onClose}>{t("users.tempDone")}</Button>
      </Stack>
    </Modal>
  );
}

function CreateUserModal({ u, schoolId, onClose, onCreated }: { u: UsersApi; schoolId: string; onClose: () => void; onCreated: (username: string, pw: string) => void }) {
  const { t } = useI18n();
  const roleOptions = useRoleOptions();
  const f = useForm<UserCreateInput>({ resolver: zodResolver(userCreateSchema), defaultValues: { roles: [] } });
  const err = (k: keyof UserCreateInput) => (f.formState.errors[k]?.message ? t(f.formState.errors[k]!.message!) : undefined);
  const submit = f.handleSubmit(async (v) => {
    try {
      const r = await u.create(schoolId, v);
      onCreated(r.user.username, r.temporaryPassword);
    } catch (e) {
      if (e instanceof ApiError && e.code === "DUPLICATE_USERNAME") f.setError("username", { message: "errors.duplicateUsername" });
      else showError(t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={t("users.add")} centered>
      <form onSubmit={submit} noValidate>
        <Stack>
          <TextInput label={t("users.fullNameAr")} {...f.register("fullNameAr")} error={err("fullNameAr")} />
          <TextInput label={t("users.fullNameFr")} dir="ltr" {...f.register("fullNameFr")} error={err("fullNameFr")} />
          <TextInput label={t("profile.username")} dir="ltr" autoComplete="off" {...f.register("username")} error={err("username")} />
          <Controller
            control={f.control}
            name="roles"
            render={({ field }) => (
              <MultiSelect label={t("users.roles")} data={roleOptions} value={field.value} onChange={field.onChange} error={err("roles")} data-testid="user-roles" />
            )}
          />
          <TextInput label={t("school.email")} dir="ltr" {...f.register("email")} error={err("email")} />
          <TextInput label={t("school.phone")} dir="ltr" {...f.register("phone")} error={err("phone")} />
          <Text size="xs" c="dimmed">{t("users.tempNote")}</Text>
          <Button type="submit" loading={f.formState.isSubmitting} data-testid="user-create-submit">{t("users.create")}</Button>
        </Stack>
      </form>
    </Modal>
  );
}

function EditUserModal({ u, schoolId, user, onClose, onSaved }: { u: UsersApi; schoolId: string; user: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const f = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      fullNameAr: user.fullNameAr,
      fullNameFr: user.fullNameFr ?? "",
      email: user.email ?? "",
      phone: user.phone ?? "",
      status: user.status === "ACTIVE" ? "ACTIVE" : "DISABLED",
    },
  });
  const err = (k: keyof UserUpdateInput) => (f.formState.errors[k]?.message ? t(f.formState.errors[k]!.message!) : undefined);
  const submit = f.handleSubmit(async (v) => {
    try {
      await u.update(schoolId, user.id, v);
      notifications.show({ color: "green", message: t("common.saved") });
      onSaved();
      onClose();
    } catch (e) {
      showError(t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={`${t("common.edit")}: ${user.username}`} centered>
      <form onSubmit={submit} noValidate>
        <Stack>
          <TextInput label={t("users.fullNameAr")} {...f.register("fullNameAr")} error={err("fullNameAr")} />
          <TextInput label={t("users.fullNameFr")} dir="ltr" {...f.register("fullNameFr")} error={err("fullNameFr")} />
          <TextInput label={t("school.email")} dir="ltr" {...f.register("email")} error={err("email")} />
          <TextInput label={t("school.phone")} dir="ltr" {...f.register("phone")} error={err("phone")} />
          <Controller
            control={f.control}
            name="status"
            render={({ field }) => (
              <Select
                label={t("users.status")}
                data={[
                  { value: "ACTIVE", label: t("users.status.ACTIVE") },
                  { value: "DISABLED", label: t("users.status.DISABLED") },
                ]}
                value={field.value}
                onChange={(v) => field.onChange(v ?? "ACTIVE")}
                allowDeselect={false}
                description={t("users.disableNote")}
              />
            )}
          />
          <Button type="submit" loading={f.formState.isSubmitting}>{t("common.save")}</Button>
        </Stack>
      </form>
    </Modal>
  );
}

type OverrideState = "role" | "grant" | "revoke";

/** الأدوار + التخصيص الفردي: لكل صلاحية «حسب الدور» أو «منح» أو «سحب». */
function AccessModal({ u, schoolId, user, onClose, onSaved }: { u: UsersApi; schoolId: string; user: ManagedUser; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const roleOptions = useRoleOptions();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => u.listRoles() });
  const perms = useQuery({ queryKey: ["permissions"], queryFn: () => u.listPermissions() });
  const [selRoles, setSelRoles] = useState<RoleCode[]>(user.roles);
  const [ov, setOv] = useState<Record<string, OverrideState>>(() =>
    Object.fromEntries(user.overrides.map((o) => [o.permission, o.granted ? "grant" : "revoke"])),
  );
  const [saving, setSaving] = useState(false);

  const fromRoles = useMemo(() => {
    const s = new Set<string>();
    for (const r of roles.data ?? []) if (selRoles.includes(r.code)) r.permissions.forEach((p) => s.add(p));
    return s;
  }, [roles.data, selRoles]);

  const byModule = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of perms.data ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p.code]);
    return [...m];
  }, [perms.data]);

  const effective = (code: string) => (ov[code] === "grant" ? true : ov[code] === "revoke" ? false : fromRoles.has(code));

  const save = async () => {
    setSaving(true);
    try {
      const overrides: PermissionOverride[] = Object.entries(ov)
        .filter(([, v]) => v !== "role")
        .map(([permission, v]) => ({ permission, granted: v === "grant" }));
      const rolesChanged = [...selRoles].sort().join() !== [...user.roles].sort().join();
      if (rolesChanged) await u.setRoles(schoolId, user.id, selRoles);
      await u.setOverrides(schoolId, user.id, overrides);
      notifications.show({ color: "green", message: t("common.saved") });
      onSaved();
      onClose();
    } catch (e) {
      showError(t, e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={`${t("users.access")}: ${user.fullNameAr}`} size="xl" centered>
      <Stack>
        <MultiSelect label={t("users.roles")} data={roleOptions} value={selRoles} onChange={(v) => setSelRoles(v as RoleCode[])} data-testid="access-roles" />
        <Text size="sm" c="dimmed">{t("users.overridesIntro")}</Text>
        <Accordion variant="contained" multiple>
          {byModule.map(([module, codes]) => {
            const n = codes.filter(effective).length;
            const custom = codes.filter((c) => ov[c] && ov[c] !== "role").length;
            return (
              <Accordion.Item key={module} value={module}>
                <Accordion.Control data-testid={`perm-module-${module}`}>
                  <Group gap="xs">
                    <Text fw={600}>{t(`perm.module.${module}`)}</Text>
                    <Badge size="xs" variant="light">{n}/{codes.length}</Badge>
                    {custom > 0 && <Badge size="xs" color="grape">{t("users.customized", { n: custom })}</Badge>}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Table verticalSpacing={4}>
                    <Table.Tbody>
                      {codes.map((code) => (
                        <Table.Tr key={code}>
                          <Table.Td>
                            <Text size="sm">{t(`perm.action.${code.split(".")[1]}`)}</Text>
                            <Text size="xs" c="dimmed" dir="ltr" style={{ textAlign: "start" }}>{code}</Text>
                          </Table.Td>
                          <Table.Td w={70}>
                            <Badge size="sm" color={effective(code) ? "green" : "gray"} variant={effective(code) ? "filled" : "light"}>
                              {effective(code) ? t("users.allowed") : t("users.denied")}
                            </Badge>
                          </Table.Td>
                          <Table.Td w={260}>
                            <SegmentedControl
                              size="xs"
                              fullWidth
                              value={ov[code] ?? "role"}
                              onChange={(v) => setOv((o) => ({ ...o, [code]: v as OverrideState }))}
                              data={[
                                { value: "role", label: fromRoles.has(code) ? t("users.byRoleYes") : t("users.byRoleNo") },
                                { value: "grant", label: t("users.grant") },
                                { value: "revoke", label: t("users.revoke") },
                              ]}
                              data-testid={`ov-${code}`}
                            />
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={save} loading={saving} data-testid="access-save">{t("common.save")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
