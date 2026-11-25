import { useEffect, useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Group, Modal, NumberInput, Select, Stack, Switch, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconEdit, IconPlus } from "@tabler/icons-react";
import { DEFAULT_INVENTORY_PATTERN, formatNumber, isValidPattern, LOOKUP_KEYS } from "@hassan/shared";
import { categorySchema, lookupValueSchema, type CategoryInput, type LookupValueInput } from "@hassan/validation";
import { api, type Category, type LookupValue } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, handleFormError, notifyError } from "../../lib/forms";

/** إعدادات المرجعيات: صيغة رقم الجرد، تصنيفات الممتلكات، والقوائم المرجعية القابلة للتعديل. */
export function CatalogPage() {
  const { t } = useI18n();
  const { activeSchool } = useAuth();
  if (!api.catalog) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;
  if (!activeSchool) return null;
  return (
    <Stack mt="md">
      <NumberingCard schoolId={activeSchool.id} />
      <CategoriesCard schoolId={activeSchool.id} />
      <LookupsCard schoolId={activeSchool.id} />
    </Stack>
  );
}

function NumberingCard({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can, activeSchool } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["numbering", schoolId], queryFn: () => api.catalog!.numbering(schoolId) });
  const [pattern, setPattern] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setPattern(q.data.inventoryNumberPattern);
  }, [q.data]);
  const valid = isValidPattern(pattern) && /^[A-Za-z0-9{}:\-/_.]+$/.test(pattern);
  const preview = valid ? formatNumber(pattern, { school: activeSchool?.adminCode, year: new Date().getFullYear(), seq: 1 }) : "";
  const editable = can("settings.manage");
  const save = async () => {
    setBusy(true);
    try {
      await api.catalog!.setNumbering(schoolId, pattern);
      await qc.invalidateQueries({ queryKey: ["numbering", schoolId] });
      notifications.show({ color: "green", message: t("common.saved") });
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <Title order={5}>{t("catalog.numbering")}</Title>
      <Text size="sm" c="dimmed" mb="sm">{t("catalog.numberingIntro")}</Text>
      <Group align="flex-end">
        <TextInput
          className="min-w-[260px]"
          label={t("catalog.pattern")}
          dir="ltr"
          value={pattern}
          onChange={(e) => setPattern(e.currentTarget.value)}
          error={pattern && !valid ? t("errors.patternSeq") : undefined}
          readOnly={!editable}
          data-testid="pattern-input"
        />
        {editable && (
          <>
            <Button onClick={save} loading={busy} disabled={!valid || pattern === q.data?.inventoryNumberPattern} data-testid="pattern-save">{t("common.save")}</Button>
            <Button variant="subtle" onClick={() => setPattern(DEFAULT_INVENTORY_PATTERN)}>{t("catalog.defaultPattern")}</Button>
          </>
        )}
      </Group>
      <Text size="sm" mt="xs">
        {t("catalog.preview")}: <b dir="ltr" className="font-mono" data-testid="pattern-preview">{preview || "—"}</b>
      </Text>
      <Text size="xs" c="dimmed" mt={4}>{t("catalog.patternHelp")}</Text>
    </Card>
  );
}

