import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const TABS = [
  { path: "/admin", label: "Overview", exact: true },
  { path: "/admin/users", label: "Users" },
  { path: "/admin/organizations", label: "Organizations" },
  { path: "/admin/crm", label: "CRM" },
  { path: "/admin/master-specs", label: "Master Specs" },
  { path: "/admin/tds-upload", label: "TDS Upload" },
  { path: "/admin/feature-flags", label: "Feature Flags" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { isSuperAdmin, loading } = useAuth();
  const pathname = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    if (!loading && !isSuperAdmin) navigate({ to: "/" });
  }, [loading, isSuperAdmin, navigate]);

  if (loading || !isSuperAdmin) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header
        className="sticky top-0 z-30 shrink-0"
        style={{ background: "var(--card)", borderBottom: "0.5px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-5" style={{ height: 52 }}>
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="w-4 h-4 text-[color:var(--accent-blue)]" />
            <span className="text-[13px] font-semibold tracking-wide">Traceium Admin Console</span>
            <span className="hidden sm:inline text-[11px] text-muted-foreground uppercase tracking-wider px-2 py-0.5 rounded border border-border">
              super admin
            </span>
          </div>
          <Link
            to="/engineer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Exit to platform
          </Link>
        </div>
        <nav className="flex items-center px-5 gap-1 overflow-x-auto" style={{ height: 40, borderTop: "0.5px solid var(--border)" }}>
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.path : pathname === t.path || pathname.startsWith(t.path + "/");
            return (
              <Link
                key={t.path}
                to={t.path}
                preload="render"
                className="relative inline-flex items-center h-[40px] px-3 text-[12px] transition-colors whitespace-nowrap"
                style={{
                  color: active ? "var(--foreground)" : "color-mix(in srgb, var(--foreground) 50%, transparent)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {t.label}
                {active && (
                  <span
                    className="absolute left-3 right-3 bottom-0 h-[2px] rounded-t"
                    style={{ background: "var(--accent-blue)" }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
