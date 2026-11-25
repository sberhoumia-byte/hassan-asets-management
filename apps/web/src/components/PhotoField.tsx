import { useState } from "react";
import { Button, FileButton, Group, Image, Stack, Text } from "@mantine/core";
import { IconPhoto, IconTrash } from "@tabler/icons-react";
import { LOGO_MAX_BYTES } from "@hassan/validation";
import { useI18n } from "../i18n";
import { readImage } from "../lib/files";

const PHOTO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * حقل صورة مع معاينة (الممتلكات والوسائل التعليمية).
 * value: undefined = الصورة الحالية دون تغيير، null = حذفها، نص = صورة جديدة.
 */
export function PhotoField({ current, value, onChange }: { current?: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const shown = value === undefined ? current : value;
  const pick = async (file: File | null) => {
    if (!file) return;
    const r = await readImage(file, PHOTO_TYPES, LOGO_MAX_BYTES);
    if (!r.ok) return setError(t(r.error === "size" ? "errors.fileTooLarge" : "errors.fileType"));
    setError(null);
    onChange(r.dataUrl);
  };
  return (
    <>
      <Text size="sm" fw={500} mb={4}>{t("assets.photo")}</Text>
      <Group align="center">
        {shown ? (
          <Image src={shown} alt={t("assets.photo")} h={90} w={120} fit="contain" radius="sm" className="border border-gray-200" />
        ) : (
          <div className="flex h-[90px] w-[120px] items-center justify-center rounded border border-dashed border-gray-300 text-gray-400">
            <IconPhoto size={28} />
          </div>
        )}
        <Stack gap={4}>
          <FileButton onChange={pick} accept={PHOTO_TYPES.join(",")}>
            {(props) => (
              <Button size="xs" variant="light" {...props}>
                {shown ? t("assets.changePhoto") : t("assets.addPhoto")}
              </Button>
            )}
          </FileButton>
          {shown && (
            <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={() => onChange(null)}>
              {t("assets.removePhoto")}
            </Button>
          )}
          <Text size="xs" c={error ? "red" : "dimmed"}>{error ?? t("assets.photoHint")}</Text>
        </Stack>
      </Group>
    </>
  );
}
