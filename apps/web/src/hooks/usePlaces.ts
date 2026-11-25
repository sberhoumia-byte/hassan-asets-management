import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { useI18n } from "../i18n";

/** الحجرات والبنايات والملاعب والموظفون النشطون للمؤسسة النشطة، مع خيارات جاهزة لقوائم الاختيار. */
export function usePlaces() {
  const { activeSchool } = useAuth();
  const { locale } = useI18n();
  const sid = activeSchool?.id ?? "";
  const on = !!sid && !!api.spaces;
  const buildings = useQuery({ queryKey: ["buildings", sid, false], queryFn: () => api.spaces!.buildings(sid), enabled: on });
  const rooms = useQuery({ queryKey: ["rooms", sid, {}], queryFn: () => api.spaces!.rooms(sid), enabled: on });
  const facilities = useQuery({ queryKey: ["facilities", sid, false], queryFn: () => api.spaces!.facilities(sid), enabled: on });
  const staff = useQuery({ queryKey: ["staff", sid, false, ""], queryFn: () => api.staff!.list(sid), enabled: !!sid && !!api.staff });

  return useMemo(() => {
    const staffName = (s: { fullNameAr: string; fullNameFr?: string }) => (locale === "fr" && s.fullNameFr ? s.fullNameFr : s.fullNameAr);
    return {
      buildings: buildings.data ?? [],
      rooms: rooms.data ?? [],
      facilities: facilities.data ?? [],
      staff: staff.data ?? [],
      staffName,
      buildingOptions: (buildings.data ?? []).map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` })),
      roomOptions: (rooms.data ?? []).map((r) => ({ value: r.id, label: r.building ? `${r.code} — ${r.name} (${r.building})` : `${r.code} — ${r.name}` })),
      facilityOptions: (facilities.data ?? []).map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` })),
      staffOptions: (staff.data ?? []).map((s) => ({ value: s.id, label: s.staffNumber ? `${staffName(s)} (${s.staffNumber})` : staffName(s) })),
    };
  }, [buildings.data, rooms.data, facilities.data, staff.data, locale]);
}

/** يضيف خياراً غير موجود في القائمة (عنصر مؤرشف ما زال مرتبطاً) حتى يبقى ظاهراً في الاختيار. */
export function withCurrent(options: { value: string; label: string }[], id?: string, label?: string) {
  if (!id || options.some((o) => o.value === id)) return options;
  return [...options, { value: id, label: label ?? id }];
}
