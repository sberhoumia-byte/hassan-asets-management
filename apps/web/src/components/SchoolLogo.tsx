import { useQuery } from "@tanstack/react-query";
import { IconBuildingBank } from "@tabler/icons-react";
import { api } from "../api";
import { useAuth } from "../auth/AuthProvider";

/** شعار المؤسسة النشطة من إعدادات الهوية البصرية المركزية. */
export function SchoolLogo({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  const { activeSchool } = useAuth();
  const q = useQuery({
    queryKey: ["branding", activeSchool?.id],
    queryFn: () => api.getBranding(activeSchool!.id),
    enabled: !!activeSchool,
  });
  const logo = q.data?.logoDataUrl;
  return (
    <div
      className="grid place-items-center rounded-xl overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: logo ? "#fff" : dark ? "rgba(255,255,255,.12)" : "#eaf1fa",
      }}
      data-testid="school-logo"
    >
      {logo ? (
        <img src={logo} alt="" className="w-full h-full object-contain" />
      ) : (
        <IconBuildingBank size={size * 0.55} color={dark ? "#cfe0f5" : "#1d5fa8"} stroke={1.5} />
      )}
    </div>
  );
}
