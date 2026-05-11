import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_LANDING_CONTENT, type LandingContent } from "@/lib/landingContent";

export interface SiteSettings {
  content: LandingContent;
  heroVideoUrl: string | null;
}

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>({
    content: DEFAULT_LANDING_CONTENT,
    heroVideoUrl: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("site_settings" as never)
        .select("content, hero_video_url")
        .eq("id", "landing")
        .maybeSingle();
      if (!active) return;
      const row = data as { content?: Record<string, string>; hero_video_url?: string | null } | null;
      setSettings({
        content: { ...DEFAULT_LANDING_CONTENT, ...(row?.content ?? {}) },
        heroVideoUrl: row?.hero_video_url ?? null,
      });
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { ...settings, loading };
}
