import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Trash2, ExternalLink, Video } from "lucide-react";
import { toast } from "sonner";
import AdminShell from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function LandingAdmin() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [heroVideoUrl, setHeroVideoUrl] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, unknown>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("site_settings" as never)
        .select("content, hero_video_url")
        .eq("id", "landing")
        .maybeSingle();
      const row = data as { content?: Record<string, unknown>; hero_video_url?: string | null } | null;
      setHeroVideoUrl(row?.hero_video_url ?? null);
      setContent(row?.content ?? {});
      setLoading(false);
    })();
  }, []);

  const persist = async (nextUrl: string | null) => {
    setSaving(true);
    const { error } = await supabase
      .from("site_settings" as never)
      .upsert(
        {
          id: "landing",
          content: JSON.parse(JSON.stringify(content)),
          hero_video_url: nextUrl,
          updated_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "id" } as never,
      );
    setSaving(false);
    if (error) {
      toast.error(error.message || "Failed to save");
      return false;
    }
    return true;
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Please upload a video file (MP4, WebM).");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video must be under 100 MB.");
      return;
    }
    setUploading(true);
    const path = `hero/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage
      .from("landing-media")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error(error.message || "Upload failed");
      return;
    }
    const { data: pub } = supabase.storage.from("landing-media").getPublicUrl(path);
    const ok = await persist(pub.publicUrl);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok) {
      setHeroVideoUrl(pub.publicUrl);
      toast.success("Hero video updated.");
    }
  };

  const removeVideo = async () => {
    const ok = await persist(null);
    if (ok) {
      setHeroVideoUrl(null);
      toast.success("Reverted to default video.");
    }
  };

  return (
    <AdminShell>
      <div className="max-w-3xl mx-auto p-6 sm:p-10 space-y-6">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-[color:var(--accent-blue)]" />
          <div>
            <h1 className="text-2xl font-semibold">Landing Page</h1>
            <p className="text-sm text-muted-foreground">
              Control elements shown on the public{" "}
              <a href="/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                landing page <ExternalLink className="w-3 h-3" />
              </a>
              .
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-sm font-medium">Hero demo video</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shown in the demo frame at the top of the landing page. MP4 or WebM, up to 100 MB.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="aspect-video w-full bg-black rounded-md overflow-hidden border border-border">
                {heroVideoUrl ? (
                  <video
                    key={heroVideoUrl}
                    src={heroVideoUrl}
                    className="h-full w-full object-contain"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <video
                    key="default"
                    src="/traceium-demo.mp4"
                    className="h-full w-full object-contain"
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {heroVideoUrl ? "Custom video active." : "Default bundled video shown."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/webm"
                  className="hidden"
                  onChange={onFile}
                />
                <Button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || saving}
                  size="sm"
                >
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading…</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> {heroVideoUrl ? "Replace video" : "Upload video"}</>
                  )}
                </Button>
                {heroVideoUrl && (
                  <Button
                    onClick={removeVideo}
                    disabled={uploading || saving}
                    size="sm"
                    variant="ghost"
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Revert to default
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
