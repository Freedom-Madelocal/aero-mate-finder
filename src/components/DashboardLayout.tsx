import { Link, useLocation } from "@tanstack/react-router";
import { Settings, Menu, Search as SearchIcon, ShieldCheck, Cog } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { logPageView } from "@/lib/userActivity";
import traceumIcon from "@/assets/traceium-icon.webp";
import traceumWordmark from "@/assets/traceium-wordmark.webp";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgPresence, type OnlineMember } from "@/hooks/useOrgPresence";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { preloadMasterSpecStore, useMasterSpecStore } from "@/data/masterSpecs";
import { preloadMaterialStore } from "@/data/materials";
import { preloadProcurementStore } from "@/data/procurement";
import { useCompare } from "@/contexts/CompareContext";
import { useFeatureFlags } from "@/data/featureFlags";

// Non-critical UI: only needed after the shell paints, on user interaction,
// or once auth state settles. Lazy-loading keeps them out of the initial bundle.
const ProfileDrawer = lazy(() => import("@/components/ProfileDrawer"));
const MessageDialog = lazy(() => import("@/components/MessageDialog"));
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
const GuidedTour = lazy(() => import("@/components/GuidedTour"));

type NavItem = { path: string; label: string };

const baseNavItems: NavItem[] = [
  { path: "/engineer", label: "Find Materials" },
  { path: "/crossover", label: "Crossover" },
  { path: "/compare", label: "Compare" },
  { path: "/learn", label: "Learn" },
  { path: "/inventory", label: "Inventory" },
  { path: "/procurement", label: "Procurement" },
];

let hasPreloadedWorkspace = false;

