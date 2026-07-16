import { Link } from "@tanstack/react-router";
import { Users, Building2, Briefcase, FlaskConical, FileUp, Flag, LayoutTemplate, Gauge, Boxes } from "lucide-react";
import AdminShell from "@/components/AdminShell";

const CARDS = [
  { to: "/admin/users", label: "Users", desc: "Manage accounts, roles, demo access, and audit history.", Icon: Users },
  { to: "/admin/organizations", label: "Organizations", desc: "Create and manage tenant organizations.", Icon: Building2 },
  { to: "/admin/crm", label: "CRM", desc: "Leads from the free guide and manually-added contacts.", Icon: Briefcase },
  { to: "/admin/master-specs", label: "Master Specs", desc: "Canonical aerospace material spec catalog.", Icon: FlaskConical },
  { to: "/admin/tds-upload", label: "TDS Upload", desc: "Bulk-attach TDS PDFs to master specs via the INDEX CSV.", Icon: FileUp },
  { to: "/admin/landing", label: "Landing Page", desc: "Control the public landing page — hero video and more.", Icon: LayoutTemplate },
  { to: "/admin/feature-flags", label: "Feature Flags", desc: "Turn platform features and UI themes on or off across the app.", Icon: Flag },
  { to: "/admin/ai-usage", label: "AI Usage & Controls", desc: "Extraction cost, token usage, worker pause, and daily caps.", Icon: Gauge },
  { to: "/admin/widget-clients", label: "Widget Clients", desc: "Manage embeddable Crossover widget subscriptions and branding.", Icon: Boxes },
] as const;



export default function AdminHome() {
  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto p-6 sm:p-10 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Admin Console</h1>
          <p className="text-sm text-muted-foreground">Internal tools — not visible to customers.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {CARDS.map(({ to, label, desc, Icon }) => (
            <Link
              key={to}
              to={to}
              className="group border border-border rounded-md p-5 hover:border-foreground/30 transition-colors bg-card"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-4 h-4 text-[color:var(--accent-blue)]" />
                <span className="font-medium">{label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
