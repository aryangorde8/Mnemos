import { useEffect, useRef } from "react";

/**
 * Mouse-follow vermilion glow behind the hero. Pointer-events-none, low
 * opacity — adds depth without breaking the editorial type hierarchy.
 *
 * Renders into a fixed-position canvas-style div tracked via `requestAnimationFrame`
 * so it never reflows the page. On reduced-motion the glow stays centered.
 */
export function Spotlight({ intensity = 0.42 }: { intensity?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const target = useRef({ x: 0.5, y: 0.35 });
  const current = useRef({ x: 0.5, y: 0.35 });
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function onMove(e: MouseEvent) {
      target.current.x = e.clientX / window.innerWidth;
      target.current.y = e.clientY / window.innerHeight;
    }

    function tick() {
      // Lerp toward the target — smooth, no jitter.
      current.current.x += (target.current.x - current.current.x) * 0.06;
      current.current.y += (target.current.y - current.current.y) * 0.06;
      const xPct = (current.current.x * 100).toFixed(2);
      const yPct = (current.current.y * 100).toFixed(2);
      if (el) {
        el.style.background = `radial-gradient(600px circle at ${xPct}% ${yPct}%, rgba(232,74,53,${intensity}) 0%, rgba(232,74,53,0.08) 22%, transparent 60%)`;
      }
      rafId.current = requestAnimationFrame(tick);
    }

    if (!reduced) {
      window.addEventListener("mousemove", onMove, { passive: true });
      rafId.current = requestAnimationFrame(tick);
    } else if (el) {
      el.style.background = `radial-gradient(600px circle at 50% 35%, rgba(232,74,53,${intensity * 0.5}) 0%, transparent 60%)`;
    }

    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [intensity]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0"
      style={{
        mixBlendMode: "screen",
        opacity: 0.65,
        transition: "opacity 600ms ease",
      }}
    />
  );
}
