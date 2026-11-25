import { useEffect, useState } from "react";
import { Select } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { api, type Asset } from "../api";
import { useI18n } from "../i18n";

/** اختيار ممتلك بالبحث في الخادم (رقم الجرد أو الاسم)؛ يعيد الممتلك كاملاً لمن يحتاج مسؤوله أو فضاءه. */
export function AssetPicker({
  schoolId,
  value,
  onChange,
  label,
  error,
  required,
  testId,
}: {
  schoolId: string;
  value: string;
  onChange: (id: string, asset?: Asset) => void;
  label: string;
  error?: string;
  required?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [dq] = useDebouncedValue(search, 250);
  const [picked, setPicked] = useState<Asset | undefined>();
  const list = useQuery({ queryKey: ["assets", schoolId, { q: dq, pageSize: 20, picker: true }], queryFn: () => api.assets!.list(schoolId, { q: dq, pageSize: 20 }) });
  // قيمة مسبقة (من رابط) غير ظاهرة في نتائج البحث: نجلبها لعرض اسمها
  const preset = useQuery({ queryKey: ["asset", schoolId, value], queryFn: () => api.assets!.get(schoolId, value), enabled: !!value && !picked && !(list.data?.items ?? []).some((a) => a.id === value) });
  useEffect(() => {
    if (preset.data && !picked) {
      setPicked(preset.data);
      onChange(preset.data.id, preset.data);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.data]);
  const items = list.data?.items ?? [];
  const all = picked && !items.some((a) => a.id === picked.id) ? [picked, ...items] : items;
  return (
    <Select
      label={label}
      required={required}
      searchable
      clearable
      data={all.map((a) => ({ value: a.id, label: `${a.inventoryNumber} — ${a.name}` }))}
      value={value || null}
      onChange={(id) => {
        const a = all.find((x) => x.id === id);
        setPicked(a);
        onChange(id ?? "", a);
      }}
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options }) => options}
      nothingFoundMessage={t("common.noResults")}
      error={error}
      data-testid={testId}
    />
  );
}
