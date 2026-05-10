import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Package,
  Settings,
  Search,
  Bell,
  ChevronRight,
  Lightbulb,
  BookOpen,
  ShoppingBasket,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// Dashboard, Compliance, Documents, Suppliers, Orders are intentionally
// hidden from the sidebar (routes still resolve via direct URL).
const navItems = [
  { path: "/engineer", label: "Engineer", icon: Lightbulb },
  { path: "/master-specs", label: "Master Specs", icon: BookOpen },
  { path: "/inventory", label: "Inventory", icon: Package },
  { path: "/procurement", label: "Procurement", icon: ShoppingBasket },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation({ select: (l) => l.pathname });
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-sidebar transition-all duration-200 ${
          sidebarExpanded ? "w-60" : "w-16"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-border">
          {sidebarExpanded ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-white flex items-center justify-center">
                <span className="text-black font-bold text-sm tracking-tight">T</span>
              </div>
              <span className="text-foreground font-semibold text-base tracking-tight">
                Traceum
              </span>
            </div>
          ) : (
            <div className="w-7 h-7 rounded bg-white flex items-center justify-center mx-auto">
              <span className="text-black font-bold text-sm tracking-tight">T</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} to={item.path}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {sidebarExpanded && <span>{item.label}</span>}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar footer */}
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

        {/* Collapse toggle */}
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-background shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search materials, lots, orders..."
                className="bg-secondary border border-border rounded-md pl-9 pr-4 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-72 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-accent px-1.5 py-0.5 rounded">
                ⌘K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* System health indicator */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-[var(--status-compliant)]" />
              <span>All systems nominal</span>
            </div>

            <button
              onClick={() => toast("Notifications coming soon")}
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell className="w-4 h-4" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--status-warning)]" />
            </button>

            <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center">
              <span className="text-xs font-medium text-foreground">OP</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
