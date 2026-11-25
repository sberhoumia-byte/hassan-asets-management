import { useState } from "react";
import { Button, FileButton, Grid, Group, Image, Modal, NumberInput, SegmentedControl, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconPhoto, IconTrash } from "@tabler/icons-react";
import { assetSchema, LOGO_MAX_BYTES, type AssetInput } from "@hassan/validation";
import { api, type Asset } from "../../api";
import { useI18n } from "../../i18n";
import { useCatalog } from "../../hooks/useCatalog";
import { fieldError, handleFormError } from "../../lib/forms";
import { readImage } from "../../lib/files";

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** نموذج إضافة/تعديل ممتلك. رقم الجرد فارغ = يُولَّد حسب صيغة المؤسسة. */
export function AssetFormModal({ schoolId, asset, onClose, onSaved }: { schoolId: string; asset?: Asset; onClose: () => void; onSaved: (a: Asset) => void }) {
  const { t } = useI18n();
  const cat = useCatalog();
  const qc = useQueryClient();
  // undefined = الصورة الحالية دون تغيير، null = حذفها، نص = صورة جديدة
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const f = useForm<AssetInput>({
    resolver: zodResolver(assetSchema),
    defaultValues: asset
      ? {
          name: asset.name,
          inventoryNumber: asset.inventoryNumber,
          categoryId: asset.categoryId,
          assetTypeId: asset.assetTypeId ?? "",
          description: asset.description ?? "",
          trackingMode: asset.trackingMode,
          quantity: asset.quantity,
          serialNumber: asset.serialNumber ?? "",
          acquisitionDate: asset.acquisitionDate ?? "",
          fundingSourceId: asset.fundingSourceId ?? "",
          acquisitionValue: asset.acquisitionValue ?? null,
          supplierId: asset.supplierId ?? "",
          status: asset.status === "DISPOSED" ? "AVAILABLE" : asset.status,
        }
      : { trackingMode: "INDIVIDUAL", quantity: 1, status: "AVAILABLE", inventoryNumber: "", acquisitionValue: null },
  });
  const err = fieldError(f, t);
  const mode = f.watch("trackingMode");
  const shownPhoto = photo === undefined ? asset?.photoDataUrl : photo;

  // مورد مؤرشف مرتبط بالممتلك يبقى ظاهراً في الاختيار
  const supplierOptions = [...cat.supplierOptions];
  if (asset?.supplier && !supplierOptions.some((o) => o.value === asset.supplier!.id)) supplierOptions.push({ value: asset.supplier.id, label: asset.supplier.name });

  const pickPhoto = async (file: File | null) => {
    if (!file) return;
    const r = await readImage(file, PHOTO_TYPES, LOGO_MAX_BYTES);
    if (!r.ok) return setPhotoError(t(r.error === "size" ? "errors.fileTooLarge" : "errors.fileType"));
    setPhotoError(null);
    setPhoto(r.dataUrl);
  };

  const submit = f.handleSubmit(async (v) => {
    const body: AssetInput = { ...v, quantity: v.trackingMode === "INDIVIDUAL" ? 1 : v.quantity, photoDataUrl: photo };
    try {
      const saved = asset ? await api.assets!.update(schoolId, asset.id, body) : await api.assets!.create(schoolId, body);
      await qc.invalidateQueries({ queryKey: ["assets", schoolId] });
      await qc.invalidateQueries({ queryKey: ["asset", schoolId, saved.id] });
      onSaved(saved);
    } catch (e) {
      handleFormError(f, t, e, { DUPLICATE_INVENTORY_NUMBER: "inventoryNumber" });
    }
  });

  return (
    <Modal opened onClose={onClose} title={asset ? t("assets.edit") : t("assets.add")} size="xl" centered>
      <form onSubmit={submit} noValidate data-testid="asset-form">
        <Stack>
          <Grid gutter="sm">
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput label={t("assets.name")} required {...f.register("name")} error={err("name")} data-autofocus />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <TextInput
                label={t("assets.inventoryNumber")}
                description={asset ? undefined : t("assets.autoNumberHint")}
                dir="ltr"
                {...f.register("inventoryNumber")}
                error={err("inventoryNumber")}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="categoryId"
                render={({ field }) => (
                  <Select label={t("assets.category")} required searchable data={cat.categoryOptions} value={field.value ?? null} onChange={(x) => field.onChange(x ?? "")} error={err("categoryId")} data-testid="asset-category" />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Controller
                control={f.control}
                name="assetTypeId"
                render={({ field }) => (
                  <Select label={t("assets.type")} clearable searchable data={cat.lookupOptions("ASSET_TYPE")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("assetTypeId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Text size="sm" fw={500} mb={4}>{t("assets.trackingMode")}</Text>
              <Controller
                control={f.control}
                name="trackingMode"
                render={({ field }) => (
                  <SegmentedControl
                    fullWidth
                    value={field.value}
                    onChange={(x) => {
                      field.onChange(x);
                      if (x === "INDIVIDUAL") f.setValue("quantity", 1);
                    }}
                    data={[
                      { value: "INDIVIDUAL", label: t("assets.mode.INDIVIDUAL") },
                      { value: "QUANTITY", label: t("assets.mode.QUANTITY") },
                    ]}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Controller
                control={f.control}
                name="quantity"
                render={({ field }) => (
                  <NumberInput label={t("assets.quantity")} min={1} allowDecimal={false} disabled={mode === "INDIVIDUAL"} value={field.value} onChange={(x) => field.onChange(typeof x === "number" ? x : Number(x) || 0)} error={err("quantity")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 3 }}>
              <Controller
                control={f.control}
                name="status"
                render={({ field }) => (
                  <Select
                    label={t("assets.status")}
                    data={(["AVAILABLE", "DAMAGED", "UNDER_REPAIR"] as const).map((s) => ({ value: s, label: t(`assetStatus.${s}`) }))}
                    value={field.value}
                    onChange={(x) => x && field.onChange(x)}
                    allowDeselect={false}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput label={t("assets.serialNumber")} dir="ltr" {...f.register("serialNumber")} error={err("serialNumber")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6 }}>
              <TextInput type="date" label={t("assets.acquisitionDate")} {...f.register("acquisitionDate")} error={err("acquisitionDate")} />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={f.control}
                name="fundingSourceId"
                render={({ field }) => (
                  <Select label={t("assets.fundingSource")} clearable data={cat.lookupOptions("FUNDING_SOURCE")} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("fundingSourceId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={f.control}
                name="acquisitionValue"
                render={({ field }) => (
                  <NumberInput
                    label={t("assets.value")}
                    rightSection={<Text size="xs" c="dimmed">{t("unit.mad")}</Text>}
                    min={0}
                    decimalScale={2}
                    value={field.value ?? ""}
                    onChange={(x) => field.onChange(x === "" ? null : Number(x))}
                    error={err("acquisitionValue")}
                  />
                )}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Controller
                control={f.control}
                name="supplierId"
                render={({ field }) => (
                  <Select label={t("assets.supplier")} clearable searchable data={supplierOptions} value={field.value || null} onChange={(x) => field.onChange(x ?? "")} error={err("supplierId")} />
                )}
              />
            </Grid.Col>
            <Grid.Col span={12}>
              <Textarea label={t("assets.description")} autosize minRows={2} {...f.register("description")} error={err("description")} />
            </Grid.Col>
            <Grid.Col span={12}>
              <Text size="sm" fw={500} mb={4}>{t("assets.photo")}</Text>
              <Group align="center">
                {shownPhoto ? (
                  <Image src={shownPhoto} alt={t("assets.photo")} h={90} w={120} fit="contain" radius="sm" className="border border-gray-200" />
                ) : (
                  <div className="flex h-[90px] w-[120px] items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
                    <IconPhoto size={28} />
                  </div>
                )}
                <Stack gap={4}>
                  <FileButton onChange={pickPhoto} accept={PHOTO_TYPES.join(",")}>
                    {(props) => (
                      <Button size="xs" variant="light" {...props}>
                        {shownPhoto ? t("assets.changePhoto") : t("assets.addPhoto")}
                      </Button>
                    )}
                  </FileButton>
                  {shownPhoto && (
                    <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => setPhoto(null)}>
                      {t("assets.removePhoto")}
                    </Button>
                  )}
                  <Text size="xs" c={photoError ? "red" : "dimmed"}>{photoError ?? t("assets.photoHint")}</Text>
                </Stack>
              </Group>
            </Grid.Col>
          </Grid>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" loading={f.formState.isSubmitting} data-testid="asset-save">{t("common.save")}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
