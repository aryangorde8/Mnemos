import { useEffect, useRef } from "react";

/**
 * Spotlight — pointer-following vermilion glow, no transition lag.
 *
 * The previous version used CSS transitions for "smoothness" but during
 * scroll the transition queue would visibly trail the cursor by 100-260ms.
 * This version:
 *
 *  - tracks pointermove + mousemove + scroll (scroll re-applies the last
 *    known cursor position in case the page shifts under it)
 *  - sets transform directly inside the pointermove handler — the browser
 *    natively coalesces multiple events per frame, no manual RAF needed
 *  - zero CSS transitions, so the glow is glued to the cursor every paint
 *  - layered: a 320px bright core + a 720px soft halo, both moving in
 *    lockstep (no parallax delay — that was the source of the "gap")
 *  - high z-index above the constellation canvas + mix-blend-mode: screen
 *    so the glow lights up the page through whatever is below
 */
export function Spotlight({ intensity = 0.55 }: { intensity?: number }) {
  const haloRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const HALO_R = 360; // half-width
  const CORE_R = 160;

  useEffect(() => {
    const halo = haloRef.current;
    const core = coreRef.current;
    if (!halo || !core) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const startX = window.innerWidth * 0.5;
    const startY = Math.min(window.innerHeight * 0.4, 320);
    lastPos.current = { x: startX, y: startY };
    apply(startX, startY);

    if (reduced) return;

    function apply(x: number, y: number) {
      if (halo) halo.style.transform = `translate3d(${x - HALO_R}px, ${y - HALO_R}px, 0)`;
      if (core) core.style.transform = `translate3d(${x - CORE_R}px, ${y - CORE_R}px, 0)`;
    }

    function onMove(e: PointerEvent | MouseEvent) {
      lastPos.current = { x: e.clientX, y: e.clientY };
      apply(e.clientX, e.clientY);
    }

    function onScroll() {
      // re-apply with last known position so the glow stays under the cursor
      // even if the page jumps under it (e.g. layout shifts during scroll)
      apply(lastPos.current.x, lastPos.current.y);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <>
      {/* outer halo — soft warmth */}
      <div
        ref={haloRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[3]"
        style={{
          width: HALO_R * 2,
          height: HALO_R * 2,
          background: `radial-gradient(circle, rgba(242,87,56,${intensity * 0.42}) 0%, rgba(242,87,56,${intensity * 0.14}) 25%, rgba(242,87,56,0.03) 50%, transparent 70%)`,
          mixBlendMode: "screen",
          willChange: "transform",
        }}
      />
      {/* inner core — bright */}
      <div
        ref={coreRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[3]"
        style={{
          width: CORE_R * 2,
          height: CORE_R * 2,
          background: `radial-gradient(circle, rgba(242,87,56,${intensity * 0.9}) 0%, rgba(242,87,56,${intensity * 0.35}) 28%, transparent 65%)`,
          mixBlendMode: "screen",
          willChange: "transform",
        }}
      />
    </>
  );
}
