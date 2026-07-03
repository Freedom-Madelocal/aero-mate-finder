import { FileText } from "lucide-react";
import { openTdsPdf } from "@/components/TdsPdfViewer";

/**
 * Glassmorphic TDS PDF badge with a soft blue inner glow at the bottom
 * (Inner Shadow 1 style: y=-80 blur=60 spread=-30 #144CCD from the reference).
 * On hover, it swaps to a tighter Inner Shadow 4 (y=6 blur=6 spread=2 #2365FF)
 * and runs a liquid-metal ripple across the glass surface via an SVG
 * turbulence + displacement filter.
 */
export function TdsPdfBadge({ path, className = "" }: { path: string; className?: string }) {
  return (
    <>
      {/* Shared SVG filter (rendered once per badge is cheap and self-contained) */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
        <filter id="tds-liquid" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves="2" seed="7">
            <animate attributeName="baseFrequency" dur="6s" values="0.012 0.02;0.02 0.03;0.012 0.02" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="6" />
        </filter>
      </svg>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openTdsPdf(path);
        }}
        title="Open TDS PDF"
        className={`tds-glass-badge group relative inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-md ${className}`}
      >
        {/* Liquid sheen layer, animated on hover */}
        <span aria-hidden className="tds-glass-liquid" />
        <FileText className="w-3 h-3 relative z-10 text-[var(--accent-blue,#6694ff)]" />
        <span className="relative z-10 text-[var(--accent-blue,#6694ff)]">TDS PDF</span>
      </button>
    </>
  );
}
