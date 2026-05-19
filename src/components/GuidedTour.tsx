import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Lightbulb,
  Package,
  ShoppingBasket,
  BookOpen,
  Settings,
  Search,
  MessageCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TourStep {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  bullets: string[];
  navigateTo?: string;
  superAdminOnly?: boolean;
}

const STEPS: TourStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Traceium",
    body: "A quick 60-second tour of where things live and what each page is for. You can skip anytime — we won't show this again.",
    bullets: [
      "Use the left sidebar to switch between workspaces.",
      "The top search bar finds master specs instantly.",
      "Your avatar (top right) opens your profile and sign-out.",
    ],
  },
  {
    icon: Lightbulb,
    title: "Engineer Workspace",
    body: "Reverse-lookup the master spec catalog by any property. Filter, sort, and queue items for procurement.",
    bullets: [
      "Filter by chemistry, form, cure temp, NASA E595 and more.",
      "Click any column header to sort.",
      "Check Procure to add items to the procurement pick list.",
      "Star items you reorder often.",
    ],
    navigateTo: "/engineer",
  },
  {
    icon: Package,
    title: "Inventory",
    body: "Track on-hand material, lots, and incoming orders linked to master specs.",
    bullets: [
      "See available quantity, active lots, and incoming ETAs.",
      "Click a material to drill into lots and history.",
    ],
    navigateTo: "/inventory",
  },
  {
    icon: ShoppingBasket,
    title: "Procurement",
    body: "Review what engineers have flagged, group by vendor, and send purchase requests.",
    bullets: [
      "Items added from the Engineer page show up here as pending.",
      "Email vendors directly with grouped pick lists.",
    ],
    navigateTo: "/procurement",
  },
  {
    icon: BookOpen,
    title: "Master Specs",
    body: "Upload and manage the spec sheet that powers the whole system.",
    bullets: [
      "Drop in a spec workbook — columns are auto-mapped.",
      "Edits here propagate everywhere.",
    ],
    navigateTo: "/admin/master-specs",
    superAdminOnly: true,
  },
  {
    icon: Search,
    title: "Top Search",
    body: "Use the search bar at the top to jump to any master spec.",
    bullets: [
      "Type a product, vendor, chemistry, or family.",
      "Use ⌘K / Ctrl+K to focus from anywhere.",
      "Pick a suggestion to open it directly.",
    ],
  },
  {
    icon: MessageCircle,
    title: "Teammates & Messages",
    body: "Online teammates appear in the header. Click an avatar to message them.",
    bullets: [
      "A red badge shows unread messages from that person.",
      "Conversations are private to your organization.",
    ],
  },
  {
    icon: Settings,
    title: "Settings",
    body: "Manage your profile, organization, and integrations from Settings in the sidebar.",
    bullets: [
      "Update your name and avatar in your profile.",
      "Super admins can manage users, organizations, and the public lead magnet here.",
    ],
    navigateTo: "/settings",
  },
];

const STORAGE_KEY = "traceium.tour.step";

export default function GuidedTour() {
  const { profile, isAuthenticated, isSuperAdmin, refresh, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const steps = useMemo(
    () => STEPS.filter((s) => !s.superAdminOnly || isSuperAdmin),
    [isSuperAdmin],
  );

  // Show automatically the first time a signed-in user has no completion timestamp.
  // Persist the current step to sessionStorage so navigating between routes
  // (which remounts DashboardLayout and this component) doesn't reset progress.
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !profile) return;
    if (profile.tour_completed_at) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    const saved = Number(sessionStorage.getItem(STORAGE_KEY) ?? "0");
    const safe = Number.isFinite(saved) ? Math.min(Math.max(saved, 0), steps.length - 1) : 0;
    setIndex(safe);
    setOpen(true);
  }, [loading, isAuthenticated, profile, steps.length]);

  useEffect(() => {
    if (open) sessionStorage.setItem(STORAGE_KEY, String(index));
  }, [open, index]);

  if (!open || !profile) return null;

  const step = steps[index];
  const Icon = step.icon;
  const isLast = index === steps.length - 1;

  const goNext = () => {
    const nextIdx = Math.min(steps.length - 1, index + 1);
    const next = steps[nextIdx];
    sessionStorage.setItem(STORAGE_KEY, String(nextIdx));
    setIndex(nextIdx);
    if (next?.navigateTo) navigate({ to: next.navigateTo as never }).catch(() => {});
  };
  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  const finish = async () => {
    setSaving(true);
    sessionStorage.removeItem(STORAGE_KEY);
    try {
      await supabase
        .from("profiles")
        .update({ tour_completed_at: new Date().toISOString() })
        .eq("id", profile.id);
      await refresh();
    } catch {
      // even if save fails, dismiss locally so the user isn't stuck
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-end justify-end p-4 sm:p-6">
      <div className="pointer-events-auto relative w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl overflow-hidden ring-1 ring-foreground/5">
        <button
          onClick={finish}
          disabled={saving}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground p-1 rounded"
          aria-label="Close tour"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-foreground text-background flex items-center justify-center">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                Step {index + 1} of {steps.length}
              </p>
              <h2 className="text-lg font-semibold text-foreground leading-tight">
                {step.title}
              </h2>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-3">{step.body}</p>

          <ul className="space-y-1.5">
            {step.bullets.map((b) => (
              <li key={b} className="flex gap-2 text-sm text-foreground">
                <span className="text-muted-foreground mt-1">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* progress */}
        <div className="px-6">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded ${
                  i <= index ? "bg-foreground" : "bg-secondary"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-6 py-4 mt-4 border-t border-border flex items-center justify-between gap-2">
          <button
            onClick={finish}
            disabled={saving}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={goPrev}
              disabled={index === 0 || saving}
              className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {isLast ? (
              <button
                onClick={finish}
                disabled={saving}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Finish"}
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={saving}
                className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
