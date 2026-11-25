import { useMemo, useState } from "react";
import { Alert, Button, Grid, Group, Modal, NumberInput, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { stockAdjustSchema, stockInSchema, stockOutSchema, stockReturnSchema, stockTransferSchema } from "@hassan/validation";
import { api, ApiError, type StockItem, type Warehouse } from "../../api";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, fmtQty, handleFormError, newOpId, today } from "../../lib/forms";

export type MovementKind = "in" | "out" | "return" | "transfer" | "adjust";

const SCHEMAS = { in: stockInSchema, out: stockOutSchema, return: stockReturnSchema, transfer: stockTransferSchema, adjust: stockAdjustSchema };

type Values = Record<string, any>;

/**
 * نموذج حركة مخزون واحد لكل الأنواع. الرصيد لا يُعدَّل مباشرة أبداً: كل عملية تُسجَّل حركةً
 * والخادم يرفض أي صرف يتجاوز الرصيد. معرّف العملية ثابت طوال فتح النموذج (إعادة الإرسال آمنة).
 */
export function MovementModal({
  schoolId,
  kind,
  items,
  warehouses,
  itemId,
  onClose,
}: {
  schoolId: string;
  kind: MovementKind;
  items: StockItem[];
  warehouses: Warehouse[];
  itemId?: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const cat = useCatalog();
  const qc = useQueryClient();
  const [opId] = useState(newOpId);
  const activeWh = warehouses.filter((w) => w.isActive);
  const defaults: Values = {
    itemId: itemId ?? "",
    warehouseId: activeWh.length === 1 ? activeWh[0]!.id : "",
    fromWarehouseId: "",
    toWarehouseId: "",
    occurredAt: today(),
    reason: "",
    supplierId: "",
    expiryDate: "",
    unitCost: null,
  };
  const f = useForm<Values>({ resolver: zodResolver(SCHEMAS[kind] as never), defaultValues: defaults });
  const err = fieldError(f, t);
  const selItem = items.find((i) => i.id === f.watch("itemId"));
  const whField = kind === "transfer" ? "fromWarehouseId" : "warehouseId";
  const selWh = f.watch(whField) as string;
  const available = selItem?.balances.find((b) => b.warehouseId === selWh)?.quantity ?? 0;
  const unit = selItem ? (selItem.unitAr ?? "") : "";

  const itemOptions = useMemo(
    () => items.filter((i) => i.isActive || kind === "return" || kind === "adjust").map((i) => ({ value: i.id, label: `${i.code} — ${i.name}` })),
    [items, kind],
  );
  const whOptions = activeWh.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }));

  const submit = f.handleSubmit(async (v) => {
    const body: Values = { ...v, clientOpId: opId };
    for (const k of ["occurredAt", "expiryDate", "supplierId"]) if (body[k] === "") delete body[k];
    try {
      const s = api.stock!;
      const r =
        kind === "in"
          ? await s.stockIn(schoolId, body as never)
          : kind === "out"
            ? await s.stockOut(schoolId, body as never)
            : kind === "return"
              ? await s.stockReturn(schoolId, body as never)
              : kind === "transfer"
                ? await s.transfer(schoolId, body as never)
                : await s.adjust(schoolId, body as never);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["stock-items", schoolId] }),
        qc.invalidateQueries({ queryKey: ["stock-movements", schoolId] }),
        qc.invalidateQueries({ queryKey: ["stock-alerts", schoolId] }),
      ]);
      notifications.show({ color: "green", message: t("stock.recorded", { numbers: r.movements.join("، ") }) });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === "STOCK_INSUFFICIENT") {
        const d = e.details as { available: number; requested: number };
        f.setError("quantity", { message: t("errors.stockInsufficient", { available: fmtQty(d.available), requested: fmtQty(d.requested), unit }) });
        return;
      }
      handleFormError(f, t, e);
    }
  });

  const sel = (name: Path<Values>, label: string, data: { value: string; label: string }[], opts: { required?: boolean; testid?: string } = {}) => (
    <Controller
      control={f.control}
      name={name}
      render={({ field }) => (
        <Select
          label={label}
          required={opts.required}
          searchable
          clearable={!opts.required}
          data={data}
          value={field.value || null}
          onChange={(x) => field.onChange(x ?? "")}
          error={err(name)}
          data-testid={opts.testid}
        />
      )}
    />
  );
  const num = (name: Path<Values>, label: string, opts: { scale?: number; testid?: string; required?: boolean; suffix?: string } = {}) => (
    <Controller
      control={f.control}
      name={name}
      render={({ field }) => (
        <NumberInput
          label={label}
          required={opts.required}
          min={0}
          decimalScale={opts.scale ?? 3}
          value={field.value ?? ""}
          onChange={(x) => field.onChange(x === "" ? undefined : Number(x))}
          rightSection={opts.suffix ? <Text size="xs" c="dimmed">{opts.suffix}</Text> : undefined}
          rightSectionWidth={opts.suffix ? 60 : undefined}
          error={err(name)}
          data-testid={opts.testid}
        />
      )}
    />
  );

  return (
    <Modal opened onClose={onClose} title={t(`stock.mv.${kind}`)} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="movement-form">
        <Stack>
          <Text size="sm" c="dimmed">{t(`stock.mvHint.${kind}`)}</Text>
          <Grid gutter="sm">
            <Grid.Col span={12}>{sel("itemId", t("stock.item"), itemOptions, { required: true, testid: "mv-item" })}</Grid.Col>
            {kind === "transfer" ? (
              <>
                <Grid.Col span={{ base: 12, sm: 6 }}>{sel("fromWarehouseId", t("stock.fromWarehouse"), whOptions, { required: true, testid: "mv-from" })}</Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>{sel("toWarehouseId", t("stock.toWarehouse"), whOptions, { required: true, testid: "mv-to" })}</Grid.Col>
              </>
            ) : (
              <Grid.Col span={12}>{sel("warehouseId", t("stock.warehouse"), whOptions, { required: true, testid: "mv-warehouse" })}</Grid.Col>
            )}
            {selItem && selWh && (
              <Grid.Col span={12}>
                <Alert color={available > 0 ? "blue" : "gray"} variant="light" py={6} data-testid="mv-available">
                  {t("stock.availableHere", { qty: fmtQty(available), unit })}
                </Alert>
              </Grid.Col>
            )}
            <Grid.Col span={{ base: 12, sm: 6 }}>
              {kind === "adjust"
                ? num("countedQuantity", t("stock.countedQuantity"), { required: true, testid: "mv-qty", suffix: unit })
                : num("quantity", t("stock.quantity"), { required: true, testid: "mv-qty", suffix: unit })}
            </Grid.Col>
            {kind !== "adjust" && (
              <Grid.Col span={{ base: 12, sm: 6 }}>
                <TextInput type="date" label={t("stock.date")} {...f.register("occurredAt")} error={err("occurredAt")} />
              </Grid.Col>
            )}
            {kind === "in" && (
              <>
                <Grid.Col span={{ base: 12, sm: 6 }}>{num("unitCost", t("stock.unitCost"), { scale: 2, suffix: t("unit.mad") })}</Grid.Col>
                <Grid.Col span={{ base: 12, sm: 6 }}>{sel("supplierId", t("assets.supplier"), cat.supplierOptions)}</Grid.Col>
                {selItem?.tracksExpiry && (
                  <Grid.Col span={{ base: 12, sm: 6 }}>
                    <TextInput type="date" label={t("stock.expiryDate")} {...f.register("expiryDate")} error={err("expiryDate")} />
                  </Grid.Col>
                )}
              </>
            )}
            <Grid.Col span={12}>
              <Textarea
                label={t(kind === "out" ? "stock.beneficiary" : "stock.reason")}
                required={kind === "out" || kind === "return" || kind === "adjust"}
                autosize
                minRows={2}
                {...f.register("reason")}
                error={err("reason")}
                data-testid="mv-reason"
              />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="mv-save">{t("stock.record")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
