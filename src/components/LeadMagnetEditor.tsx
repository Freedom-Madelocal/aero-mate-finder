import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  DEFAULT_LEAD_MAGNET,
  loadLeadMagnet,
  type LeadMagnetContent,
} from "@/lib/leadMagnet";
import { Download, Upload, Trash2, ExternalLink, RefreshCw } from "lucide-react";

interface Signup {
  id: string;
  email: string;
  email_domain: string;
  full_name: string | null;
  company: string | null;
  source: string | null;
  created_at: string;
}

export default function LeadMagnetEditor() {
  const { user } = useAuth();
  const [content, setContent] = useState<LeadMagnetContent>(DEFAULT_LEAD_MAGNET);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [signupsLoading, setSignupsLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLeadMagnet().then((c) => {
      setContent(c);
      setLoading(false);
    });
    refreshSignups();
  }, []);

  const refreshSignups = async () => {
    setSignupsLoading(true);
    const { data, error } = await supabase
      .from("lead_magnet_signups")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setSignupsLoading(false);
    if (error) {
      toast.error("Couldn't load signups");
      return;
    }
    setSignups((data as Signup[]) ?? []);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("site_settings")
      .upsert(
        {
          id: "lead_magnet",
          content: JSON.parse(JSON.stringify(content)),
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to save");
      return;
    }
    toast.success("Lead magnet page saved.");
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File must be under 50 MB.");
      return;
    }
    setUploading(true);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("lead-magnet")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(error.message || "Upload failed");
      return;
    }
    const { data: pub } = supabase.storage.from("lead-magnet").getPublicUrl(path);
    setContent((c) => ({ ...c, fileUrl: pub.publicUrl, fileName: file.name }));
    setUploading(false);
    toast.success("File uploaded. Don't forget to save.");
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeFile = () => {
    setContent((c) => ({ ...c, fileUrl: "", fileName: "" }));
    toast("File removed from page. Save to apply.");
  };

  const exportCsv = () => {
    const header = ["Created at", "Email", "Domain", "Full name", "Company", "Source"];
    const escape = (v: string | null) => {
      const s = (v ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = signups.map((s) =>
      [
        new Date(s.created_at).toISOString(),
        s.email,
        s.email_domain,
        s.full_name,
        s.company,
        s.source,
      ]
        .map(escape)
        .join(","),
    );
    const csv = [header.map(escape).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lead-magnet-signups-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="h-40 animate-pulse bg-secondary/40 rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      {/* Page copy editor */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium">Lead magnet page</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Public download page at{" "}
              <a
                href="/free-guide"
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-1"
              >
                /free-guide <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <Field label="Headline">
            <Input
              value={content.headline}
              onChange={(e) => setContent({ ...content, headline: e.target.value })}
              maxLength={120}
            />
          </Field>
          <Field label="Subheadline">
            <Input
              value={content.subheadline}
              onChange={(e) => setContent({ ...content, subheadline: e.target.value })}
              maxLength={200}
            />
          </Field>
          <Field label="Body copy">
            <Textarea
              value={content.body}
              onChange={(e) => setContent({ ...content, body: e.target.value })}
              rows={4}
              maxLength={1000}
            />
          </Field>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Button text">
              <Input
                value={content.ctaText}
                onChange={(e) => setContent({ ...content, ctaText: e.target.value })}
                maxLength={40}
              />
            </Field>
            <Field label="Success message">
              <Input
                value={content.successMessage}
                onChange={(e) => setContent({ ...content, successMessage: e.target.value })}
                maxLength={200}
              />
            </Field>
          </div>

          <Field label="Downloadable file">
            {content.fileUrl ? (
              <div className="flex items-center gap-2 bg-secondary border border-border rounded-md px-3 py-2">
                <Download className="w-4 h-4 text-muted-foreground" />
                <a
                  href={content.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm flex-1 truncate hover:underline"
                >
                  {content.fileName || "Current file"}
                </a>
                <button
                  onClick={removeFile}
                  className="text-muted-foreground hover:text-red-500"
                  aria-label="Remove file"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No file uploaded yet.</p>
            )}
            <div className="mt-2">
              <input
                ref={fileRef}
                type="file"
                onChange={onFile}
                className="hidden"
                accept=".pdf,.zip,.csv,.xlsx,.docx,.png,.jpg,.jpeg"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {uploading ? "Uploading…" : content.fileUrl ? "Replace file" : "Upload file"}
              </Button>
            </div>
          </Field>
        </div>
      </div>

      {/* Signups */}
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-medium">Signups</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {signups.length} {signups.length === 1 ? "person has" : "people have"} requested the download.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshSignups} disabled={signupsLoading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${signupsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={exportCsv} disabled={signups.length === 0}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Download CSV
            </Button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left font-medium px-4 py-2">Date</th>
                <th className="text-left font-medium px-4 py-2">Email</th>
                <th className="text-left font-medium px-4 py-2">Name</th>
                <th className="text-left font-medium px-4 py-2">Company</th>
              </tr>
            </thead>
            <tbody>
              {signups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No signups yet.
                  </td>
                </tr>
              ) : (
                signups.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 hover:bg-accent/30">
                    <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 truncate max-w-[260px]">{s.email}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.full_name || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.company || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
