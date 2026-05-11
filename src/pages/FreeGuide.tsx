import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_LEAD_MAGNET,
  loadLeadMagnet,
  validateWorkEmail,
  type LeadMagnetContent,
} from "@/lib/leadMagnet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, ArrowRight, ShieldCheck, ArrowLeft, FileText } from "lucide-react";
import traceumIcon from "@/assets/traceium-icon.png";
import traceumWordmark from "@/assets/traceium-wordmark.png";

export default function FreeGuide() {
  const [content, setContent] = useState<LeadMagnetContent>(DEFAULT_LEAD_MAGNET);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadLeadMagnet()
      .then(setContent)
      .finally(() => setLoading(false));
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const check = validateWorkEmail(email);
    if (!check.ok) {
      setError(check.reason ?? "Invalid email.");
      return;
    }
    if (!content.fileUrl) {
      setError("The download isn't available yet. Please try again later.");
      return;
    }
    setSubmitting(true);
    const { error: insertErr } = await supabase.from("lead_magnet_signups").insert({
      email: email.trim().toLowerCase(),
      email_domain: check.domain ?? "",
      full_name: name.trim() || null,
      company: company.trim() || null,
      source: "free-guide",
    });
    setSubmitting(false);
    if (insertErr) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setSuccess(true);
    // Trigger download
    window.open(content.fileUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={traceumIcon} alt="Traceium" className="h-7 w-auto" />
            <img src={traceumWordmark} alt="Traceium" className="h-4 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Back to home
            </Link>
            <Link
              to="/login"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              Sign in <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        {loading ? (
          <div className="h-64 animate-pulse bg-secondary/40 rounded-lg" />
        ) : (
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Download className="w-3 h-3" /> Free download
              </div>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
                {content.headline}
              </h1>
              {content.subheadline && (
                <p className="text-lg text-muted-foreground">{content.subheadline}</p>
              )}
            </div>

            {content.body && (
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {content.body}
              </p>
            )}

            <div className="bg-card border border-border rounded-xl p-6 md:p-8">
              {success ? (
                <div className="space-y-4 text-center">
                  <div className="inline-flex items-center gap-2 text-emerald-500 text-sm">
                    <ShieldCheck className="w-4 h-4" /> You're all set
                  </div>
                  <p className="text-sm text-foreground">{content.successMessage}</p>
                  {content.fileUrl && (
                    <a
                      href={content.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <Download className="w-4 h-4" /> Download again
                    </a>
                  )}
                </div>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        Full name
                      </label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Doe"
                        maxLength={100}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1.5">
                        Company
                      </label>
                      <Input
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Acme Aerospace"
                        maxLength={120}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">
                      Work email <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      maxLength={255}
                      autoComplete="email"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Personal email providers (Gmail, Yahoo, iCloud, etc.) aren't accepted.
                    </p>
                  </div>
                  {error && (
                    <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}
                  <Button type="submit" disabled={submitting} className="w-full">
                    {submitting ? "Sending…" : content.ctaText || "Get the guide"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground text-center">
                    By submitting, you agree to receive occasional product updates. Unsubscribe anytime.
                  </p>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
