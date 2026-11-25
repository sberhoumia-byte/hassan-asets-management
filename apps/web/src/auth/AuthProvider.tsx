import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type School, type SessionUser } from "../api";

const SCHOOL_KEY = "hassan.activeSchool";

interface AuthCtx {
  user: SessionUser | null;
  loading: boolean;
  needsSetup: boolean;
  schools: School[];
  activeSchool: School | null;
  setActiveSchoolId: (id: string) => void;
  roleLabel: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

function readSchoolId() {
  try {
    return localStorage.getItem(SCHOOL_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const setupQ = useQuery({ queryKey: ["needsSetup"], queryFn: () => api.needsSetup() });
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api.me(), enabled: setupQ.data === false });
  const user = meQ.data ?? null;
  const schoolsQ = useQuery({ queryKey: ["schools", "mine"], queryFn: () => api.listSchools(), enabled: !!user });
  const [schoolId, setSchoolId] = useState<string | null>(readSchoolId);

  const schools = schoolsQ.data ?? [];
  const activeSchool = schools.find((s) => s.id === schoolId) ?? schools[0] ?? null;

  useEffect(() => {
    if (activeSchool && activeSchool.id !== schoolId) setSchoolId(activeSchool.id);
  }, [activeSchool, schoolId]);

  const setActiveSchoolId = useCallback((id: string) => {
    setSchoolId(id);
    try {
      localStorage.setItem(SCHOOL_KEY, id);
    } catch {
      /* غير متاح */
    }
  }, []);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries();
  }, [qc]);

  const logout = useCallback(async () => {
    await api.logout();
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => !["me", "needsSetup"].includes(String(q.queryKey[0])) });
  }, [qc]);

  const value = useMemo<AuthCtx>(() => {
    const role = user && activeSchool
      ? (user.roles.find((r) => r.schoolId === activeSchool.id) ?? user.roles.find((r) => r.role === "ADMIN"))?.role ?? null
      : null;
    return {
      user,
      loading: setupQ.isLoading || (setupQ.data === false && meQ.isLoading) || (!!user && schoolsQ.isLoading),
      needsSetup: setupQ.data === true,
      schools,
      activeSchool,
      setActiveSchoolId,
      roleLabel: role,
      refresh,
      logout,
    };
  }, [user, activeSchool, schools, setupQ.isLoading, setupQ.data, meQ.isLoading, schoolsQ.isLoading, setActiveSchoolId, refresh, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
