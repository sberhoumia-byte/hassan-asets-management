import { Button, Grid, Group, Modal, NumberInput, Select, Stack, Switch, TextInput, Textarea } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { stockItemSchema, warehouseSchema, type StockItemInput, type WarehouseInput } from "@hassan/validation";
import { api, type StockItem, type Warehouse } from "../../api";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, handleFormError } from "../../lib/forms";

export function ItemFormModal({ schoolId, item, onClose }: { schoolId: string; item?: StockItem; onClose: () => void }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const qc = useQueryClient();
  const f = useForm<StockItemInput>({
    resolver: zodResolver(stockItemSchema),
    defaultValues: item
      ? {
          code: item.code,
          name: item.name,
          categoryId: item.categoryId ?? "",
          unitId: item.unitId,
          minQuantity: item.minQuantity,
          tracksExpiry: item.tracksExpiry,
          defaultSupplierId: item.defaultSupplierId ?? "",
          notes: item.notes ?? "",
          isActive: item.isActive,
        }
      : { code: "", name: "", unitId: "", minQuantity: 0, tracksExpiry: false, isActive: true },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (item) await api.stock!.updateItem(schoolId, item.id, v);
      else await api.stock!.createItem(schoolId, v);
      await qc.invalidateQueries({ queryKey: ["stock-items", schoolId] });
      await qc.invalidateQueries({ queryKey: ["stock-alerts", schoolId] });
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code", UNIT_LOCKED: "unitId" });
    }
  });
  const sel = (name: "categoryId" | "unitId" | "defaultSupplierId", label: string, data: { value: string; label: string }[], required = false) => (
    <Controller
      control={f.control}
      name={name}
      render={({ field }) => (
        <Select label={label} required={required} clearable={!required} searchable data={data} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err(name)} data-testid={`item-${name}`} />
      )}
    />
  );
  return (
    <Modal opened onClose={onClose} title={item ? t("stock.editItem") : t("stock.addItem")} size="lg" centered>
      <form onSubmit={submit} noValidate data-testid="item-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput label={t("stock.code")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={t("stock.itemName")} required {...f.register("name")} error={err("name")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>{sel("unitId", t("stock.unit"), cat.lookupOptions("UNIT_OF_MEASURE"), true)}</Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="minQuantity"
                render={({ field }) => (
                  <NumberInput label={t("stock.minQuantity")} description={t("stock.minHint")} min={0} decimalScale={3} value={field.value} onChange={(x) => field.onChange(x === "" ? 0 : Number(x))} error={err("minQuantity")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>{sel("categoryId", t("assets.category"), cat.categoryOptions)}</Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>{sel("defaultSupplierId", t("stock.defaultSupplier"), cat.supplierOptions)}</Grid.Col>
            <Grid.Col span={12}>
              <Textarea label={t("stock.notes")} autosize minRows={2} {...f.register("notes")} error={err("notes")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller control={f.control} name="tracksExpiry" render={({ field }) => <Switch label={t("stock.tracksExpiry")} checked={field.value} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller control={f.control} name="isActive" render={({ field }) => <Switch label={t("common.active")} checked={field.value ?? true} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="item-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function WarehouseFormModal({ schoolId, warehouse, onClose }: { schoolId: string; warehouse?: Warehouse; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const f = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: warehouse ? { code: warehouse.code, name: warehouse.name, isActive: warehouse.isActive } : { code: "", name: "", isActive: true },
  });
  const err = fieldError(f, t);
  const submit = f.handleSubmit(async (v) => {
    try {
      if (warehouse) await api.stock!.updateWarehouse(schoolId, warehouse.id, v);
      else await api.stock!.createWarehouse(schoolId, v);
      await qc.invalidateQueries({ queryKey: ["warehouses", schoolId] });
      onClose();
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_CODE: "code" });
    }
  });
  return (
    <Modal opened onClose={onClose} title={warehouse ? t("stock.editWarehouse") : t("stock.addWarehouse")} centered>
      <form onSubmit={submit} noValidate data-testid="warehouse-form">
        <Stack>
          <TextInput label={t("stock.code")} required dir="ltr" {...f.register("code")} error={err("code")} data-autofocus />
          <TextInput label={t("stock.warehouseName")} required {...f.register("name")} error={err("name")} />
          <Controller control={f.control} name="isActive" render={({ field }) => <Switch label={t("common.active")} checked={field.value ?? true} onChange={(e) => field.onChange(e.currentTarget.checked)} />} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="warehouse-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
