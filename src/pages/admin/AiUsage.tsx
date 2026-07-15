import { useEffect, useState } from "react";
import { Loader2, Pause, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getAiUsageDashboard, updateAiSettings } from "@/lib/aiUsage.functions";

type Dashboard = Awaited<ReturnType<typeof getAiUsageDashboard>>;

export default function AiUsage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = (await getAiUsageDashboard()) as Dashboard;
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  async function save(partial: { daily_call_cap?: number; daily_cost_cap_usd?: number; enabled?: boolean }) {
    setSaving(true);
    try {
      await updateAiSettings({ data: partial });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading AI usage…
      </div>
    );
  }

  const totalCost = data.usage.reduce((a, b) => a + Number(b.cost_usd || 0), 0);
  const totalCalls = data.usage.reduce((a, b) => a + (b.calls || 0), 0);
  const totalIn = data.usage.reduce((a, b) => a + Number(b.input_tokens || 0), 0);
  const totalOut = data.usage.reduce((a, b) => a + Number(b.output_tokens || 0), 0);
  const failureSpike = data.liveStats.sampleSize >= 20 && data.liveStats.failureRate > 0.25;
  const enabled = data.settings?.enabled ?? true;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AI Usage & Controls</h1>
          <p className="text-sm text-muted-foreground">Last 30 days of extraction activity, cost, and worker settings.</p>
        </div>
        <button
          disabled={saving}
          onClick={() => save({ enabled: !enabled })}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded border text-sm ${
            enabled ? "border-border hover:bg-secondary" : "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          }`}
        >
          {enabled ? <><Pause className="w-4 h-4" /> Pause worker</> : <><Play className="w-4 h-4" /> Resume worker</>}
        </button>
      </div>

      {!enabled && (
        <Banner tone="warn">
          Worker is paused. No new items will be claimed. Resume above when ready.
        </Banner>
      )}
      {failureSpike && (
        <Banner tone="error">
          Failure spike: {Math.round(data.liveStats.failureRate * 100)}% of the last {data.liveStats.sampleSize} items failed.
        </Banner>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="30d calls" value={totalCalls.toLocaleString()} />
        <Card label="30d cost" value={`$${totalCost.toFixed(2)}`} />
        <Card label="30d input tok" value={totalIn.toLocaleString()} />
        <Card label="30d output tok" value={totalOut.toLocaleString()} />
        <Card label="Avg latency (recent 50)" value={`${data.liveStats.avgLatencyMs} ms`} />
        <Card label="Cache hit rate" value={`${Math.round(data.liveStats.cacheHitRate * 100)}%`} />
        <Card label="Recent failure rate" value={`${Math.round(data.liveStats.failureRate * 100)}%`} />
        <Card label="Sample size" value={String(data.liveStats.sampleSize)} />
      </div>

      <section className="border border-border rounded-lg p-4">
        <h2 className="font-semibold text-foreground mb-3">Caps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-sm">
            Daily call cap
            <input
              type="number"
              defaultValue={data.settings?.daily_call_cap ?? 500}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== data.settings?.daily_call_cap) save({ daily_call_cap: v });
              }}
              className="mt-1 w-full px-2 py-1 rounded border border-border bg-background"
            />
          </label>
          <label className="text-sm">
            Daily cost cap (USD)
            <input
              type="number"
              step="0.01"
              defaultValue={Number(data.settings?.daily_cost_cap_usd ?? 25)}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v !== Number(data.settings?.daily_cost_cap_usd)) save({ daily_cost_cap_usd: v });
              }}
              className="mt-1 w-full px-2 py-1 rounded border border-border bg-background"
            />
          </label>
        </div>
      </section>

      <section className="border border-border rounded-lg p-4">
        <h2 className="font-semibold text-foreground mb-3">Daily usage</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-1">Day</th>
                <th className="text-left">Model</th>
                <th className="text-right">Calls</th>
                <th className="text-right">Fails</th>
                <th className="text-right">Input tok</th>
                <th className="text-right">Output tok</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.usage.slice().reverse().map((r) => (
                <tr key={`${r.day}-${r.model}`} className="border-t border-border">
                  <td className="py-1">{r.day}</td>
                  <td className="text-muted-foreground">{r.model}</td>
                  <td className="text-right">{r.calls}</td>
                  <td className="text-right">{r.failures}</td>
                  <td className="text-right">{Number(r.input_tokens).toLocaleString()}</td>
                  <td className="text-right">{Number(r.output_tokens).toLocaleString()}</td>
                  <td className="text-right">${Number(r.cost_usd).toFixed(3)}</td>
                </tr>
              ))}
              {data.usage.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-center text-muted-foreground">No usage yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-border rounded-lg p-4">
        <h2 className="font-semibold text-foreground mb-3">Recent failures</h2>
        {data.recentFailures.length === 0 ? (
          <div className="text-sm text-muted-foreground">No recent failures.</div>
        ) : (
          <ul className="text-sm space-y-2">
            {data.recentFailures.map((f) => (
              <li key={f.id} className="border-l-2 border-red-500 pl-2">
                <div className="text-muted-foreground text-xs">
                  {new Date(f.updated_at).toLocaleString()} · spec {f.spec_id.slice(0, 8)}…
                </div>
                <div className="text-foreground">{f.error}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border p-3">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-foreground mt-1">{value}</div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "border-red-500 bg-red-500/10 text-red-700 dark:text-red-300"
      : "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return (
    <div className={`border rounded p-3 text-sm flex items-start gap-2 ${cls}`}>
      <AlertTriangle className="w-4 h-4 mt-0.5" /> <div>{children}</div>
    </div>
  );
}
