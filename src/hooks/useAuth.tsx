import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "org_admin" | "engineer" | "procurement" | "dev" | "integrator";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string | null;
  avatar_url: string | null;
  tour_completed_at: string | null;
}

export interface DemoSettings {
  user_id: string;
  demo_mode: boolean;
  first_login_at: string | null;
  extension_requested_at: string | null;
}

interface AuthCtx {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  demo: DemoSettings | null;
  loading: boolean;
  isAuthenticated: boolean;
  hasRole: (r: AppRole) => boolean;
  isSuperAdmin: boolean;
  isDemoExpired: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [demo, setDemo] = useState<DemoSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedUserIdRef = useRef<string | null>(null);
  const loadingUserIdRef = useRef<string | null>(null);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);

  const loadUserData = useCallback(async (uid: string, force = false) => {
    if (!force && loadedUserIdRef.current === uid) return;
    if (!force && loadingUserIdRef.current === uid && loadingPromiseRef.current) {
      return loadingPromiseRef.current;
    }
    loadingUserIdRef.current = uid;
    loadingPromiseRef.current = (async () => {
      const [{ data: prof }, { data: rolesData }, { data: demoData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("user_demo_settings").select("*").eq("user_id", uid).maybeSingle(),
      ]);
      setProfile((prof as Profile) ?? null);
      setRoles((rolesData ?? []).map((r: { role: AppRole }) => r.role));
      setDemo((demoData as DemoSettings) ?? null);
      loadedUserIdRef.current = uid;
    })();
    try {
      await loadingPromiseRef.current;
    } finally {
      loadingUserIdRef.current = null;
      loadingPromiseRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (session?.user) await loadUserData(session.user.id, true);
  }, [session, loadUserData]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadUserData(s.user.id), 0);
        if (_e === "SIGNED_IN") {
          import("@/lib/userActivity").then((m) => m.logLogin(s.user.id));
        }
      } else {
        loadedUserIdRef.current = null;
        loadingUserIdRef.current = null;
        setProfile(null);
        setRoles([]);
        setDemo(null);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadUserData(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

  const isSuperAdmin = roles.includes("super_admin");
  const isDemoExpired =
    !!demo &&
    demo.demo_mode &&
    !!demo.first_login_at &&
    Date.now() - new Date(demo.first_login_at).getTime() > 48 * 60 * 60 * 1000 &&
    !isSuperAdmin;

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    profile,
    roles,
    demo,
    loading,
    isAuthenticated: !!session,
    hasRole: (r) => roles.includes(r),
    isSuperAdmin,
    isDemoExpired,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function landingForRoles(roles: AppRole[]): "/dashboard" | "/engineer" | "/procurement" {
  if (roles.includes("super_admin") || roles.includes("org_admin") || roles.includes("dev") || roles.includes("integrator"))
    return "/dashboard";
  if (roles.includes("engineer")) return "/engineer";
  if (roles.includes("procurement")) return "/procurement";
  return "/dashboard";
}
