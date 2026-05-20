import { toast } from "sonner";

const GUIDES = [
  { icon: "⚗️", title: "Resin chemistry guide", subtitle: "Epoxy · BMI · Cyanate ester · Phenolic · Polyimide — when each chemistry wins." },
  { icon: "🌡️", title: "Temperature service ladder", subtitle: "Which chemistry survives where — from 120°C to 350°C+." },
  { icon: "📖", title: "Glossary", subtitle: "Tg · CAI · out-life · NCAMP · CVCM · DMA — plain English definitions." },
  { icon: "🛰️", title: "Space & satellite guide", subtitle: "Low Dk · outgassing · dimensional stability · radiation hardness." },
  { icon: "✈️", title: "Commercial aircraft guide", subtitle: "Primary structure · interiors · nacelles · fire safety." },
  { icon: "🚀", title: "Launch vehicle guide", subtitle: "Ablatives · cryogenic tanks · fairings · OoA materials." },
];

export default function Learn() {
  return (
    <>
      <div className="mx-auto w-full max-w-[1100px] px-5 py-6 space-y-5">
        <header className="space-y-1">
          <h1 className="text-[15px] font-semibold text-foreground">Learn</h1>
          <p className="text-[12px] text-muted-foreground">
            Technical guides, glossaries, and application deep-dives — built for aerospace engineers.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {GUIDES.map((g) => (
            <button
              key={g.title}
              onClick={() => toast("Guide coming soon — content is being authored.")}
              className="text-left rounded-[10px] p-[14px_16px] bg-card transition-colors"
              style={{ border: "0.5px solid var(--border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue-border)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              <div className="flex items-start gap-3">
                <span className="text-[24px] leading-none shrink-0">{g.icon}</span>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">{g.title}</p>
                  <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">{g.subtitle}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div
          className="rounded-[10px] p-[14px_16px] bg-card"
          style={{ border: "0.5px solid var(--accent-blue-border)" }}
        >
          <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>
            About the data
          </p>
          <p className="text-[12px] text-muted-foreground leading-snug">
            All product data in Traceium is sourced from publicly available OEM specifications and
            industry standards. Verify against current datasheets before final selection.
          </p>
        </div>
      </div>
    </>
  );
}
