import { useEffect, useRef } from "react";

/**
 * Spotlight — pointer-following vermilion glow with layered depth.
 *
 * Two stacked glow layers, each a fixed-size element with a baked-in
 * radial-gradient, positioned by `transform: translate3d` (GPU). CSS
 * transitions interpolate between mouse positions:
 *  - outer halo: 800px, slower easing (260ms) — wash of warmth
 *  - inner core: 360px, snappier (90ms) — the bright "head" that
 *    feels glued to the cursor
 *
 * The layered timing creates a parallax/3D illusion — the head leads
 * the halo by ~170ms, so quick mouse movements have a visible "comet
 * tail" feel without any JS animation loop.
 *
 * Uses requestAnimationFrame to coalesce mousemove events (don't update
 * style every event, only once per frame).
 */
export function Spotlight({ intensity = 0.5 }: { intensity?: number }) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const halo = haloRef.current;
    const core = coreRef.current;
    if (!halo || !core) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Start centered (or at the top-third for first paint)
    const initX = window.innerWidth * 0.5;
    const initY = window.innerHeight * 0.35;
    halo.style.transform = `translate3d(${initX - 400}px, ${initY - 400}px, 0)`;
    core.style.transform = `translate3d(${initX - 180}px, ${initY - 180}px, 0)`;

    if (reduced) return;

    let latestX = initX;
    let latestY = initY;
    let frameQueued = false;

    function onMove(e: MouseEvent) {
      latestX = e.clientX;
      latestY = e.clientY;
      if (!frameQueued) {
        frameQueued = true;
        requestAnimationFrame(apply);
      }
    }

    function apply() {
      frameQueued = false;
      if (halo) halo.style.transform = `translate3d(${latestX - 400}px, ${latestY - 400}px, 0)`;
      if (core) core.style.transform = `translate3d(${latestX - 180}px, ${latestY - 180}px, 0)`;
    }

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <>
      {/* outer halo — soft, slow */}
      <div
        ref={haloRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[3]"
        style={{
          width: 800,
          height: 800,
          background: `radial-gradient(circle, rgba(242,87,56,${intensity * 0.55}) 0%, rgba(242,87,56,${intensity * 0.18}) 22%, rgba(242,87,56,0.04) 48%, transparent 70%)`,
          mixBlendMode: "screen",
          willChange: "transform",
          transition: "transform 260ms cubic-bezier(0.2,0.7,0.2,1)",
        }}
      />
      {/* inner core — bright, snappy */}
      <div
        ref={coreRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[3]"
        style={{
          width: 360,
          height: 360,
          background: `radial-gradient(circle, rgba(242,87,56,${intensity * 0.85}) 0%, rgba(242,87,56,${intensity * 0.32}) 30%, transparent 65%)`,
          mixBlendMode: "screen",
          willChange: "transform",
          transition: "transform 90ms cubic-bezier(0.2,0.7,0.2,1)",
        }}
      />
    </>
  );
}
