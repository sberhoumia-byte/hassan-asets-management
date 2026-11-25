import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Center, Grid, Group, Loader, Modal, NumberInput, SegmentedControl, Select, Stack, Table, Text, TextInput, Textarea, Timeline, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArrowBack, IconCheck, IconClock, IconEdit, IconPackageImport, IconX } from "@tabler/icons-react";
import { PO_CANCELLABLE, PO_EDITABLE, PO_RECEIVABLE } from "@hassan/shared";
import { deliverySchema, invoiceSchema, type DeliveryInput, type InvoiceInput } from "@hassan/validation";
import { api, ApiError, type PurchaseOrder } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { usePlaces } from "../../hooks/usePlaces";
import { fieldError, fmtMoney, fmtQty, handleFormError, newOpId, notifyError, today } from "../../lib/forms";
import { PoFormModal, PoStatusBadge } from "./PurchasingPage";

type Dialog = "edit" | "submit" | "order" | "cancel" | "deliver" | "invoice" | { decide: { stepId: string; name: string; decision: "APPROVED" | "REJECTED" } } | { post: { id: string; description: string; qty: number; poItemId?: string } };

/** طلبية واحدة: كل مرحلة من المسار بإجرائها، والمصادقات والتسلمات والإدخال والفواتير مؤرخة. */
export function PurchaseOrderPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  const { id = "" } = useParams();
  if (!api.purchasing) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("purchasing.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <PoScreen schoolId={activeSchool.id} id={id} />;
}

