import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import AdminShell from "@/components/AdminShell";
import { Switch } from "@/components/ui/switch";
import {
  useFeatureFlags,
  setFeatureFlagEnabled,
  type FeatureFlag,
} from "@/data/featureFlags";

export default function FeatureFlagsAdmin() {
  const { flags, loaded } = useFeatureFlags();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const toggle = async (flag: FeatureFlag, next: boolean) => {
    setPending((p) => new Set(p).add(flag.key));
    try {
      await setFeatureFlagEnabled(flag.key, next);
      toast.success(`${flag.label} is now ${next ? "on" : "off"}.`);
    } catch (e) {
      console.error("setFeatureFlagEnabled failed", e);
      toast.error(`Couldn't update ${flag.label}.`);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(flag.key);
        return n;
      });
    }
  };

  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-[color:var(--accent-blue)]" />
          <div>
            <h1 className="text-2xl font-semibold">Feature Flags</h1>
            <p className="text-sm text-muted-foreground">
              Turn platform features and UI themes on or off. Changes apply to all users in real time.
            </p>
          </div>
        </div>

        {!loaded ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading flags…
          </div>
        ) : flags.length === 0 ? (
          <div className="border border-border rounded-md p-6 text-sm text-muted-foreground bg-card">
            No feature flags defined yet.
          </div>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border bg-card">
            {flags.map((f) => {
              const busy = pending.has(f.key);
              return (
                <div key={f.key} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{f.label}</span>
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {f.key}
                      </code>
                    </div>
                    {f.description && (
                      <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Last updated {new Date(f.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 pt-1">
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={f.enabled}
                      disabled={busy}
                      onCheckedChange={(v) => toggle(f, v)}
                      aria-label={`Toggle ${f.label}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
