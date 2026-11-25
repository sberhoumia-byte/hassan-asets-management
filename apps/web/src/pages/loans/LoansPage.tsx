import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ActionIcon, Alert, Badge, Button, Card, Checkbox, Grid, Group, Loader, Modal, NumberInput, Pagination, SegmentedControl, Select, Stack, Table, Text, TextInput, Textarea, Title, Tooltip } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconArrowBackUp, IconPlus, IconReceipt, IconSearch } from "@tabler/icons-react";
import { loanReturnSchema, loanSchema, type LoanInput, type LoanReturnInput } from "@hassan/validation";
import { api, type Loan } from "../../api";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n";
import { usePlaces } from "../../hooks/usePlaces";
import { dayOf, fieldError, handleFormError, newOpId, today } from "../../lib/forms";

const PAGE_SIZE = 25;

/** حالة الإعارة مع التأخير: «متأخرة N يوم» تحل محل «جارية» عند تجاوز تاريخ الإرجاع. */
export function LoanStatusBadge({ loan }: { loan: Loan }) {
  const { t } = useI18n();
  if (loan.overdue)
    return (
      <Badge color="red" variant="filled" data-testid="loan-late">
        {t("loans.lateDays", { n: loan.lateDays })}
      </Badge>
    );
  const color = loan.status === "RETURNED" ? "gray" : loan.status === "PARTIALLY_RETURNED" ? "orange" : "blue";
  return (
    <Group gap={4} wrap="nowrap">
      <Badge color={color} variant="light" data-testid="loan-status">{t(`loanStatus.${loan.status}`)}</Badge>
      {loan.status === "RETURNED" && loan.lateDays > 0 && <Badge color="red" variant="outline" size="sm">{t("loans.returnedLate", { n: loan.lateDays })}</Badge>}
    </Group>
  );
}

/** الإعارة والإرجاع (المادة 10): لا تُعار وحدة معارة أو معطوبة، ولا كمية تتجاوز المتاح؛ الإرجاع الجزئي مسموح. */
export function LoansPage() {
  const { t } = useI18n();
  const { activeSchool, can } = useAuth();
  if (!api.loans) return <Alert color="yellow">{t("common.serverOnly")}</Alert>;
  if (!activeSchool || !can("loans.view")) return <Alert color="red">{t("errors.forbidden")}</Alert>;
  return <LoansScreen schoolId={activeSchool.id} />;
}

