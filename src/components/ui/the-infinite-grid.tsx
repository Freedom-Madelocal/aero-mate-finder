import { useRef, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useAnimationFrame,
} from "framer-motion";

interface Props {
  className?: string;
}

const CELL = 40;
const SPEED = 0.5;

export function TheInfiniteGrid({ className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(-1000);
  const mouseY = useMotionValue(-1000);
  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  useAnimationFrame(() => {
    gridOffsetX.set((gridOffsetX.get() + SPEED) % CELL);
    gridOffsetY.set((gridOffsetY.get() + SPEED) % CELL);
  });

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        mouseX.set(-1000);
        mouseY.set(-1000);
      } else {
        mouseX.set(x);
        mouseY.set(y);
      }
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, [mouseX, mouseY]);

  const backgroundPosition = useMotionTemplate`${gridOffsetX}px ${gridOffsetY}px`;
  const maskImage = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  const gridImage = `linear-gradient(to right, oklch(1 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.06) 1px, transparent 1px)`;
  const gridImageActive = `linear-gradient(to right, oklch(1 0 0 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.35) 1px, transparent 1px)`;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}
    >
      <motion.div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: gridImage,
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition,
          pointerEvents: "none",
        }}
      />
      <motion.div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: gridImageActive,
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition,
          maskImage,
          WebkitMaskImage: maskImage,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default TheInfiniteGrid;
