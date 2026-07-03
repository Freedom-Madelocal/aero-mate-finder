import { useRef } from "react";
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

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const handleMouseLeave = () => {
    mouseX.set(-1000);
    mouseY.set(-1000);
  };

  const backgroundPosition = useMotionTemplate`${gridOffsetX}px ${gridOffsetY}px`;
  const maskImage = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  const gridImage = `linear-gradient(to right, oklch(1 0 0 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.06) 1px, transparent 1px)`;
  const gridImageActive = `linear-gradient(to right, oklch(1 0 0 / 0.35) 1px, transparent 1px), linear-gradient(to bottom, oklch(1 0 0 / 0.35) 1px, transparent 1px)`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
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
