import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Copy, KeyRound, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listWidgetClients,
  createWidgetClient,
  updateWidgetClient,
  deleteWidgetClient,
  rotateWidgetApiKey,
} from "@/lib/widgetClients.functions";

type Client = {
  id: string;
  name: string;
  brand_name: string;
  logo_url: string | null;
  accent_color: string;
  api_key_prefix: string;
  active: boolean;
  subscription_status: "trial" | "active" | "past_due" | "cancelled";
  monthly_price_usd: number | null;
  last_used_at: string | null;
  notes: string | null;
  created_at: string;
};

const STATUSES = ["trial", "active", "past_due", "cancelled"] as const;

export default function WidgetClientsAdmin() {
  const list = useServerFn(listWidgetClients);
  const create = useServerFn(createWidgetClient);
  const update = useServerFn(updateWidgetClient);
  const remove = useServerFn(deleteWidgetClient);
  const rotate = useServerFn(rotateWidgetApiKey);

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [revealKey, setRevealKey] = useState<{ id: string; key: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    brand_name: "",
    logo_url: "",
    accent_color: "#3B82F6",
    subscription_status: "trial" as (typeof STATUSES)[number],
    monthly_price_usd: "",
    notes: "",
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = (await list()) as Client[];
      setClients(rows);
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load widget clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitNew = async () => {
    try {
      const res = (await create({
        data: {
          name: form.name.trim(),
          brand_name: form.brand_name.trim(),
          logo_url: form.logo_url.trim() || null,
          accent_color: form.accent_color,
          subscription_status: form.subscription_status,
          monthly_price_usd: form.monthly_price_usd
            ? Number(form.monthly_price_usd)
            : null,
          notes: form.notes.trim() || null,
        },
      })) as { client: Client; api_key: string };
      setShowNew(false);
      setForm({
        name: "",
        brand_name: "",
        logo_url: "",
        accent_color: "#3B82F6",
        subscription_status: "trial",
        monthly_price_usd: "",
        notes: "",
      });
      setRevealKey({ id: res.client.id, key: res.api_key });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create client");
    }
  };

  const toggleActive = async (c: Client, next: boolean) => {
    setBusy(c.id);
    try {
      await update({ data: { id: c.id, active: next } });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (c: Client, status: Client["subscription_status"]) => {
    setBusy(c.id);
    try {
      await update({ data: { id: c.id, subscription_status: status } });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const onRotate = async (c: Client) => {
    if (!confirm(`Rotate API key for ${c.name}? The old key will stop working immediately.`))
      return;
    const res = (await rotate({ data: { id: c.id } })) as { api_key: string };
    setRevealKey({ id: c.id, key: res.api_key });
    await refresh();
  };

  const onDelete = async (c: Client) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    setBusy(c.id);
    try {
      await remove({ data: { id: c.id } });
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  const iframeSnippet = (apiKey: string) =>
    `<iframe src="${window.location.origin}/embed/crossover?key=${apiKey}" style="width:100%;height:720px;border:0;" loading="lazy"></iframe>`;

  const scriptSnippet = (apiKey: string) =>
    `<div id="traceium-crossover"></div>\n<script src="${window.location.origin}/widget.js" data-key="${apiKey}" data-target="#traceium-crossover" async></script>`;

  return (
    <AdminShell>
      <div className="max-w-5xl mx-auto p-6 sm:p-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Boxes className="w-5 h-5 text-[color:var(--accent-blue)]" />
            <div>
              <h1 className="text-2xl font-semibold">Widget Clients</h1>
              <p className="text-sm text-muted-foreground">
                Manage embeddable Crossover widget subscriptions and white-label branding.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4 mr-1" /> New client
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : clients.length === 0 ? (
          <div className="border border-dashed border-border rounded-md p-10 text-center text-sm text-muted-foreground">
            No widget clients yet.
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map((c) => (
              <div key={c.id} className="border border-border rounded-md p-4 bg-card space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.logo_url ? (
                      <img
                        src={c.logo_url}
                        alt=""
                        className="w-8 h-8 rounded object-contain bg-muted"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded"
                        style={{ background: c.accent_color }}
                      />
                    )}
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Brand: {c.brand_name} · Key: <code>{c.api_key_prefix}…</code>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={c.active}
                      onCheckedChange={(v) => toggleActive(c, v)}
                      disabled={busy === c.id}
                    />
                    <span className="text-xs text-muted-foreground">
                      {c.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>

                <div className="grid sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <Label className="text-xs text-muted-foreground">Subscription</Label>
                    <Select
                      value={c.subscription_status}
                      onValueChange={(v) => changeStatus(c, v as Client["subscription_status"])}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Monthly price</Label>
                    <div className="h-8 flex items-center">
                      {c.monthly_price_usd != null ? `$${c.monthly_price_usd}/mo` : "—"}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last used</Label>
                    <div className="h-8 flex items-center">
                      {c.last_used_at ? new Date(c.last_used_at).toLocaleString() : "never"}
                    </div>
                  </div>
                </div>

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Embed snippets
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <Label className="text-xs">Iframe</Label>
                      <div className="flex gap-2">
                        <code className="flex-1 p-2 bg-muted rounded text-[11px] break-all">
                          {iframeSnippet(`${c.api_key_prefix}…`)}
                        </code>
                        <p className="text-[10px] text-muted-foreground self-center">
                          (rotate key to reveal full snippet)
                        </p>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Script loader</Label>
                      <code className="block p-2 bg-muted rounded text-[11px] break-all whitespace-pre-wrap">
                        {scriptSnippet(`${c.api_key_prefix}…`)}
                      </code>
                    </div>
                  </div>
                </details>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRotate(c)}
                    disabled={busy === c.id}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" /> Rotate key
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(c)}
                    disabled={busy === c.id}
                    className="text-destructive"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New client dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New widget client</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Client name (internal)</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Composites"
              />
            </div>
            <div>
              <Label>Brand name (shown in widget)</Label>
              <Input
                value={form.brand_name}
                onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                placeholder="Acme"
              />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://…/logo.svg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Accent color</Label>
                <Input
                  type="color"
                  value={form.accent_color}
                  onChange={(e) => setForm({ ...form, accent_color: e.target.value })}
                />
              </div>
              <div>
                <Label>Monthly price (USD)</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.monthly_price_usd}
                  onChange={(e) =>
                    setForm({ ...form, monthly_price_usd: e.target.value })
                  }
                  placeholder="299"
                />
              </div>
            </div>
            <div>
              <Label>Subscription status</Label>
              <Select
                value={form.subscription_status}
                onValueChange={(v) =>
                  setForm({ ...form, subscription_status: v as (typeof STATUSES)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitNew}
              disabled={!form.name.trim() || !form.brand_name.trim()}
            >
              Create & generate key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal key dialog */}
      <Dialog open={!!revealKey} onOpenChange={(v) => !v && setRevealKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4" /> API key — copy now
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This key will not be shown again. Store it securely and share with the customer.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 p-3 bg-muted rounded text-xs break-all">
              {revealKey?.key}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => revealKey && copy(revealKey.key)}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          {revealKey && (
            <div className="space-y-2 text-xs">
              <Label className="text-xs">Iframe snippet</Label>
              <div className="flex gap-2">
                <code className="flex-1 p-2 bg-muted rounded break-all">
                  {iframeSnippet(revealKey.key)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(iframeSnippet(revealKey.key))}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <Label className="text-xs">Script loader</Label>
              <div className="flex gap-2">
                <code className="flex-1 p-2 bg-muted rounded break-all whitespace-pre-wrap">
                  {scriptSnippet(revealKey.key)}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copy(scriptSnippet(revealKey.key))}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRevealKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
