import { useState } from "react";
import { Link } from "@tanstack/react-router";
import DashboardLayout from "@/components/DashboardLayout";
import LandingEditor from "@/components/LandingEditor";
import { useAuth } from "@/hooks/useAuth";
import { Settings as SettingsIcon, Bell, Shield, Thermometer, Users, Building2, Save, Globe, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

/*
 * Design: Material Intelligence — Dark Industrial Minimalism
 * Settings page: System configuration for the Traceum platform.
 * Covers storage thresholds, notification rules, user management, and facility config.
 */

export default function Settings() {
  const { isSuperAdmin } = useAuth();
  const [active, setActive] = useState<string>("Storage Thresholds");

  const navItems: Array<{ icon: typeof Thermometer; label: string; enabled: boolean }> = [
    { icon: Thermometer, label: "Storage Thresholds", enabled: true },
    { icon: Bell, label: "Notifications", enabled: false },
    { icon: Shield, label: "Compliance Rules", enabled: false },
    { icon: Users, label: "Users & Roles", enabled: false },
    { icon: Building2, label: "Facilities", enabled: false },
    ...(isSuperAdmin
      ? [{ icon: Globe, label: "Landing Page", enabled: true }]
      : []),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
        </Link>
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            System configuration, thresholds, and notification rules
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Left nav */}
          <div className="md:col-span-3">
            <nav className="flex md:block overflow-x-auto md:overflow-visible gap-1 md:gap-0 md:space-y-1 pb-1 md:pb-0">
              {navItems.map((item) => {
                const isActive = active === item.label;
                return (
                  <button
                    key={item.label}
                    onClick={() =>
                      item.enabled ? setActive(item.label) : toast("Section coming soon")
                    }
                    className={`shrink-0 md:w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Settings content */}
          <div className="md:col-span-9 space-y-6 min-w-0">
            {active === "Landing Page" && isSuperAdmin && <LandingEditor />}
            {active === "Storage Thresholds" && (<div className="space-y-6">
            {/* Storage Thresholds */}
            <div className="bg-card border border-border rounded-lg">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-sm font-medium text-foreground">Storage Thresholds</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure when material lifecycle alerts trigger
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* Freezer Life */}
                <div className="space-y-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Freezer Life Alerts
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <SettingField
                      label="Warning Threshold"
                      value="30"
                      unit="days remaining"
                      description="Trigger warning when freezer life drops below this value"
                    />
                    <SettingField
                      label="Critical Threshold"
                      value="7"
                      unit="days remaining"
                      description="Trigger critical alert and block allocation"
                    />
                  </div>
                </div>

                <div className="border-t border-border/50" />

                {/* Out-Time */}
                <div className="space-y-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Out-Time Monitoring
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <SettingField
                      label="Warning Percentage"
                      value="75"
                      unit="% of max out-time"
                      description="Alert when cumulative out-time reaches this percentage"
                    />
                    <SettingField
                      label="Auto-Return Alert"
                      value="4"
                      unit="hours"
                      description="Alert if material not returned to freezer within this time"
                    />
                  </div>
                </div>

                <div className="border-t border-border/50" />

                {/* Temperature */}
                <div className="space-y-4">
                  <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Temperature Monitoring
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <SettingField
                      label="Max Freezer Temp"
                      value="-15.0"
                      unit="°C"
                      description="Alert if any freezer exceeds this temperature"
                    />
                    <SettingField
                      label="Defrost Event Threshold"
                      value="5"
                      unit="events/day"
                      description="Flag lot for review after this many defrost cycles"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-border flex justify-end">
                <button
                  onClick={() => toast.success("Settings saved")}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </div>

            {/* Notification Rules */}
            <div className="bg-card border border-border rounded-lg">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-sm font-medium text-foreground">Notification Channels</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Where alerts are routed based on severity
                </p>
              </div>

              <div className="p-6">
                <div className="space-y-3">
                  <NotificationRow
                    severity="Critical"
                    color="var(--status-critical)"
                    channels={["Email", "SMS", "Dashboard"]}
                    description="Expired material, temperature excursion, compliance failure"
                  />
                  <NotificationRow
                    severity="Warning"
                    color="var(--status-warning)"
                    channels={["Email", "Dashboard"]}
                    description="Approaching thresholds, supplier delays, out-time alerts"
                  />
                  <NotificationRow
                    severity="Info"
                    color="oklch(0.6 0 0)"
                    channels={["Dashboard"]}
                    description="COC generated, material received, order fulfilled"
                  />
                </div>
              </div>
            </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function SettingField({
  label,
  value,
  unit,
  description,
}: {
  label: string;
  value: string;
  unit: string;
  description: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          defaultValue={value}
          className="bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground w-24 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <p className="text-xs text-muted-foreground/70">{description}</p>
    </div>
  );
}

function NotificationRow({
  severity,
  color,
  channels,
  description,
}: {
  severity: string;
  color: string;
  channels: string[];
  description: string;
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-secondary/30 border border-border/50 rounded-md">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <div>
          <p className="text-sm text-foreground">{severity}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {channels.map((ch) => (
          <span key={ch} className="text-xs px-2 py-1 bg-accent rounded text-muted-foreground">
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