function PoScreen({ schoolId, id }: { schoolId: string; id: string }) {
  const { t, fmtDate, fmtDateTime } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const nav = useNavigate();
  const qc = useQueryClient();
  const po = useQuery({ queryKey: ["po", schoolId, id], queryFn: () => api.purchasing!.get(schoolId, id) });
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => Promise.all(["po", "purchase-orders", "assets", "stock-items", "dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));

  if (po.isError) return <Alert color="red">{t(po.error instanceof ApiError && po.error.code === "NOT_FOUND" ? "errors.notFound" : "errors.unexpected")}</Alert>;
  if (!po.data)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  const p = po.data;
  const upd = can("purchasing.update");
  const nextStep = p.status === "PENDING_APPROVAL" ? p.approvals.find((a) => a.decision === "PENDING") : undefined;
  const close = async () => {
    setBusy(true);
    try {
      await api.purchasing!.close(schoolId, id);
      await reload();
    } catch (e) {
      notifyError(t, e);
    } finally {
      setBusy(false);
    }
  };
  const row = (k: string, v: React.ReactNode) => (
    <Group gap="xs" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={150} style={{ flexShrink: 0 }}>{k}</Text>
      <Text size="sm" component="div">{v}</Text>
    </Group>
  );
  return (
    <>
      <Card>
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <ActionIcon variant="subtle" aria-label={t("doc.back")} onClick={() => nav("/purchasing")}>
                <IconArrowBack size={18} />
              </ActionIcon>
              <Title order={4}>
                {p.title} — <span dir="ltr">{p.number}</span>
              </Title>
              <PoStatusBadge status={p.status} />
            </Group>
            <Text size="sm" c="dimmed" mt={4}>{t(`poHint.${p.status}`)}</Text>
          </div>
          <Group gap="xs">
            {PO_EDITABLE.includes(p.status) && upd && (
              <>
                <Button size="sm" variant="default" leftSection={<IconEdit size={16} />} onClick={() => setDialog("edit")} data-testid="po-edit">{t("common.edit")}</Button>
                <Button size="sm" onClick={() => setDialog("submit")} data-testid="po-submit">{t("poAction.submit")}</Button>
              </>
            )}
            {p.status === "APPROVED" && upd && <Button size="sm" onClick={() => setDialog("order")} data-testid="po-order">{t("poAction.order")}</Button>}
            {PO_RECEIVABLE.includes(p.status) && upd && <Button size="sm" leftSection={<IconPackageImport size={16} />} onClick={() => setDialog("deliver")} data-testid="po-deliver">{t("poAction.deliver")}</Button>}
            {["PARTIALLY_DELIVERED", "DELIVERED", "INVOICED"].includes(p.status) && upd && p.supplierId && <Button size="sm" variant="light" onClick={() => setDialog("invoice")} data-testid="po-invoice">{t("poAction.invoice")}</Button>}
            {["DELIVERED", "INVOICED"].includes(p.status) && upd && <Button size="sm" color="dark" loading={busy} onClick={close} data-testid="po-close">{t("poAction.close")}</Button>}
            {PO_CANCELLABLE.includes(p.status) && can("purchasing.cancel") && <Button size="sm" variant="subtle" color="red" onClick={() => setDialog("cancel")} data-testid="po-cancel">{t("poAction.cancel")}</Button>}
          </Group>
        </Group>
      </Card>
      <Grid>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card h="100%">
            <Stack gap={6}>
              {p.needDescription && row(t("po.need"), p.needDescription)}
              {row(t("po.funding"), p.fundingSourceId ? cat.lookupLabel(p.fundingSourceId) : t("po.noFunding"))}
              {p.budgetLine && row(t("po.budgetLine"), p.budgetLine)}
              {row(t("po.supplier"), p.supplier ?? "—")}
              {p.workflow && row(t("po.workflow"), p.workflow.name)}
              {p.orderDocRef && row(t("po.orderDocRef"), <span dir="ltr">{p.orderDocRef}</span>)}
              {p.orderedAt && row(t("po.orderedAt"), fmtDate(`${p.orderedAt}T12:00:00`))}
              {row(t("po.estimatedTotal"), p.estimatedTotal !== undefined ? `${fmtMoney(p.estimatedTotal)} ${t("unit.mad")}` : t("po.notEstimated"))}
            </Stack>
            <Table mt="md" verticalSpacing="xs" data-testid="po-items">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t("po.itemDescription")}</Table.Th>
                  <Table.Th>{t("po.targetKind")}</Table.Th>
                  <Table.Th>{t("assets.quantity")}</Table.Th>
                  <Table.Th>{t("po.unitCost")}</Table.Th>
                  <Table.Th>{t("po.accepted")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {p.items.map((i) => (
                  <Table.Tr key={i.id}>
                    <Table.Td>{i.description}</Table.Td>
                    <Table.Td>{t(`poTarget.${i.targetKind}`)}</Table.Td>
                    <Table.Td>{fmtQty(i.quantity)}{i.unitId ? ` ${cat.lookupLabel(i.unitId)}` : ""}</Table.Td>
                    <Table.Td>{i.estimatedUnitCost !== undefined ? fmtMoney(i.estimatedUnitCost) : "—"}</Table.Td>
                    <Table.Td>
                      <Badge color={i.accepted >= i.quantity ? "green" : i.accepted > 0 ? "orange" : "gray"} variant="light">{fmtQty(i.accepted)} / {fmtQty(i.quantity)}</Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card h="100%">
            <Text fw={700} mb="sm">{t("po.approvals")}</Text>
            {p.approvals.length === 0 ? (
              <Text size="sm" c="dimmed">{p.workflow ? t("po.directApproval") : t("po.notSubmitted")}</Text>
            ) : (
              <Timeline bulletSize={22} lineWidth={2} active={p.approvals.filter((a) => a.decision !== "PENDING").length - 1} data-testid="po-approvals">
                {p.approvals.map((a) => (
                  <Timeline.Item
                    key={a.stepId}
                    color={a.decision === "APPROVED" ? "green" : a.decision === "REJECTED" ? "red" : "gray"}
                    bullet={a.decision === "APPROVED" ? <IconCheck size={12} /> : a.decision === "REJECTED" ? <IconX size={12} /> : <IconClock size={12} />}
                    title={`${a.order}. ${a.name}`}
                  >
                    <Text size="xs" c="dimmed">{a.requiredRoleCode ? t("po.requiredRole", { role: t(`roles.${a.requiredRoleCode}`) }) : t("po.anyApprover")}</Text>
                    {a.decision !== "PENDING" && (
                      <Text size="sm">
                        {t(`poDecision.${a.decision}`)} — {a.decidedBy ?? ""} {a.decidedAt ? `(${fmtDateTime(a.decidedAt)})` : ""}
                      </Text>
                    )}
                    {a.comment && <Text size="sm" fs="italic">«{a.comment}»</Text>}
                    {nextStep?.stepId === a.stepId && (
                      <Group gap="xs" mt={6}>
                        <Button size="xs" color="green" onClick={() => setDialog({ decide: { stepId: a.stepId, name: a.name, decision: "APPROVED" } })} data-testid={`approve-${a.order}`}>{t("poDecision.approve")}</Button>
                        <Button size="xs" color="red" variant="light" onClick={() => setDialog({ decide: { stepId: a.stepId, name: a.name, decision: "REJECTED" } })} data-testid={`reject-${a.order}`}>{t("poDecision.reject")}</Button>
                      </Group>
                    )}
                  </Timeline.Item>
                ))}
              </Timeline>
            )}
          </Card>
        </Grid.Col>
      </Grid>
      {p.deliveries.length > 0 && (
        <Card>
          <Text fw={700} mb="sm">{t("po.deliveries")}</Text>
          <Stack>
            {p.deliveries.map((d) => (
              <div key={d.id} data-testid={`delivery-${d.number}`}>
                <Group gap="xs" mb={4}>
                  <Text size="sm" fw={600} dir="ltr">{d.number}</Text>
                  <Text size="sm" c="dimmed">{fmtDate(`${d.receivedAt}T12:00:00`)}</Text>
                  <Badge size="sm" variant="light" color={d.conformity === "CONFORM" ? "green" : d.conformity === "PARTIAL" ? "orange" : "red"}>{t(`conformity.${d.conformity}`)}</Badge>
                  {d.conformityNotes && <Text size="xs" c="dimmed">{d.conformityNotes}</Text>}
                </Group>
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    {d.items.map((x) => (
                      <Table.Tr key={x.id}>
                        <Table.Td>{x.description}</Table.Td>
                        <Table.Td>{t("po.receivedN", { n: fmtQty(x.quantityReceived) })}</Table.Td>
                        <Table.Td>{t("po.acceptedN", { n: fmtQty(x.quantityAccepted) })}</Table.Td>
                        <Table.Td w={220}>
                          {x.postedAt ? (
                            <Badge color="green" variant="light">{t(`poPosted.${x.postedAs ?? "ASSETS"}`)}</Badge>
                          ) : x.quantityAccepted > 0 && upd ? (
                            <Button size="xs" variant="light" onClick={() => setDialog({ post: { id: x.id, description: x.description, qty: x.quantityAccepted, poItemId: x.purchaseOrderItemId } })} data-testid={`post-${x.id}`}>
                              {t("poAction.post")}
                            </Button>
                          ) : x.quantityAccepted > 0 ? (
                            <Badge color="orange" variant="light">{t("po.notPosted")}</Badge>
                          ) : null}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            ))}
          </Stack>
        </Card>
      )}
      {p.invoices.length > 0 && (
        <Card>
          <Text fw={700} mb="sm">{t("po.invoices")}</Text>
          <Table verticalSpacing={4} data-testid="po-invoices">
            <Table.Tbody>
              {p.invoices.map((v) => (
                <Table.Tr key={v.id}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }}>{v.invoiceNumber}</Table.Td>
                  <Table.Td>{fmtDate(`${v.invoiceDate}T12:00:00`)}</Table.Td>
                  <Table.Td>{fmtMoney(v.amount)} {t("unit.mad")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
      {dialog === "edit" && <PoFormModal schoolId={schoolId} po={p} onClose={() => setDialog(null)} onSaved={() => setDialog(null)} />}
      {dialog === "submit" && <SubmitModal schoolId={schoolId} po={p} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === "order" && <OrderModal schoolId={schoolId} po={p} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === "cancel" && <CancelModal schoolId={schoolId} po={p} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === "deliver" && <DeliveryModal schoolId={schoolId} po={p} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog === "invoice" && <InvoiceModal schoolId={schoolId} po={p} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog && typeof dialog === "object" && "decide" in dialog && <DecideModal schoolId={schoolId} po={p} {...dialog.decide} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog && typeof dialog === "object" && "post" in dialog && <PostModal schoolId={schoolId} po={p} line={dialog.post} onClose={() => setDialog(null)} onDone={reload} />}
    </>
  );
}

/** نافذة إجراء بسيط: زر تأكيد + معالجة الخطأ. */
function ActionModal({ title, children, onClose, onConfirm, color, testId }: { title: string; children: React.ReactNode; onClose: () => void; onConfirm: () => Promise<unknown>; color?: string; testId?: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal opened onClose={onClose} title={title} centered>
      <Stack>
        {children}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
          <Button color={color} loading={busy} onClick={go} data-testid={testId}>{t("common.confirm")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function SubmitModal({ schoolId, po, onClose, onDone }: { schoolId: string; po: PurchaseOrder; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const wfs = useQuery({ queryKey: ["workflows", schoolId], queryFn: () => api.purchasing!.workflows(schoolId) });
  const [wf, setWf] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const active = (wfs.data ?? []).filter((w) => w.isActive);
  return (
    <ActionModal
      title={`${t("poAction.submit")} — ${po.number}`}
      onClose={onClose}
      testId="submit-confirm"
      onConfirm={async () => {
        try {
          const r = await api.purchasing!.submit(schoolId, po.id, wf ?? undefined);
          notifications.show({ color: "green", message: t(`poStatus.${r.status}`) });
          await onDone();
          onClose();
        } catch (e) {
          if (e instanceof ApiError && ["NO_WORKFLOW", "WORKFLOW_AMBIGUOUS"].includes(e.code)) setError(t(e.code === "NO_WORKFLOW" ? "errors.noWorkflow" : "errors.workflowAmbiguous"));
          else notifyError(t, e);
        }
      }}
    >
      <Text size="sm">{t("po.submitHint")}</Text>
      <Select
        label={t("po.workflow")}
        placeholder={t("po.autoWorkflow")}
        clearable
        data={active.map((w) => ({ value: w.id, label: `${w.name}${w.fundingSourceId ? ` (${cat.lookupLabel(w.fundingSourceId)})` : ""} — ${t("po.stepsN", { n: w.steps.length })}` }))}
        value={wf}
        onChange={(v) => { setWf(v); setError(undefined); }}
        error={error}
        data-testid="submit-workflow"
      />
      {active.length === 0 && wfs.data && <Alert color="orange" variant="light">{t("errors.noWorkflow")}</Alert>}
    </ActionModal>
  );
}

function DecideModal({ schoolId, po, stepId, name, decision, onClose, onDone }: { schoolId: string; po: PurchaseOrder; stepId: string; name: string; decision: "APPROVED" | "REJECTED"; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <ActionModal
      title={`${t(decision === "APPROVED" ? "poDecision.approve" : "poDecision.reject")} — ${name}`}
      color={decision === "APPROVED" ? "green" : "red"}
      onClose={onClose}
      testId="decide-confirm"
      onConfirm={async () => {
        if (decision === "REJECTED" && !comment.trim()) return setError(t("errors.rejectNeedsComment"));
        try {
          await api.purchasing!.decide(schoolId, po.id, stepId, decision, comment);
          await onDone();
          onClose();
        } catch (e) {
          notifyError(t, e);
        }
      }}
    >
      <Textarea label={t("po.comment")} required={decision === "REJECTED"} autosize minRows={2} value={comment} onChange={(e) => { setComment(e.currentTarget.value); setError(undefined); }} error={error} data-testid="decide-comment" />
    </ActionModal>
  );
}

function OrderModal({ schoolId, po, onClose, onDone }: { schoolId: string; po: PurchaseOrder; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const [supplierId, setSupplierId] = useState<string | null>(po.supplierId ?? null);
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | undefined>();
  return (
    <ActionModal
      title={`${t("poAction.order")} — ${po.number}`}
      onClose={onClose}
      testId="order-confirm"
      onConfirm={async () => {
        if (!supplierId) return setError(t("errors.required"));
        try {
          await api.purchasing!.order(schoolId, po.id, { supplierId, orderDocRef: ref, orderedAt: date });
          await onDone();
          onClose();
        } catch (e) {
          notifyError(t, e);
        }
      }}
    >
      <Select label={t("po.supplier")} required searchable data={cat.supplierOptions} value={supplierId} onChange={(v) => { setSupplierId(v); setError(undefined); }} error={error} data-testid="order-supplier" />
      <TextInput label={t("po.orderDocRef")} description={t("po.orderDocRefHint")} value={ref} onChange={(e) => setRef(e.currentTarget.value)} data-testid="order-ref" />
      <TextInput type="date" label={t("po.orderedAt")} max={today()} value={date} onChange={(e) => setDate(e.currentTarget.value)} />
    </ActionModal>
  );
}

function CancelModal({ schoolId, po, onClose, onDone }: { schoolId: string; po: PurchaseOrder; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  return (
    <ActionModal
      title={`${t("poAction.cancel")} — ${po.number}`}
      color="red"
      onClose={onClose}
      testId="cancel-confirm"
      onConfirm={async () => {
        if (!reason.trim()) return setError(t("errors.required"));
        try {
          await api.purchasing!.cancel(schoolId, po.id, reason);
          await onDone();
          onClose();
        } catch (e) {
          notifyError(t, e);
        }
      }}
    >
      <Textarea label={t("po.cancelReason")} required autosize minRows={2} value={reason} onChange={(e) => { setReason(e.currentTarget.value); setError(undefined); }} error={error} data-testid="cancel-reason" />
    </ActionModal>
  );
}

function DeliveryModal({ schoolId, po, onClose, onDone }: { schoolId: string; po: PurchaseOrder; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const opId = useMemo(newOpId, []);
  const f = useForm<DeliveryInput>({
    resolver: zodResolver(deliverySchema),
    defaultValues: {
      receivedAt: today(),
      conformity: "CONFORM",
      conformityNotes: "",
      items: po.items.map((i) => ({ purchaseOrderItemId: i.id, quantityReceived: Math.max(0, i.quantity - i.accepted), quantityAccepted: Math.max(0, i.quantity - i.accepted) })),
      clientOpId: opId,
    },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      const r = await api.purchasing!.deliver(schoolId, po.id, v);
      notifications.show({ color: "green", message: t("po.delivered", { n: r.number }) });
      await onDone();
      onClose();
    } catch (e) {
      handleFormError(f, t, e);
    }
  });
  return (
    <Modal opened onClose={onClose} title={`${t("poAction.deliver")} — ${po.number}`} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="delivery-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput type="date" label={t("po.receivedAt")} required max={today()} {...f.register("receivedAt")} error={err("receivedAt")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <Controller control={f.control} name="conformity" render={({ field }) => <SegmentedControl fullWidth mt={24} value={field.value} onChange={field.onChange} data={(["CONFORM", "PARTIAL", "NON_CONFORM"] as const).map((c) => ({ value: c, label: t(`conformity.${c}`) }))} data-testid="delivery-conformity" />} />
            </Grid.Col>
          </Grid>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("po.itemDescription")}</Table.Th>
                <Table.Th>{t("po.remaining")}</Table.Th>
                <Table.Th>{t("po.received")}</Table.Th>
                <Table.Th>{t("po.accepted")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {po.items.map((i, k) => (
                <Table.Tr key={i.id}>
                  <Table.Td>{i.description}</Table.Td>
                  <Table.Td>{fmtQty(Math.max(0, i.quantity - i.accepted))}</Table.Td>
                  <Table.Td w={120}>
                    <Controller control={f.control} name={`items.${k}.quantityReceived`} render={({ field }) => <NumberInput size="xs" min={0} clampBehavior="none" value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err(`items.${k}.quantityReceived`)} aria-label={t("po.received")} data-testid={`recv-${k}`} />} />
                  </Table.Td>
                  <Table.Td w={120}>
                    <Controller control={f.control} name={`items.${k}.quantityAccepted`} render={({ field }) => <NumberInput size="xs" min={0} clampBehavior="none" value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err(`items.${k}.quantityAccepted`)} aria-label={t("po.accepted")} data-testid={`acc-${k}`} />} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {typeof f.formState.errors.items?.message === "string" && <Text c="red" size="sm">{t(f.formState.errors.items.message)}</Text>}
          <Textarea label={t("po.conformityNotes")} autosize minRows={2} {...f.register("conformityNotes")} error={err("conformityNotes")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="delivery-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function PostModal({ schoolId, po, line, onClose, onDone }: { schoolId: string; po: PurchaseOrder; line: { id: string; description: string; qty: number; poItemId?: string }; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const cat = useCatalog();
  const places = usePlaces();
  const item = po.items.find((i) => i.id === line.poItemId);
  const isStock = item?.targetKind === "STOCK";
  const whs = useQuery({ queryKey: ["warehouses", schoolId], queryFn: () => api.stock!.warehouses(schoolId), enabled: isStock && can("stock.view") });
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [mode, setMode] = useState<"INDIVIDUAL" | "QUANTITY">(Number.isInteger(line.qty) ? "INDIVIDUAL" : "QUANTITY");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [cost, setCost] = useState<number | "">(item?.estimatedUnitCost ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <ActionModal
      title={`${t("poAction.post")} — ${line.description}`}
      onClose={onClose}
      testId="post-confirm"
      onConfirm={async () => {
        try {
          const r = await api.purchasing!.post(schoolId, { deliveryItemId: line.id, warehouseId: warehouseId ?? "", categoryId: categoryId ?? "", trackingMode: isStock ? undefined : mode, roomId: roomId ?? "", unitCost: cost === "" ? null : cost });
          notifications.show({ color: "green", message: t(r.postedAs === "STOCK" ? "po.postedStock" : "po.postedAssets", { n: r.created.length, list: r.created.join("، ") }) });
          await onDone();
          onClose();
        } catch (e) {
          const fields = e instanceof ApiError ? (e.details as { fields?: Record<string, string> } | undefined)?.fields : undefined;
          if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, t(v)])));
          else notifyError(t, e);
        }
      }}
    >
      <Text size="sm">{t(isStock ? "po.postStockHint" : "po.postAssetsHint", { n: fmtQty(line.qty) })}</Text>
      {isStock ? (
        <Select label={t("stock.warehouse")} required data={(whs.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} value={warehouseId} onChange={setWarehouseId} error={errors.warehouseId} data-testid="post-warehouse" />
      ) : (
        <>
          <Select label={t("assets.category")} required searchable data={cat.categoryOptions} value={categoryId} onChange={setCategoryId} error={errors.categoryId} data-testid="post-category" />
          <SegmentedControl value={mode} onChange={(v) => setMode(v as "INDIVIDUAL" | "QUANTITY")} data={[{ value: "INDIVIDUAL", label: t("po.postIndividual", { n: fmtQty(line.qty) }) }, { value: "QUANTITY", label: t("po.postQuantity") }]} data-testid="post-mode" />
          <Select label={t("assets.room")} clearable searchable data={places.roomOptions} value={roomId} onChange={setRoomId} />
        </>
      )}
      <NumberInput label={`${t("po.unitCost")} (${t("unit.mad")})`} min={0} decimalScale={2} value={cost} onChange={(x) => setCost(x === "" ? "" : Number(x))} />
    </ActionModal>
  );
}

function InvoiceModal({ schoolId, po, onClose, onDone }: { schoolId: string; po: PurchaseOrder; onClose: () => void; onDone: () => unknown }) {
  const { t } = useI18n();
  const f = useForm<InvoiceInput>({ resolver: zodResolver(invoiceSchema), defaultValues: { invoiceNumber: "", invoiceDate: today(), amount: po.estimatedTotal ?? 0 } });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      await api.purchasing!.addInvoice(schoolId, po.id, v);
      await onDone();
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_INVOICE: "invoiceNumber" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={`${t("poAction.invoice")} — ${po.number}`} centered>
      <form onSubmit={submit} noValidate data-testid="invoice-form">
        <Stack>
          <Text size="sm">{t("po.supplier")}: {po.supplier}</Text>
          <TextInput label={t("mnt.invoiceNumber")} required {...f.register("invoiceNumber")} error={err("invoiceNumber")} data-testid="invoice-number" />
          <TextInput type="date" label={t("mnt.invoiceDate")} required {...f.register("invoiceDate")} error={err("invoiceDate")} />
          <Controller control={f.control} name="amount" render={({ field }) => <NumberInput label={`${t("mnt.amount")} (${t("unit.mad")})`} required min={0} decimalScale={2} value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("amount")} data-testid="invoice-amount" />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="invoice-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
