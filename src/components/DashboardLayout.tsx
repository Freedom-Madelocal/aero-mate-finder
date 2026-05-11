import { Link, useLocation } from "@tanstack/react-router";
import {
  Package,
  Settings,
  Search,
  ChevronRight,
  Lightbulb,
  BookOpen,
  ShoppingBasket,
  Menu,
} from "lucide-react";
import { useState } from "react";
import traceumIcon from "@/assets/traceium-icon.png";
import traceumWordmark from "@/assets/traceium-wordmark.png";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import ProfileDrawer from "@/components/ProfileDrawer";

const baseNavItems = [
  { path: "/engineer", label: "Engineer", icon: Lightbulb },
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/procurement", label: "Procurement", icon: ShoppingBasket },
];
const superAdminNavItems = [
  { path: "/master-specs", label: "Master Specs", icon: BookOpen },
  { path: "/admin/users", label: "Users", icon: Settings },
  { path: "/admin/organizations", label: "Organizations", icon: Settings },
];

type NavItem = { path: string; label: string; icon: typeof Package };

function NavList({
  items,
  location,
  expanded,
  onNavigate,
}: {
  items: NavItem[];
  location: string;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 py-3 px-2 space-y-0.5">
      {items.map((item) => {
        const isActive = location === item.path;
        return (
          <Link key={item.path} to={item.path} onClick={onNavigate}>
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {expanded && <span>{item.label}</span>}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation({ select: (l) => l.pathname });
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { isSuperAdmin, profile, user } = useAuth();
  const navItems = isSuperAdmin ? [...baseNavItems, ...superAdminNavItems] : baseNavItems;
  const initials = (profile?.full_name || profile?.email || user?.email || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop / tablet sidebar */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-200 ${
          sidebarExpanded ? "w-60" : "w-16"
        }`}
      >
        <div className="flex items-center h-14 px-4 border-b border-border">
          {sidebarExpanded ? (
            <div className="flex items-center gap-2">
              <img src={traceumIcon} alt="Traceium" className="h-7 w-auto object-contain" />
              <img src={traceumWordmark} alt="Traceium" className="h-4 w-auto object-contain" />
            </div>
          ) : (
            <img src={traceumIcon} alt="Traceium" className="h-7 w-auto object-contain mx-auto" />
          )}
        </div>

        <NavList items={navItems} location={location} expanded={sidebarExpanded} />

        <div className="border-t border-border p-2">
          <Link to="/settings">
            <div
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full transition-colors ${
                location === "/settings"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              {sidebarExpanded && <span>Settings</span>}
            </div>
          </Link>
        </div>

        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="border-t border-border p-3 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight
            className={`w-4 h-4 transition-transform ${sidebarExpanded ? "rotate-180" : ""}`}
          />
        </button>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-4 md:px-6 bg-background shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button
                  className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                  aria-label="Open menu"
                >
                  <Menu className="w-5 h-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex items-center h-14 px-4 border-b border-border gap-2">
                  <img src={traceumIcon} alt="Traceium" className="h-7 w-auto object-contain" />
                  <img src={traceumWordmark} alt="Traceium" className="h-4 w-auto object-contain" />
                </div>
                <NavList
                  items={navItems}
                  location={location}
                  expanded
                  onNavigate={() => setMobileOpen(false)}
                />
                <div className="border-t border-border p-2">
                  <Link to="/settings" onClick={() => setMobileOpen(false)}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm w-full ${
                        location === "/settings"
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      }`}
                    >
                      <Settings className="w-4 h-4 shrink-0" />
                      <span>Settings</span>
                    </div>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>

            {/* Mobile logo */}
            <Link to="/" className="md:hidden flex items-center gap-1.5">
              <img src={traceumIcon} alt="Traceium" className="h-6 w-auto" />
            </Link>

            {/* Desktop search */}
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search materials, lots, orders..."
                className="bg-secondary border border-border rounded-md pl-9 pr-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-56 lg:w-72 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded hidden lg:block">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
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

        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
      <ProfileDrawer open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
