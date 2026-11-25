import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";

/** التصنيفات والقوائم المرجعية والموردون للمؤسسة النشطة، مع خيارات جاهزة لقوائم الاختيار. */
export function useCatalog(opts: { includeInactive?: boolean } = {}) {
  const { activeSchool, can } = useAuth();
  const { locale } = useI18n();
  const sid = activeSchool?.id ?? "";
  const all = !!opts.includeInactive;
  const categories = useQuery({ queryKey: ["categories", sid], queryFn: () => api.catalog!.categories(sid), enabled: !!sid && !!api.catalog });
  const lookups = useQuery({ queryKey: ["lookups", sid, all], queryFn: () => api.catalog!.lookups(sid, undefined, all), enabled: !!sid && !!api.catalog });
  const suppliers = useQuery({
    queryKey: ["suppliers", sid, "active"],
    queryFn: () => api.suppliers!.list(sid),
    enabled: !!sid && !!api.suppliers && can("suppliers.view"),
  });

  return useMemo(() => {
    const label = (o: { labelAr: string; labelFr?: string }) => (locale === "fr" && o.labelFr ? o.labelFr : o.labelAr);
    const catName = (o: { nameAr: string; nameFr?: string | null }) => (locale === "fr" && o.nameFr ? o.nameFr : o.nameAr);
    const cats = categories.data ?? [];
    const catById = new Map(cats.map((c) => [c.id, c]));
    const lookupById = new Map((lookups.data ?? []).map((l) => [l.id, l]));
    return {
      sid,
      loading: categories.isLoading || lookups.isLoading,
      categories: cats,
      catName,
      label,
      categoryLabel: (id?: string) => {
        const c = id ? catById.get(id) : undefined;
        return c ? `${c.code} — ${catName(c)}` : "";
      },
      categoryOptions: cats.filter((c) => c.isActive).map((c) => ({ value: c.id, label: `${c.code} — ${catName(c)}` })),
      lookups: lookups.data ?? [],
      lookupLabel: (id?: string) => {
        const l = id ? lookupById.get(id) : undefined;
        return l ? label(l) : "";
      },
      lookupOptions: (listKey: string) =>
        (lookups.data ?? []).filter((l) => l.listKey === listKey && l.isActive).map((l) => ({ value: l.id, label: label(l) })),
      suppliers: suppliers.data ?? [],
      supplierOptions: (suppliers.data ?? []).map((x) => ({ value: x.id, label: x.name })),
    };
  }, [sid, categories.data, categories.isLoading, lookups.data, lookups.isLoading, suppliers.data, locale]);
}
