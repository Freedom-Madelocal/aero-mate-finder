import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useIdleTimer } from "@/hooks/useIdleTimer";
import { useSessionSentinel } from "@/hooks/useSessionSentinel";
import { IdleWarningDialog } from "@/components/IdleWarningDialog";


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

  // Refresh session when tab becomes visible after being hidden a while,
  // so avatars / signed URLs / tokens don't go stale in background tabs.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (document.visibilityState === "visible") {
        if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) {
          supabase.auth.refreshSession();
        }
        hiddenAt = null;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const isSuperAdmin = roles.includes("super_admin");
  const isDemoExpired =
    !!demo &&
    demo.demo_mode &&
    !!demo.first_login_at &&
    Date.now() - new Date(demo.first_login_at).getTime() > 48 * 60 * 60 * 1000 &&
    !isSuperAdmin;

  const router = useRouter();
  const queryClient = useQueryClient();
  const forcingRef = useRef(false);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const forceSignOut = useCallback(
    async (reason?: string) => {
      if (forcingRef.current) return;
      forcingRef.current = true;
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("[auth] forceSignOut error", err);
      } finally {
        if (reason) toast.error(reason);
        try {
          await router.navigate({ to: "/login", replace: true });
        } catch {
          if (typeof window !== "undefined") window.location.assign("/login");
        }
        // Allow re-entry on the next real session.
        setTimeout(() => {
          forcingRef.current = false;
        }, 1000);
      }
    },
    [queryClient, router],
  );

  useSessionSentinel(session, () =>
    forceSignOut("Your session expired. Please sign in again."),
  );

  const idle = useIdleTimer(!!session, () => {
    void forceSignOut("You were signed out due to inactivity.");
  });

  const handleStay = useCallback(() => {
    idle.stayActive();
    void supabase.auth.refreshSession();
  }, [idle]);


  const value = useMemo<AuthCtx>(
    () => ({
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
      signOut,
      refresh,
    }),
    [session, profile, roles, demo, loading, isSuperAdmin, isDemoExpired, signOut, refresh],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <IdleWarningDialog
        open={idle.showWarning}
        secondsLeft={idle.secondsLeft}
        onStay={handleStay}
        onSignOut={() => void forceSignOut()}
      />
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function landingForRoles(roles: AppRole[]): "/engineer" | "/procurement" {
  // Procurement-only users land on /procurement; everyone else on /engineer.
  if (roles.includes("procurement") && !roles.some((r) => r !== "procurement")) {
    return "/procurement";
  }
  return "/engineer";
}
