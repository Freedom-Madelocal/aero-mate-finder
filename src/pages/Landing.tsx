import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Search,
  ShieldCheck,
  Layers,
  Workflow,
  Database,
  Zap,
  Microscope,
  Mail,
  ShoppingBasket,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import traceumIcon from "@/assets/traceium-icon.webp";
import traceumWordmark from "@/assets/traceium-wordmark.webp";
import { TheInfiniteGrid } from "@/components/ui/the-infinite-grid";

export default function Landing() {
  const [submitting, setSubmitting] = useState(false);
  const { content: c, heroVideoUrl } = useSiteSettings();
  const bannerSuppliers = (c.landing_suppliers || "Hexcel, Toray, Syensqo, 3M, Henkel")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Repeat each supplier twice inside the scrolling strip so the content is wide enough
  // to cover the viewport and the loop stays seamless.
  const doubledSuppliers = bannerSuppliers.flatMap((m) => [m, m]);

  async function handleDemo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      work_email: String(fd.get("work_email") || "").trim(),
      company: String(fd.get("company") || "").trim(),
      role: String(fd.get("role") || "").trim() || null,
      team_size: String(fd.get("team_size") || "").trim() || null,
      message: String(fd.get("message") || "").trim() || null,
    };
    if (!payload.name || !payload.work_email || !payload.company) {
      toast.error("Name, work email, and company are required.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from("demo_requests" as never)
      .insert(payload as never);
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit. Try again or email hello@traceium.com");
      return;
    }
    toast.success("Thanks — our team will reach out within one business day.");
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={traceumIcon} alt="" width={28} height={22} decoding="async" fetchPriority="high" className="h-7 w-auto" />
            <img src={traceumWordmark} alt="Traceium" width={138} height={16} decoding="async" fetchPriority="high" className="h-4 w-auto" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <a href="#problem" className="hover:text-foreground">The problem</a>
            <a href="#platform" className="hover:text-foreground">Platform</a>
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#procurement" className="hover:text-foreground">Procurement</a>
            <a href="#demo" className="hover:text-foreground">Book a demo</a>
            <Link to="/free-guide" className="hover:text-foreground">Free guide</Link>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#demo"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Book a demo <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/60">
        <TheInfiniteGrid className="absolute inset-0" cellSize={96} accent="#2365FF" />
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-4 pt-10 pb-16 text-center sm:px-6 sm:pt-12 sm:pb-24 md:pt-16">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-info)]" />
            {c.hero_eyebrow}
          </div>

          {/* Heading */}
          <h1
            className="landing-heading mt-3 text-4xl tracking-tight text-foreground sm:text-5xl md:text-6xl"
          >
            {c.hero_title_top}
            <br />
            {c.hero_title_bottom}
          </h1>

          {/* Check marks between heading and subheader */}
          <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-compliant)]" /> Audit-ready compliance evidence</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-compliant)]" /> AS9100-aligned lot traceability</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-compliant)]" /> Engineer-first search</span>
          </div>

          {/* Subheader */}
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground whitespace-pre-line">
            {c.hero_body}
          </p>

          {/* CTA buttons */}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="#demo"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {c.hero_cta_primary} <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#platform"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-5 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
            >
              {c.hero_cta_secondary}
            </a>
          </div>

          {/* Video */}
          <div className="mt-8 w-full max-w-5xl">
            <div
              className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
              style={{ boxShadow: "0 30px 80px -30px oklch(0.55 0.15 250 / 0.35)" }}
            >
              <div className="flex items-center gap-1.5 border-b border-border/60 bg-secondary/50 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted" />
                <span className="ml-3 text-[11px] text-muted-foreground">app.traceium.com / engineer</span>
              </div>
              <div className="aspect-video w-full bg-black">
                <video
                  key={heroVideoUrl ?? "default"}
                  className="h-full w-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/landing-poster.svg"
                >
                  <source src={heroVideoUrl ?? "/traceium-demo.mp4"} type="video/mp4" />
                </video>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {c.hero_video_caption}
            </p>
          </div>
        </div>
      </section>

      {/* MANUFACTURER MARQUEE */}
      <section className="border-b border-border/60 bg-secondary/20 py-5 overflow-hidden">
        <div className="flex animate-marquee">
          {[...Array(2)].map((_: number, i: number) => (
            <div key={i} className="flex shrink-0 items-center gap-20 pr-20">
              {doubledSuppliers.map((m) => (
                <span key={`${i}-${m}`} className="whitespace-nowrap text-sm font-medium text-muted-foreground">{m}</span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* PROBLEM */}
      <section id="problem" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{c.problem_eyebrow}</p>
            <h2 className="landing-heading mt-3 text-3xl tracking-tight md:text-4xl">
              {c.problem_title}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground whitespace-pre-line">
              {c.problem_body}
            </p>
          </div>

          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              {
                t: "Engineers lose afternoons to PDF hunts",
                d: "You know the right material exists. Finding it means digging through PDFs, network shares, and a Slack to the one person who remembers — when the answer should take seconds.",
              },
              {
                t: "Procurement reorders blind, every program",
                d: "Buyers re-request the same quotes cycle after cycle, with no shared view of what engineering actually consumes, what's already on the shelf, or who the qualified second source is.",
              },
              {
                t: "Compliance is a scavenger hunt",
                d: "COA, COC, NASA E595, flame retardancy, REACH, ITAR — every audit becomes archaeology across emails, drives, and printed binders. Until it isn't.",
              },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-border/70 bg-card/60 p-6">
                <h3 className="landing-heading text-base text-foreground">{x.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLATFORM */}
      <section id="platform" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{c.platform_eyebrow}</p>
              <h2 className="landing-heading mt-3 text-3xl tracking-tight md:text-4xl">
                {c.platform_title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground whitespace-pre-line">
                {c.platform_body}
              </p>
              <div className="mt-8 space-y-3">
                {[
                  "Engineer-first search across 200+ qualified specs — answers in seconds",
                  "Inventory and master spec linked automatically — no double entry",
                  "Compliance evidence attached to every product — audit-ready by default",
                  "Procurement queue aggregated by vendor — one email, not ten",
                ].map((b) => (
                  <div key={b} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="mt-0.5 h-4 w-4 text-[var(--status-info)]" />
                    <span className="text-foreground">{b}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="md:col-span-7">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { i: Search, t: "Faceted spec search", d: "Filter 200+ aerospace materials by chemistry, cure, Tg, TML/CVCM, OOA, toughened, FR, dielectric." },
                  { i: Database, t: "Master spec catalog", d: "Vendor-agnostic canonical record with crossovers, applications, and qualification standards." },
                  { i: ShieldCheck, t: "Compliance built-in", d: "NASA E595, flame retardant, low-moisture, ITAR — surfaced on every product card and audit-ready." },
                  { i: ShoppingBasket, t: "Procurement workflow", d: "One-click 'Procure' aggregates by vendor and drafts the email to your contact list." },
                  { i: Layers, t: "Inventory linkage", d: "Live stock, lot/batch, out-life and freezer-life clocks tied to the same spec your engineer picked." },
                  { i: Workflow, t: "Vendor relationships", d: "Manage contact lists per vendor and log every outreach for procurement traceability." },
                ].map(({ i: Icon, t, d }) => (
                  <div key={t} className="rounded-xl border border-border/70 bg-card p-5">
                    <Icon className="h-5 w-5 text-[var(--status-info)]" />
                    <h3 className="landing-heading mt-3 text-sm text-foreground">{t}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — engineer-first */}
      <section id="features" className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{c.features_eyebrow}</p>
              <h2 className="landing-heading mt-3 text-3xl tracking-tight md:text-4xl">
                {c.features_title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground whitespace-pre-line">
                {c.features_body}
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  ["Multi-axis filters", "Narrow 200+ specs to a shortlist in under 10 seconds."],
                  ["Side-by-side compare", "Stack candidate adhesives or prepregs by the properties that actually matter."],
                  ["Compliance at a glance", "NASA E595, FR, low-moisture, ITAR surfaced on every row — no extra clicks."],
                  ["One-click procure", "Flag a material and your buyer sees it instantly — no email, no spreadsheet."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-compliant)]" />
                    <span><span className="text-foreground font-medium">{t}.</span> <span className="text-muted-foreground">{d}</span></span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:col-span-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Microscope className="h-3.5 w-3.5" /> Engineer search · live preview
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["Epoxy", "OOA-capable", "Tg ≥ 180°C", "CVCM < 0.1", "Toughened", "Henkel", "3M", "Hexcel"].map((c) => (
                    <span key={c} className="rounded-full border border-border/70 bg-secondary/60 px-2.5 py-0.5 text-[11px] text-foreground">{c}</span>
                  ))}
                </div>
                <div className="mt-5 space-y-2">
                  {[
                    ["EA 9396", "Henkel · Two-part epoxy", "compliant"],
                    ["AF 163-2K", "3M · Film adhesive", "compliant"],
                    ["EA 9394", "Henkel · Paste adhesive", "warning"],
                    ["HYSOL EA 9696", "Henkel · Film adhesive", "compliant"],
                  ].map(([n, v, s]) => (
                    <div key={n as string} className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-foreground">{n}</div>
                        <div className="text-xs text-muted-foreground">{v}</div>
                      </div>
                      <span
                        className="text-[11px] uppercase tracking-wider"
                        style={{
                          color:
                            s === "compliant"
                              ? "var(--status-compliant)"
                              : "var(--status-warning)",
                        }}
                      >
                        {s === "compliant" ? "qualified" : "review"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCUREMENT */}
      <section id="procurement" className="border-b border-border/60 bg-secondary/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="order-2 md:order-1 md:col-span-6">
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <ShoppingBasket className="h-3.5 w-3.5" /> Pick list · grouped by vendor
                  </div>
                  <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                    <Mail className="h-3 w-3" /> Procure (3)
                  </button>
                </div>
                <div className="mt-5 space-y-4">
                  {[
                    { v: "Henkel", items: ["EA 9396 — 2 kits", "EA 9394 — 1 kit", "EA 9696 — 5 sqft"] },
                    { v: "3M", items: ["AF 163-2K — 10 sqft"] },
                    { v: "Hexcel", items: ["HexPly 8552 — 20 sqft"] },
                  ].map((g) => (
                    <div key={g.v} className="rounded-md border border-border/60 bg-secondary/30 p-3">
                      <div className="text-sm font-semibold text-foreground">{g.v}</div>
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {g.items.map((it) => <li key={it}>· {it}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2 md:col-span-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{c.procurement_eyebrow}</p>
              <h2 className="landing-heading mt-3 text-3xl tracking-tight md:text-4xl">
                {c.procurement_title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground whitespace-pre-line">
                {c.procurement_body}
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  ["Aggregated by vendor", "One email per supplier — save hours every procurement cycle."],
                  ["Vendor contact directory", "Every rep, every vendor, in one place. No more inbox hunts."],
                  ["Audit-ready compliance", "Every cert and COA stays attached to the spec — pull evidence in one click."],
                  ["Outreach log", "Every send timestamped and traceable — for auditors and for you."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-compliant)]" />
                    <span><span className="text-foreground font-medium">{t}.</span> <span className="text-muted-foreground">{d}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SOCIAL PROOF / METRICS */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
          <div className="grid gap-8 md:grid-cols-4">
            {[
              ["6–10 hrs", "Saved per engineer, per week"],
              ["10x", "Faster spec selection than PDF hunting"],
              ["1 click", "From auditor question to compliance evidence"],
              ["200+", "Aerospace specs catalogued at launch"],
            ].map(([n, d]) => (
              <div key={d} className="rounded-xl border border-border/70 bg-card/60 p-6">
                <div className="text-4xl font-semibold tracking-tight text-foreground">{n}</div>
                <div className="mt-2 text-sm text-muted-foreground">{d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEMO FORM */}
      <section id="demo" className="border-b border-border/60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary/40 px-3 py-1 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-[var(--status-info)]" /> {c.demo_eyebrow}
              </div>
              <h2 className="landing-heading mt-5 text-3xl tracking-tight md:text-4xl">
                {c.demo_title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-muted-foreground whitespace-pre-line">
                {c.demo_body}
              </p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--status-compliant)]" /> No prep required</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--status-compliant)]" /> NDAs available on request</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-[var(--status-compliant)]" /> Pilot program available for design teams</li>
              </ul>
            </div>
            <div className="md:col-span-7">
              <form
                onSubmit={handleDemo}
                className="rounded-2xl border border-border bg-card p-6 md:p-8"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field name="name" label="Full name" placeholder="Jane Engineer" required />
                  <Field name="work_email" label="Work email" type="email" placeholder="jane@yourco.com" required />
                  <Field name="company" label="Company" placeholder="Acme Aerospace" required />
                  <Field name="role" label="Role" placeholder="Materials engineer" />
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Team size</label>
                    <select
                      name="team_size"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      defaultValue=""
                    >
                      <option value="">Select…</option>
                      <option>1–10</option>
                      <option>11–50</option>
                      <option>51–200</option>
                      <option>201–1000</option>
                      <option>1000+</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">What are you trying to solve?</label>
                    <textarea
                      name="message"
                      rows={4}
                      placeholder="e.g. We waste a week per program reconciling adhesive crossovers across 4 vendors."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? "Sending…" : (<>Book my demo <ArrowRight className="h-4 w-4" /></>)}
                </button>
                <p className="mt-3 text-xs text-muted-foreground">
                  We'll respond within one business day. No spam — ever.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-background">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={traceumIcon} alt="" className="h-6 w-auto" />
            <img src={traceumWordmark} alt="Traceium" className="h-3.5 w-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Traceium. Trace the data. Build the future.
          </p>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <a href="#demo" className="hover:text-foreground">Book a demo</a>
            <Link to="/free-guide" className="hover:text-foreground">Free guide</Link>
            <Link to="/login" className="hover:text-foreground">Log in</Link>
          </div>
        </div>
      </footer>
      <Link
        to="/pi"
        aria-label="·"
        title=""
        className="fixed bottom-3 right-3 z-50 text-muted-foreground/30 hover:text-foreground/80 transition-colors text-xs font-serif leading-none p-2 select-none"
      >
        π
      </Link>
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  placeholder,
  required,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-[var(--status-critical)]"> *</span>}
      </label>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
