import { useState } from "react";
import { ActionIcon, Alert, Badge, Button, Card, Group, Modal, Select, Stack, Switch, Table, Text, TextInput, Title, Tooltip } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArrowDown, IconArrowUp, IconEdit, IconPlus, IconTrash } from "@tabler/icons-react";
import { ROLE_CODES } from "@hassan/shared";
import { approvalWorkflowSchema, type ApprovalWorkflowInput } from "@hassan/validation";
import { api, type ApprovalWorkflow } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, handleFormError } from "../../lib/forms";

/**
 * مسارات المصادقة على الطلبيات: لكل مصدر تمويل/جهة مدبرة مساره وخطواته (أو بلا خطوات).
 * لا يُفترض نفس الإجراء للجميع؛ المسار بلا مصدر تمويل هو الافتراضي.
 */
export function ApprovalWorkflowsPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.purchasing) return <Alert color="yellow" mt="md">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("purchasing.view")) return <Alert color="red" mt="md">{t("errors.forbidden")}</Alert>;
  return <WorkflowsScreen schoolId={activeSchool.id} />;
}

function WorkflowsScreen({ schoolId }: { schoolId: string }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["workflows", schoolId], queryFn: () => api.purchasing!.workflows(schoolId) });
  const [editing, setEditing] = useState<ApprovalWorkflow | "new" | null>(null);
  const manage = can("settings.manage");
  return (
    <Card mt="md">
      <Group justify="space-between" mb="md">
        <div>
          <Title order={5}>{t("settings.workflows")}</Title>
          <Text size="sm" c="dimmed">{t("wf.intro")}</Text>
        </div>
        {manage && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")} data-testid="new-workflow">
            {t("wf.new")}
          </Button>
        )}
      </Group>
      {!manage && <Alert color="gray" variant="light" mb="sm">{t("common.readOnly")}</Alert>}
      <Table striped verticalSpacing="sm" data-testid="workflows-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("wf.name")}</Table.Th>
            <Table.Th>{t("po.funding")}</Table.Th>
            <Table.Th>{t("wf.managingBody")}</Table.Th>
            <Table.Th>{t("wf.steps")}</Table.Th>
            <Table.Th>{t("assets.status")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(list.data ?? []).map((w) => (
            <Table.Tr key={w.id} data-testid={`wf-row-${w.name}`}>
              <Table.Td fw={600}>{w.name}</Table.Td>
              <Table.Td>{w.fundingSourceId ? cat.lookupLabel(w.fundingSourceId) : <Badge variant="outline" color="gray">{t("wf.default")}</Badge>}</Table.Td>
              <Table.Td>{w.managingBody ?? "—"}</Table.Td>
              <Table.Td>
                {w.steps.length === 0 ? (
                  <Text size="sm" c="dimmed">{t("po.directApproval")}</Text>
                ) : (
                  w.steps.map((s) => (
                    <Text key={s.id} size="sm">
                      {s.order}. {s.name} {s.requiredRoleCode ? <Text span c="dimmed" size="xs">({t(`roles.${s.requiredRoleCode}`)})</Text> : null}
                    </Text>
                  ))
                )}
              </Table.Td>
              <Table.Td>{w.isActive ? <Badge color="green" variant="light">{t("common.active")}</Badge> : <Badge color="gray" variant="light">{t("common.inactive")}</Badge>}</Table.Td>
              <Table.Td>
                {manage && (
                  <Tooltip label={t("common.edit")}>
                    <ActionIcon variant="subtle" aria-label={t("common.edit")} onClick={() => setEditing(w)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {list.data && list.data.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("wf.empty")}</Text>}
      {editing && <WorkflowModal schoolId={schoolId} wf={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["workflows", schoolId] })} />}
    </Card>
  );
}

function WorkflowModal({ schoolId, wf, onClose, onSaved }: { schoolId: string; wf: ApprovalWorkflow | null; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const f = useForm<ApprovalWorkflowInput>({
    resolver: zodResolver(approvalWorkflowSchema),
    defaultValues: wf
      ? { name: wf.name, fundingSourceId: wf.fundingSourceId ?? "", managingBody: wf.managingBody ?? "", isActive: wf.isActive, steps: wf.steps.map((s) => ({ name: s.name, requiredRoleCode: s.requiredRoleCode ?? "" })) }
      : { name: "", fundingSourceId: "", managingBody: "", isActive: true, steps: [{ name: "", requiredRoleCode: "DIRECTOR" }] },
  });
  const err = fieldError(f, t);
  const steps = useFieldArray({ control: f.control, name: "steps" });
  const roleOptions = ROLE_CODES.map((r) => ({ value: r, label: t(`roles.${r}`) }));
  const submit = f.handleSubmit(async (v) => {
    try {
      await api.purchasing!.saveWorkflow(schoolId, wf?.id ?? null, v);
      await onSaved();
      onClose();
    } catch (e) {
      handleFormError(f, t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={wf ? t("wf.edit") : t("wf.new")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="workflow-form">
        <Stack>
          <TextInput label={t("wf.name")} required {...f.register("name")} error={err("name")} data-testid="wf-name" />
          <Controller control={f.control} name="fundingSourceId" render={({ field }) => <Select label={t("po.funding")} description={t("wf.fundingHint")} clearable data={cat.lookupOptions("FUNDING_SOURCE")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("fundingSourceId")} data-testid="wf-funding" />} />
          <TextInput label={t("wf.managingBody")} description={t("wf.managingBodyHint")} {...f.register("managingBody")} error={err("managingBody")} />
          <Text fw={600} size="sm">{t("wf.steps")}</Text>
          {steps.fields.length === 0 && <Alert variant="light" color="blue">{t("wf.noStepsHint")}</Alert>}
          {steps.fields.map((s, k) => (
            <Group key={s.id} gap="xs" align="flex-end" wrap="nowrap">
              <Text fw={700} w={20}>{k + 1}</Text>
              <TextInput className="flex-1" label={t("wf.stepName")} required {...f.register(`steps.${k}.name`)} error={err(`steps.${k}.name`)} data-testid={`wf-step-${k}`} />
              <Controller control={f.control} name={`steps.${k}.requiredRoleCode`} render={({ field }) => <Select w={200} label={t("wf.requiredRole")} placeholder={t("po.anyApprover")} clearable data={roleOptions} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err(`steps.${k}.requiredRoleCode`)} />} />
              <ActionIcon variant="subtle" disabled={k === 0} onClick={() => steps.move(k, k - 1)} aria-label={t("wf.up")}><IconArrowUp size={16} /></ActionIcon>
              <ActionIcon variant="subtle" disabled={k === steps.fields.length - 1} onClick={() => steps.move(k, k + 1)} aria-label={t("wf.down")}><IconArrowDown size={16} /></ActionIcon>
              <ActionIcon variant="subtle" color="red" onClick={() => steps.remove(k)} aria-label={t("common.delete")}><IconTrash size={16} /></ActionIcon>
            </Group>
          ))}
          <Group>
            <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={() => steps.append({ name: "", requiredRoleCode: "" })} data-testid="wf-add-step">{t("wf.addStep")}</Button>
          </Group>
          <Controller control={f.control} name="isActive" render={({ field }) => <Switch label={t("common.active")} checked={field.value ?? true} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="wf-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
