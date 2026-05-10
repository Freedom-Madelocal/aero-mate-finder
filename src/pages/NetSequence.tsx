import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import img1 from "@/assets/net/01-coderain.jpg";
import img2 from "@/assets/net/02-satellite.jpg";
import img3 from "@/assets/net/03-blueprint.jpg";
import img4 from "@/assets/net/04-radar.jpg";
import img5 from "@/assets/net/05-redacted.jpg";
import img6 from "@/assets/net/06-fingerprint.jpg";
import img7 from "@/assets/net/07-hexdump.jpg";
import img8 from "@/assets/net/08-servers.jpg";
import img9 from "@/assets/net/09-retina.jpg";
import img10 from "@/assets/net/10-composite.jpg";

const ALL = [img1, img2, img3, img4, img5, img6, img7, img8, img9, img10];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function NetSequence() {
  const navigate = useNavigate();
  const order = useMemo(() => {
    const s = shuffle(ALL);
    return [...s, ...shuffle(ALL).slice(0, 4)];
  }, []);
  const [idx, setIdx] = useState(0);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const baseDelay = reduce ? 600 : 180;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      navigate({ to: "/console" });
    };

    const tick = () => {
      if (i >= order.length) return finish();
      setIdx(i);
      setFlash(true);
      timer = setTimeout(() => setFlash(false), 30);
      const jitter = Math.floor(Math.random() * 90);
      const dur = baseDelay + jitter - (i > order.length - 5 ? 40 : 0);
      i += 1;
      timer = setTimeout(tick, dur);
    };
    tick();

    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("click", skip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("click", skip);
    };
  }, [order, navigate]);

  return (
    <div className="fixed inset-0 z-[9999] bg-black overflow-hidden cursor-none select-none">
      <img
        key={idx}
        src={order[idx]}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          filter: "contrast(1.1) saturate(1.15)",
          animation: "netGlitch 180ms steps(2, end)",
        }}
      />
      {/* scanlines */}
      <div
        className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0 2px, transparent 2px 4px)",
        }}
      />
      {/* vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.85) 100%)",
        }}
      />
      {/* white flash */}
      {flash && <div className="absolute inset-0 bg-white/15 pointer-events-none" />}
      {/* corner readout */}
      <div className="absolute top-4 left-4 font-mono text-[10px] text-green-400/70 tracking-widest">
        ▌ TRACEIUM // SECURE LINK ACTIVE
      </div>
      <div className="absolute bottom-4 right-4 font-mono text-[10px] text-green-400/70 tracking-widest">
        FRAME {String(idx + 1).padStart(3, "0")}/{String(order.length).padStart(3, "0")}
      </div>
      <div className="absolute bottom-4 left-4 font-mono text-[10px] text-white/40 tracking-widest">
        press any key to skip
      </div>

      <style>{`
        @keyframes netGlitch {
          0% { transform: translate(0,0) scale(1.02); filter: hue-rotate(0deg) contrast(1.1); }
          50% { transform: translate(-4px, 2px) scale(1.04); filter: hue-rotate(20deg) contrast(1.3); }
          100% { transform: translate(0,0) scale(1.02); filter: hue-rotate(0deg) contrast(1.1); }
        }
      `}</style>
    </div>
  );
}
