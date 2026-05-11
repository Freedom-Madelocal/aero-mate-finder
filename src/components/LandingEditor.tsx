import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Save, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_LANDING_CONTENT,
  LANDING_SECTIONS,
  type LandingContent,
} from "@/lib/landingContent";

export default function LandingEditor() {
  const [content, setContent] = useState<LandingContent>(DEFAULT_LANDING_CONTENT);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_settings" as never)
        .select("content, hero_video_url")
        .eq("id", "landing")
        .maybeSingle();
      const row = data as { content?: Record<string, string>; hero_video_url?: string | null } | null;
      setContent({ ...DEFAULT_LANDING_CONTENT, ...(row?.content ?? {}) });
      setHeroVideoUrl(row?.hero_video_url ?? null);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("site_settings" as never)
      .update({ content, hero_video_url: heroVideoUrl } as never)
      .eq("id", "landing");
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Landing page updated");
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please select a video file");
      return;
    }
    setUploading(true);
    const path = `hero-${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage
      .from("landing-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("landing-media").getPublicUrl(path);
    setHeroVideoUrl(data.publicUrl);
    setUploading(false);
    toast.success("Video uploaded — remember to save");
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-medium text-foreground">Landing — Hero video</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            MP4 recommended. Public URL — anyone visiting / will see it.
          </p>
        </div>
        <div className="p-6 space-y-4">
          {heroVideoUrl ? (
            <video
              key={heroVideoUrl}
              src={heroVideoUrl}
              controls
              className="w-full max-w-md rounded-md border border-border bg-black"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              No custom video uploaded. Currently using <code>/traceium-demo.mp4</code>.
            </p>
          )}
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept="video/*"
              onChange={onUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Uploading…" : "Upload video"}
            </button>
            {heroVideoUrl && (
              <button
                type="button"
                onClick={() => setHeroVideoUrl(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Reset to default
              </button>
            )}
          </div>
          {heroVideoUrl && (
            <p className="text-[11px] text-muted-foreground break-all">{heroVideoUrl}</p>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-foreground">Landing — Section copy</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edit any text on the public landing page.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
        <div className="p-6 space-y-8">
          {LANDING_SECTIONS.map((section) => (
            <div key={section.label} className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {section.label}
              </h3>
              <div className="grid gap-3">
                {section.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <label className="text-xs text-muted-foreground">{f.label}</label>
                    {f.multiline ? (
                      <textarea
                        rows={4}
                        value={content[f.key] ?? ""}
                        onChange={(e) =>
                          setContent((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : (
                      <input
                        type="text"
                        value={content[f.key] ?? ""}
                        onChange={(e) =>
                          setContent((p) => ({ ...p, [f.key]: e.target.value }))
                        }
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