function NavTab({
  item,
  active,
  countSuffix,
  highlight,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  countSuffix?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  const color = highlight
    ? "var(--accent-blue)"
    : active
      ? "var(--foreground)"
      : "color-mix(in srgb, var(--foreground) 45%, transparent)";
  return (
    <Link
      to={item.path}
      onClick={onClick}
      preload="render"
      className="relative inline-flex items-center h-[52px] px-3 text-[13px] transition-colors"
      style={{
        color,
        fontWeight: active || highlight ? 600 : 400,
      }}
    >
      <span>{item.label}{countSuffix}</span>
      {active && (
        <span
          className="absolute left-3 right-3 bottom-0 h-[2px] rounded-t"
          style={{ background: "var(--accent-blue)" }}
        />
      )}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation({ select: (l) => l.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [msgRecipient, setMsgRecipient] = useState<OnlineMember | null>(null);
  const onlineMembers = useOrgPresence();
  const unreadSenders = useUnreadMessages();
  const { specs } = useMasterSpecStore();
  const { count: compareCount } = useCompare();

  useEffect(() => {
    if (hasPreloadedWorkspace) return;
    hasPreloadedWorkspace = true;
    void Promise.allSettled([
      preloadMasterSpecStore(),
      preloadMaterialStore(),
      preloadProcurementStore(),
      import("@/pages/Engineer"),
      import("@/pages/Inventory"),
      import("@/pages/Procurement"),
    ]);
  }, []);
  // Note: MasterSpecs admin page is preloaded only when entering the admin console.

  const unreadMap = new Map(unreadSenders.map((s) => [s.user_id, s.count]));
  const onlineIds = new Set(onlineMembers.map((m) => m.user_id));
  const offlineWithUnread: OnlineMember[] = unreadSenders
    .filter((s) => !onlineIds.has(s.user_id))
    .map((s) => ({
      user_id: s.user_id,
      full_name: s.full_name,
      email: s.email,
      avatar_url: s.avatar_url,
      online_at: "",
    }));
  const headerMembers: OnlineMember[] = [
    ...onlineMembers.filter((m) => unreadMap.has(m.user_id)),
    ...offlineWithUnread,
    ...onlineMembers.filter((m) => !unreadMap.has(m.user_id)),
  ];
  const { isSuperAdmin, profile, user } = useAuth();
  const { flags: featureFlags } = useFeatureFlags();
  const flagOn = (key: string): boolean => {
    const f = featureFlags.find((x) => x.key === key);
    return f ? f.enabled : true;
  };

  useEffect(() => {
    if (user?.id && location) {
      logPageView(user.id, location);
    }
  }, [user?.id, location]);

  const navItems: NavItem[] = baseNavItems.filter((item) => {
    if (item.path === "/learn") return flagOn("learn");
    if (item.path === "/inventory") return flagOn("inventory");
    if (item.path === "/procurement") return flagOn("procure");
    return true;
  });

  const initials = (profile?.full_name || profile?.email || user?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const supplierCount = new Set(specs.map((s) => s.vendor).filter(Boolean)).size;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-5 shrink-0"
        style={{
          height: 52,
          background: "var(--card)",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div className="flex items-center gap-4 min-w-0">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                className="lg:hidden p-1 -ml-1 text-muted-foreground hover:text-foreground"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 bg-card">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex items-center h-[52px] px-4 gap-2" style={{ borderBottom: "0.5px solid var(--border)" }}>
                <img src={traceumIcon} alt="Traceium" className="h-7 w-auto object-contain" />
                <img src={traceumWordmark} alt="Traceium" className="h-4 w-auto object-contain" />
              </div>
              <nav className="py-2">
                {navItems.map((item) => {
                  const active = location === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      preload="render"
                      className="block px-4 py-2 text-sm"
                      style={{
                        color: active ? "var(--foreground)" : "var(--muted-foreground)",
                        background: active ? "var(--accent-blue-soft)" : undefined,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {item.label}
                      {item.path === "/compare" && compareCount > 0 ? ` (${compareCount})` : ""}
                    </Link>
                  );
                })}
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  preload="render"
                  className="block px-4 py-2 text-sm text-muted-foreground"
                >
                  Settings
                </Link>
                {isSuperAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileOpen(false)}
                    preload="render"
                    className="block px-4 py-2 text-sm text-[color:var(--accent-blue)]"
                  >
                    Admin Console
                  </Link>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          <Link to="/" className="flex items-center gap-1.5 shrink-0">
            <img src={traceumIcon} alt="Traceium" className="h-7 w-auto object-contain" />
            <img src={traceumWordmark} alt="Traceium" className="hidden sm:block h-4 w-auto object-contain" />
          </Link>

          <nav className="hidden lg:flex items-center">
            {navItems.map((item) => (
              <NavTab
                key={item.path}
                item={item}
                active={location === item.path || (item.path !== "/" && location.startsWith(item.path))}
                countSuffix={item.path === "/compare" && compareCount > 0 ? ` (${compareCount})` : undefined}
                highlight={item.path === "/compare" && compareCount > 0}
              />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">

          <div className="hidden md:block">
            <Suspense fallback={<div style={{ width: 220, height: 32 }} />}>
              <GlobalSearch />
            </Suspense>
          </div>


          {/* Mobile search trigger fallback */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground"
            aria-label="Search"
            onClick={() => {
              const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true });
              window.dispatchEvent(ev);
            }}
          >
            <SearchIcon className="w-4 h-4" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-2 text-muted-foreground hover:text-foreground"
                aria-label="Settings menu"
              >
                <Settings className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem asChild>
                <Link to="/settings" className="flex items-center gap-2 cursor-pointer">
                  <Cog className="w-3.5 h-3.5" /> Settings
                </Link>
              </DropdownMenuItem>
              {isSuperAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="flex items-center gap-2 cursor-pointer text-[color:var(--accent-blue)]">
                      <ShieldCheck className="w-3.5 h-3.5" /> Admin Console
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {headerMembers.length > 0 && (
            <div className="hidden sm:flex items-center -space-x-2">
              {headerMembers.slice(0, 4).map((m) => {
                const label = m.full_name || m.email || "Teammate";
                const init = label
                  .split(/\s+/)
                  .map((s) => s[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const unread = unreadMap.get(m.user_id) ?? 0;
                const isOnline = onlineIds.has(m.user_id);
                return (
                  <Tooltip key={m.user_id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setMsgRecipient(m)}
                        className="relative w-7 h-7 rounded-full bg-secondary border-2 border-card overflow-visible flex items-center justify-center hover:z-10 hover:ring-2 hover:ring-ring transition"
                        aria-label={`Message ${label}${unread ? ` (${unread} unread)` : ""}`}
                      >
                        <span className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-medium text-foreground">{init}</span>
                          )}
                        </span>
                        {isOnline && (
                          <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-card" />
                        )}
                        {unread > 0 && (
                          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[16px] font-semibold ring-2 ring-card text-center">
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {label}
                      {unread > 0 ? ` — ${unread} new message${unread > 1 ? "s" : ""}` : " — click to message"}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-secondary border border-border overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-ring transition"
            aria-label="Open profile"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-medium text-foreground">{initials}</span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto">{children}</main>

      {profileOpen && (
        <Suspense fallback={null}>
          <ProfileDrawer open={profileOpen} onOpenChange={setProfileOpen} />
        </Suspense>
      )}
      {msgRecipient && (
        <Suspense fallback={null}>
          <MessageDialog
            open={!!msgRecipient}
            onOpenChange={(v) => !v && setMsgRecipient(null)}
            recipient={msgRecipient}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <GuidedTour />
      </Suspense>
    </div>
  );
}