function LoansScreen({ schoolId }: { schoolId: string }) {
  const { t, fmtDate } = useI18n();
  const { can } = useAuth();
  const places = usePlaces();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const preset = params.get("resource");
  const [view, setView] = useState("open");
  const [q, setQ] = useState("");
  const [dq] = useDebouncedValue(q, 250);
  const [borrowerId, setBorrowerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(() => (!!preset || !!params.get("new")) && can("loans.create"));
  const [returning, setReturning] = useState<Loan | null>(null);
  const query = { status: view === "open" || view === "returned" ? view : undefined, overdue: view === "overdue", q: dq, borrowerId: borrowerId ?? undefined, page, pageSize: PAGE_SIZE };
  const list = useQuery({ queryKey: ["loans", schoolId, query], queryFn: () => api.loans!.list(schoolId, query) });
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const reload = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ["loans", schoolId] }), qc.invalidateQueries({ queryKey: ["resources", schoolId] }), qc.invalidateQueries({ queryKey: ["resource", schoolId] }), qc.invalidateQueries({ queryKey: ["staff", schoolId] })]);

  return (
    <>
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={4}>{t("nav.loans")}</Title>
            <Text size="sm" c="dimmed">{t("loans.intro")}</Text>
          </div>
          {can("loans.create") && (
            <Button leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} data-testid="new-loan">
              {t("loans.new")}
            </Button>
          )}
        </Group>
      </Card>
      <Card>
        <Group gap="sm" mb="md">
          <SegmentedControl
            value={view}
            onChange={(v) => {
              setView(v);
              setPage(1);
            }}
            data={[
              { value: "open", label: t("loans.view.open") },
              { value: "overdue", label: t("loans.view.overdue") },
              { value: "returned", label: t("loans.view.returned") },
              { value: "all", label: t("loans.view.all") },
            ]}
            data-testid="loans-view"
          />
          <TextInput className="min-w-[200px] flex-1" leftSection={<IconSearch size={16} />} placeholder={t("loans.searchPh")} aria-label={t("common.search")} value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} />
          <Select w={220} placeholder={t("loans.borrower")} clearable searchable data={places.staffOptions} value={borrowerId} onChange={(v) => { setBorrowerId(v); setPage(1); }} aria-label={t("loans.borrower")} />
        </Group>
        <Table.ScrollContainer minWidth={980}>
          <Table striped verticalSpacing="sm" data-testid="loans-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("loans.number")}</Table.Th>
                <Table.Th>{t("loans.resource")}</Table.Th>
                <Table.Th>{t("loans.borrower")}</Table.Th>
                <Table.Th>{t("loans.loanedAt")}</Table.Th>
                <Table.Th>{t("loans.dueAt")}</Table.Th>
                <Table.Th>{t("loans.outstanding")}</Table.Th>
                <Table.Th>{t("assets.status")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(list.data?.items ?? []).map((l) => (
                <Table.Tr key={l.id} data-testid={`loan-row-${l.number}`}>
                  <Table.Td dir="ltr" style={{ textAlign: "start" }} className="font-mono text-sm">{l.number}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{l.resource.name}</Text>
                    <Text size="xs" c="dimmed" dir="ltr" style={{ textAlign: "start" }}>{l.unit ?? `${l.resource.code} × ${l.quantity}`}</Text>
                  </Table.Td>
                  <Table.Td>{l.borrower}</Table.Td>
                  <Table.Td>{fmtDate(l.loanedAt)}</Table.Td>
                  <Table.Td>{fmtDate(dayOf(l.dueAt))}</Table.Td>
                  <Table.Td>{l.outstanding > 0 ? `${l.outstanding} / ${l.quantity}` : "—"}</Table.Td>
                  <Table.Td><LoanStatusBadge loan={l} /></Table.Td>
                  <Table.Td>
                    <Group gap={2} justify="flex-end" wrap="nowrap">
                      {l.outstanding > 0 && can("loans.update") && (
                        <Tooltip label={t("loans.return")}>
                          <ActionIcon variant="subtle" color="green" aria-label={t("loans.return")} onClick={() => setReturning(l)} data-testid={`return-${l.number}`}>
                            <IconArrowBackUp size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label={t("loans.receipt")}>
                        <ActionIcon variant="subtle" aria-label={t("loans.receipt")} onClick={() => nav(`/loans/${l.id}/receipt`)} data-testid={`receipt-${l.number}`}>
                          <IconReceipt size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {list.isLoading && <Loader size="sm" />}
        {list.data && list.data.items.length === 0 && <Text c="dimmed" ta="center" py="lg">{t("loans.empty")}</Text>}
        {list.data && (
          <Group justify="space-between" mt="sm">
            <Text size="sm" c="dimmed">{t("common.totalCount", { n: list.data.total })}</Text>
            {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
          </Group>
        )}
      </Card>
      {creating && (
        <LoanFormModal
          schoolId={schoolId}
          presetResourceId={preset ?? undefined}
          onClose={() => {
            setCreating(false);
            if (preset || params.get("new")) setParams({}, { replace: true });
          }}
          onSaved={async (id) => {
            await reload();
            nav(`/loans/${id}/receipt`);
          }}
        />
      )}
      {returning && <ReturnModal schoolId={schoolId} loan={returning} onClose={() => setReturning(null)} onSaved={reload} />}
    </>
  );
}

function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function LoanFormModal({ schoolId, presetResourceId, onClose, onSaved }: { schoolId: string; presetResourceId?: string; onClose: () => void; onSaved: (id: string) => unknown }) {
  const { t } = useI18n();
  const places = usePlaces();
  // معرّف العملية ثابت طوال عمر النموذج: إعادة الإرسال لا تنشئ إعارة ثانية
  const opId = useMemo(newOpId, []);
  const resources = useQuery({ queryKey: ["resources", schoolId, { lendable: true }], queryFn: () => api.resources!.list(schoolId, { lendable: true }) });
  const f = useForm<LoanInput>({
    resolver: zodResolver(loanSchema),
    defaultValues: { resourceId: presetResourceId ?? "", unitId: "", quantity: 1, borrowerStaffId: "", dueAt: plusDays(7), conditionOut: "", notes: "", clientOpId: opId },
  });
  const err = fieldError(f, t);
  const resourceId = f.watch("resourceId");
  const selected = resources.data?.find((r) => r.id === resourceId);
  const detail = useQuery({
    queryKey: ["resource", schoolId, resourceId],
    queryFn: () => api.resources!.get(schoolId, resourceId),
    enabled: !!resourceId && selected?.trackingMode === "INDIVIDUAL",
  });
  const units = (detail.data?.units ?? []).filter((u) => u.status === "AVAILABLE").map((u) => ({ value: u.id, label: u.serialNumber ? `${u.inventoryNumber} (${u.serialNumber})` : u.inventoryNumber }));

  const submit = f.handleSubmit(async (v) => {
    const body: LoanInput = { ...v, quantity: selected?.trackingMode === "INDIVIDUAL" ? 1 : v.quantity, unitId: selected?.trackingMode === "INDIVIDUAL" ? v.unitId : "" };
    if (selected?.trackingMode === "INDIVIDUAL" && !body.unitId) return f.setError("unitId", { message: "errors.required" });
    try {
      const r = await api.loans!.create(schoolId, body);
      await onSaved(r.id);
    } catch (e) {
      handleFormError(f, t, e, {
        RESOURCE_ALREADY_ON_LOAN: "unitId",
        RESOURCE_NOT_AVAILABLE: "unitId",
        QUANTITY_NOT_AVAILABLE: "quantity",
        RESOURCE_NOT_LENDABLE: "resourceId",
      });
      if (e && (e as { code?: string }).code && ["RESOURCE_ALREADY_ON_LOAN", "RESOURCE_NOT_AVAILABLE", "QUANTITY_NOT_AVAILABLE"].includes((e as { code: string }).code)) {
        void resources.refetch();
        void detail.refetch();
      }
    }
  });

  return (
    <Modal opened onClose={onClose} title={t("loans.new")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="loan-form">
        <Stack>
          <Controller
            control={f.control}
            name="resourceId"
            render={({ field }) => (
              <Select
                label={t("loans.resource")}
                required
                searchable
                data={(resources.data ?? []).map((r) => ({ value: r.id, label: `${r.code} — ${r.name} (${t("resources.availableN", { n: r.available })})`, disabled: r.available < 1 }))}
                value={field.value || null}
                onChange={(x) => {
                  field.onChange(x ?? "");
                  f.setValue("unitId", "");
                  f.setValue("quantity", 1);
                }}
                error={err("resourceId")}
                nothingFoundMessage={t("common.noResults")}
                data-testid="loan-resource"
              />
            )}
          />
          {selected?.trackingMode === "INDIVIDUAL" && (
            <Controller
              control={f.control}
              name="unitId"
              render={({ field }) => (
                <Select label={t("loans.unit")} description={t("loans.unitHint")} required searchable data={units} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("unitId")} nothingFoundMessage={t("loans.noUnits")} data-testid="loan-unit" />
              )}
            />
          )}
          {selected?.trackingMode === "QUANTITY" && (
            <Controller
              control={f.control}
              name="quantity"
              render={({ field }) => (
                <NumberInput label={t("assets.quantity")} description={t("resources.availableN", { n: selected.available })} required min={1} max={selected.available} clampBehavior="none" allowDecimal={false} value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("quantity")} data-testid="loan-qty" />
              )}
            />
          )}
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 7 }}>
              <Controller
                control={f.control}
                name="borrowerStaffId"
                render={({ field }) => (
                  <Select label={t("loans.borrower")} description={places.staff.length ? undefined : t("loans.noStaff")} required searchable data={places.staffOptions} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("borrowerStaffId")} data-testid="loan-borrower" />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 5 }}>
              <TextInput type="date" label={t("loans.dueAt")} required min={today()} {...f.register("dueAt")} error={err("dueAt")} data-testid="loan-due" />
            </Grid.Col>
          </Grid>
          <TextInput label={t("loans.conditionOut")} {...f.register("conditionOut")} error={err("conditionOut")} />
          <Textarea label={t("stock.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="loan-save">{t("loans.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ReturnModal({ schoolId, loan, onClose, onSaved }: { schoolId: string; loan: Loan; onClose: () => void; onSaved: () => unknown }) {
  const { t } = useI18n();
  const nav = useNavigate();
  const opId = useMemo(newOpId, []);
  const f = useForm<LoanReturnInput>({
    resolver: zodResolver(loanReturnSchema),
    defaultValues: { quantity: loan.outstanding, conditionIn: "", damaged: false, notes: "", clientOpId: opId },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      await api.loans!.returnLoan(schoolId, loan.id, v);
      await onSaved();
      onClose();
      nav(`/loans/${loan.id}/receipt`);
    } catch (e) {
      handleFormError(f, t, e, { RETURN_EXCEEDS: "quantity" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={`${t("loans.return")} — ${loan.number}`} centered>
      <form onSubmit={submit} noValidate data-testid="return-form">
        <Stack>
          <Text size="sm">
            {loan.resource.name}
            {loan.unit ? ` (${loan.unit})` : ""} — {loan.borrower}
          </Text>
          {loan.overdue && <Alert color="red" variant="light">{t("loans.lateDays", { n: loan.lateDays })}</Alert>}
          {loan.resource.trackingMode === "QUANTITY" && (
            <Controller
              control={f.control}
              name="quantity"
              render={({ field }) => (
                <NumberInput label={t("loans.returnQty")} description={t("loans.outstandingN", { n: loan.outstanding })} required min={1} max={loan.outstanding} clampBehavior="none" allowDecimal={false} value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("quantity")} data-testid="return-qty" />
              )}
            />
          )}
          <TextInput label={t("loans.conditionIn")} {...f.register("conditionIn")} error={err("conditionIn")} />
          <Controller
            control={f.control}
            name="damaged"
            render={({ field }) => (
              <Checkbox label={t(loan.resource.trackingMode === "QUANTITY" ? "loans.damagedQty" : "loans.damagedUnit")} checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} color="red" data-testid="return-damaged" />
            )}
          />
          <Textarea label={t("stock.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" color="green" loading={f.formState.isSubmitting} data-testid="return-save">{t("loans.confirmReturn")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
