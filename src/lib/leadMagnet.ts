import { supabase } from "@/integrations/supabase/client";

export interface LeadMagnetContent {
  headline: string;
  subheadline: string;
  body: string;
  ctaText: string;
  successMessage: string;
  fileUrl: string;
  fileName: string;
}

export const DEFAULT_LEAD_MAGNET: LeadMagnetContent = {
  headline: "Free aerospace composites guide",
  subheadline: "The shortcuts our customers wish they'd had on day one.",
  body: "Drop your work email below and we'll send you a copy instantly. No spam — we hate it too.",
  ctaText: "Get the guide",
  successMessage: "Check your inbox — your download is on its way. You can also grab it again below.",
  fileUrl: "",
  fileName: "",
};

// Common consumer / free-mail providers — block these to require a work email.
export const CONSUMER_EMAIL_DOMAINS = new Set<string>([
  "gmail.com", "googlemail.com",
  "yahoo.com", "ymail.com", "yahoo.co.uk", "yahoo.ca", "yahoo.fr", "yahoo.de", "yahoo.com.au", "rocketmail.com",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de",
  "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "aim.com",
  "proton.me", "protonmail.com", "pm.me",
  "gmx.com", "gmx.us", "gmx.de", "gmx.net",
  "mail.com", "mail.ru", "yandex.com", "yandex.ru",
  "zoho.com",
  "fastmail.com", "fastmail.fm",
  "inbox.com", "rediffmail.com",
  "qq.com", "163.com", "126.com", "sina.com", "naver.com",
  "tutanota.com", "hushmail.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "earthlink.net",
  "btinternet.com", "sky.com", "ntlworld.com",
  "duck.com", "duckduckgo.com",
]);

export interface EmailCheck {
  ok: boolean;
  reason?: string;
  domain?: string;
}

export function validateWorkEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  // RFC-ish basic shape
  const re = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!re.test(email)) return { ok: false, reason: "Please enter a valid email address." };
  const domain = email.split("@")[1];
  if (CONSUMER_EMAIL_DOMAINS.has(domain)) {
    return { ok: false, reason: "Please use your work email — personal email providers aren't accepted.", domain };
  }
  return { ok: true, domain };
}

export async function loadLeadMagnet(): Promise<LeadMagnetContent> {
  const { data } = await supabase
    .from("site_settings")
    .select("content")
    .eq("id", "lead_magnet")
    .maybeSingle();
  const content = (data?.content as Partial<LeadMagnetContent> | null) ?? null;
  return { ...DEFAULT_LEAD_MAGNET, ...(content ?? {}) };
}