function CategoriesCard({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const [edit, setEdit] = useState<null | { c?: Category }>(null);
  const editable = can("lookups.manage");
  const byId = new Map(cat.categories.map((c) => [c.id, c]));
  return (
    <Card>
      <Group justify="space-between" mb="sm">
        <div>
          <Title order={5}>{t("catalog.categories")}</Title>
          <Text size="sm" c="dimmed">{t("catalog.categoriesIntro")}</Text>
        </div>
        {editable && (
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-category">{t("catalog.addCategory")}</Button>
        )}
      </Group>
      <Table striped verticalSpacing={6} data-testid="categories-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("stock.code")}</Table.Th>
            <Table.Th>{t("catalog.nameAr")}</Table.Th>
            <Table.Th>{t("catalog.nameFr")}</Table.Th>
            <Table.Th>{t("catalog.parent")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {cat.categories.map((c) => (
            <Table.Tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
              <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{c.code}</Table.Td>
              <Table.Td>{c.nameAr}</Table.Td>
              <Table.Td dir="ltr" style={{ textAlign: "start" }}>{c.nameFr ?? ""}</Table.Td>
              <Table.Td>{c.parentId ? byId.get(c.parentId)?.nameAr : ""}</Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end">
                  {c.global && <Badge size="xs" variant="outline" color="gray">{t("catalog.global")}</Badge>}
                  {!c.isActive && <Badge size="xs" color="gray">{t("common.inactive")}</Badge>}
                  {editable && !c.global && (
                    <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ c })}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {cat.categories.length === 0 && <Text c="dimmed" ta="center" py="md">{t("catalog.noCategories")}</Text>}
      {edit && <CategoryModal schoolId={schoolId} c={edit.c} all={cat.categories} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function CategoryModal({ schoolId, c, all, onClose }: { schoolId: string; c?: Category; all: Category[]; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const f = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { code: c?.code ?? "", nameAr: c?.nameAr ?? "", nameFr: c?.nameFr ?? "", parentId: c?.parentId ?? "", isActive: c?.isActive ?? true },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (c) await api.catalog!.updateCategory(schoolId, c.id, v);
      else await api.catalog!.createCategory(schoolId, v);
      await qc.invalidateQueries({ queryKey: ["categories", schoolId] });
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code", CATEGORY_CYCLE: "parentId", CATEGORY_NOT_FOUND: "parentId" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={c ? t("catalog.editCategory") : t("catalog.addCategory")} centered>
      <form onSubmit={submit} noValidate data-testid="category-form">
        <Stack>
          <TextInput label={t("stock.code")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
          <TextInput label={t("catalog.nameAr")} required {...f.register("nameAr")} error={err("nameAr")} />
          <TextInput label={t("catalog.nameFr")} dir="ltr" {...f.register("nameFr")} error={err("nameFr")} />
          <Controller
            control={f.control}
            name="parentId"
            render={({ field }) => (
              <Select
                label={t("catalog.parent")}
                clearable
                searchable
                data={all.filter((x) => x.id !== c?.id).map((x) => ({ value: x.id, label: `${x.code} — ${x.nameAr}` }))}
                value={field.value || null}
                onChange={(x) => field.onChange(x ?? "")}
                error={err("parentId")}
              />
            )}
          />
          <Controller control={f.control} name="isActive" render={({ field }) => <Switch label={t("common.active")} checked={field.value ?? true} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="category-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function LookupsCard({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const [listKey, setListKey] = useState<string>(LOOKUP_KEYS[0]);
  const [edit, setEdit] = useState<null | { v?: LookupValue }>(null);
  const q = useQuery({ queryKey: ["lookups", schoolId, "admin", listKey], queryFn: () => api.catalog!.lookups(schoolId, listKey, true) });
  const editable = can("lookups.manage");
  return (
    <Card>
      <Group justify="space-between" mb="sm" align="flex-end">
        <div>
          <Title order={5}>{t("catalog.lookups")}</Title>
          <Text size="sm" c="dimmed">{t("catalog.lookupsIntro")}</Text>
        </div>
        <Group align="flex-end">
          <Select label={t("catalog.list")} data={LOOKUP_KEYS.map((k) => ({ value: k, label: t(`lookupList.${k}`) }))} value={listKey} onChange={(x) => x && setListKey(x)} allowDeselect={false} data-testid="lookup-list" />
          {editable && <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEdit({})} data-testid="add-lookup">{t("catalog.addValue")}</Button>}
        </Group>
      </Group>
      <Table striped verticalSpacing={6} data-testid="lookups-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("stock.code")}</Table.Th>
            <Table.Th>{t("catalog.labelAr")}</Table.Th>
            <Table.Th>{t("catalog.labelFr")}</Table.Th>
            <Table.Th>{t("catalog.order")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(q.data ?? []).map((v) => (
            <Table.Tr key={v.id} className={v.isActive ? "" : "opacity-60"}>
              <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{v.code}</Table.Td>
              <Table.Td>{v.labelAr}</Table.Td>
              <Table.Td dir="ltr" style={{ textAlign: "start" }}>{v.labelFr ?? ""}</Table.Td>
              <Table.Td>{v.sortOrder}</Table.Td>
              <Table.Td>
                <Group gap={4} justify="flex-end">
                  {v.global && <Badge size="xs" variant="outline" color="gray">{t("catalog.global")}</Badge>}
                  {!v.isActive && <Badge size="xs" color="gray">{t("common.inactive")}</Badge>}
                  {editable && !v.global && (
                    <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEdit({ v })}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {q.data?.length === 0 && <Text c="dimmed" ta="center" py="md">{t("catalog.noValues")}</Text>}
      {edit && <LookupModal schoolId={schoolId} listKey={listKey} v={edit.v} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function LookupModal({ schoolId, listKey, v, onClose }: { schoolId: string; listKey: string; v?: LookupValue; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const f = useForm<LookupValueInput>({
    resolver: zodResolver(lookupValueSchema),
    defaultValues: { code: v?.code ?? "", labelAr: v?.labelAr ?? "", labelFr: v?.labelFr ?? "", sortOrder: v?.sortOrder ?? 0, isActive: v?.isActive ?? true },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (x) => {
    try {
      if (v) await api.catalog!.updateLookup(schoolId, v.id, x);
      else await api.catalog!.createLookup(schoolId, listKey, x);
      await qc.invalidateQueries({ queryKey: ["lookups", schoolId] });
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={`${t(v ? "catalog.editValue" : "catalog.addValue")} — ${t(`lookupList.${listKey}`)}`} centered>
      <form onSubmit={submit} noValidate data-testid="lookup-form">
        <Stack>
          <TextInput label={t("stock.code")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
          <TextInput label={t("catalog.labelAr")} required {...f.register("labelAr")} error={err("labelAr")} />
          <TextInput label={t("catalog.labelFr")} dir="ltr" {...f.register("labelFr")} error={err("labelFr")} />
          <Controller control={f.control} name="sortOrder" render={({ field }) => <NumberInput label={t("catalog.order")} min={0} allowDecimal={false} value={field.value ?? 0} onChange={(x) => field.onChange(Number(x) || 0)} />} />
          <Controller control={f.control} name="isActive" render={({ field }) => <Switch label={t("common.active")} checked={field.value ?? true} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="lookup-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
