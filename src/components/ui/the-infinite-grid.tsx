import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface Props {
  className?: string;
  cellSize?: number;
  /** Accent color used for the hovered-cell glow. */
  accent?: string;
  /** Base line color for the always-visible grid. */
  lineColor?: string;
}

/**
 * Infinite Grid — inspired by 21st.dev/@shadway/the-infinite-grid.
 * A slowly drifting grid; the cell under the cursor lights up with an
 * accent glow (corner-anchored) and a soft outline.
 */
export function TheInfiniteGrid({
  className,
  cellSize = 96,
  accent = "#2365FF",
  lineColor = "oklch(1 0 0 / 0.05)",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [cell, setCell] = useState<{ x: number; y: number } | null>(null);

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCell({
        x: Math.floor(x / cellSize) * cellSize,
        y: Math.floor(y / cellSize) * cellSize,
      });
    },
    [cellSize],
  );

  const handleLeave = useCallback(() => setCell(null), []);

  // Inject the drift keyframes once.
  useEffect(() => {
    const id = "the-infinite-grid-keyframes";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes tig-drift { from { transform: translate3d(0,0,0); } to { transform: translate3d(-${cellSize}px, -${cellSize}px, 0); } }`;
    document.head.appendChild(style);
  }, [cellSize]);

  const gridImage = `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`;

  return (
    <div
      ref={containerRef}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {/* Base static grid */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: gridImage,
          backgroundSize: `${cellSize}px ${cellSize}px`,
          pointerEvents: "none",
        }}
      />
      {/* Drifting grid layer for the infinite scroll feel */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: `-${cellSize}px`,
          backgroundImage: gridImage,
          backgroundSize: `${cellSize}px ${cellSize}px`,
          opacity: 0.6,
          animation: reduce ? undefined : `tig-drift 40s linear infinite`,
          pointerEvents: "none",
        }}
      />

      {/* Hovered cell highlight */}
      {cell && (
        <motion.div
          aria-hidden
          initial={false}
          animate={{ x: cell.x, y: cell.y, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 350, damping: 32, mass: 0.6, opacity: { duration: 0.15 } }
          }
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: cellSize,
            height: cellSize,
            pointerEvents: "none",
            borderRadius: 2,
            border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`,
            background: `radial-gradient(60% 55% at 8% 100%, color-mix(in srgb, ${accent} 65%, transparent), transparent 70%), radial-gradient(60% 55% at 92% 100%, color-mix(in srgb, ${accent} 65%, transparent), transparent 70%), linear-gradient(to top, color-mix(in srgb, ${accent} 22%, transparent), transparent 60%)`,
            boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent), 0 0 24px color-mix(in srgb, ${accent} 35%, transparent), inset 0 -14px 24px -8px color-mix(in srgb, ${accent} 55%, transparent)`,
          }}
        />
      )}
    </div>
  );
}

export default TheInfiniteGrid;
