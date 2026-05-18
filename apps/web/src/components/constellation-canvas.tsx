import { useEffect, useRef } from "react";

/**
 * ConstellationCanvas — adapted from Mnemos-III design.
 *
 * A particle field of "stars" drawn on <canvas>:
 *  - stars cluster denser in the upper third (editorial composition bias)
 *  - hairlines connect k-nearest neighbours within ~120px
 *  - pointer gravity gently attracts stars within a 150px radius
 *  - auto-fires a vermilion "reasoning trace" every ~4.2s — a path of 6–8
 *    nearest hops drawn in vermilion with a glowing head
 *  - click anywhere to fire your own trace from the nearest star
 *
 * Pure 2D canvas, requestAnimationFrame loop, ResizeObserver-driven.
 * No deps beyond React. Respects prefers-reduced-motion (no auto-traces,
 * no pointer gravity, single render).
 */
export interface ConstellationCanvasProps {
  density?: number;          // multiplier on star count, default 1.0
  traceOn?: boolean;         // auto-fire periodic traces
  height?: number;           // CSS height in px
  /** when true (default), restrict density to upper portion of frame */
  editorialBias?: boolean;
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;        // star radius
  mag: number;      // brightness magnitude 0..1
  phase: number;    // twinkle phase
}

interface Link { i: number; j: number; }

interface Trace {
  path: number[];   // star indices
  t0: number;
  dur: number;
}

interface State {
  stars: Star[];
  links: Link[];
  mouse: { x: number; y: number };
  trace: Trace | null;
}

export function ConstellationCanvas({
  density = 1,
  traceOn = true,
  height = 480,
  editorialBias = true,
}: ConstellationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<State>({ stars: [], links: [], mouse: { x: -1000, y: -1000 }, trace: null });

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const parent = cvs.parentElement;
    if (!parent) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = window.devicePixelRatio || 1;

    function build(w: number, h: number) {
      const N = Math.floor(70 * density);
      const stars: Star[] = [];
      for (let i = 0; i < N; i++) {
        const yBias = editorialBias ? Math.pow(Math.random(), 1.3) : Math.random();
        stars.push({
          x: Math.random() * w,
          y: yBias * h * 0.85 + 20,
          vx: (Math.random() - 0.5) * 0.08,
          vy: (Math.random() - 0.5) * 0.08,
          r: 0.7 + Math.random() * 1.8,
          mag: Math.random(),
          phase: Math.random() * Math.PI * 2,
        });
      }
      const D = 120;
      const links: Link[] = [];
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i]!.x - stars[j]!.x;
          const dy = stars[i]!.y - stars[j]!.y;
          if (Math.hypot(dx, dy) < D) links.push({ i, j });
        }
      }
      stateRef.current.stars = stars;
      stateRef.current.links = links;
    }

    function resize() {
      if (!cvs || !parent) return;
      const w = parent.getBoundingClientRect().width;
      cvs.width = w * dpr;
      cvs.height = height * dpr;
      cvs.style.width = w + "px";
      cvs.style.height = height + "px";
      build(w, height);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    function onMove(e: MouseEvent) {
      if (!cvs) return;
      const r = cvs.getBoundingClientRect();
      stateRef.current.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onLeave() {
      stateRef.current.mouse = { x: -1000, y: -1000 };
    }
    function onClick(e: MouseEvent) {
      if (!cvs) return;
      const r = cvs.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const stars = stateRef.current.stars;
      if (stars.length === 0) return;
      let nearest = 0;
      let nd = Infinity;
      for (let i = 0; i < stars.length; i++) {
        const d = Math.hypot(stars[i]!.x - mx, stars[i]!.y - my);
        if (d < nd) { nd = d; nearest = i; }
      }
      const path = [nearest];
      const used = new Set<number>([nearest]);
      for (let step = 0; step < 7; step++) {
        const cur = stars[path[path.length - 1]!]!;
        let next = -1;
        let nd2 = Infinity;
        for (let i = 0; i < stars.length; i++) {
          if (used.has(i)) continue;
          const d = Math.hypot(stars[i]!.x - cur.x, stars[i]!.y - cur.y);
          if (d < nd2) { nd2 = d; next = i; }
        }
        if (next === -1) break;
        used.add(next);
        path.push(next);
      }
      stateRef.current.trace = { path, t0: performance.now(), dur: 2400 };
    }

    if (!reduced) {
      cvs.addEventListener("mousemove", onMove);
      cvs.addEventListener("mouseleave", onLeave);
      cvs.addEventListener("click", onClick);
    }

    let raf = 0;
    function loop(now: number) {
      if (!cvs) return;
      const ctx = cvs.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = cvs.width / dpr;
      const H = cvs.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const { stars, links, mouse, trace } = stateRef.current;

      if (!reduced) {
        // pointer gravity
        for (const s of stars) {
          const dx = mouse.x - s.x;
          const dy = mouse.y - s.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 22500) {
            const f = (1 - d2 / 22500) * 0.03;
            s.vx += dx * f * 0.002;
            s.vy += dy * f * 0.002;
          }
          s.vx *= 0.985;
          s.vy *= 0.985;
          s.x += s.vx;
          s.y += s.vy;
          s.phase += 0.004 + s.mag * 0.006;
        }
      }

      // hairlines
      for (const { i, j } of links) {
        const a = stars[i]!;
        const b = stars[j]!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 180) continue;
        const alpha = (1 - d / 180) * 0.18;
        ctx.strokeStyle = `rgba(108, 100, 90, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // stars
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(s.phase);
        ctx.beginPath();
        ctx.fillStyle = `rgba(243, 236, 223, ${0.35 + s.mag * 0.45 * tw})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // reasoning trace
      if (trace && traceOn && !reduced) {
        const elapsed = now - trace.t0;
        const prog = Math.min(1, elapsed / trace.dur);
        const segs = trace.path.length - 1;
        const segProg = prog * segs;
        ctx.strokeStyle = "#f25738";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        for (let k = 0; k < segs; k++) {
          const a = stars[trace.path[k]!];
          const b = stars[trace.path[k + 1]!];
          if (!a || !b) break;
          if (segProg >= k + 1) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          } else if (segProg > k) {
            const local = segProg - k;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local);
            break;
          } else {
            break;
          }
        }
        ctx.stroke();
        // glowing head
        const headIdx = trace.path[Math.min(Math.floor(segProg) + 1, segs)];
        const head = headIdx !== undefined ? stars[headIdx] : undefined;
        if (head) {
          ctx.fillStyle = "#f25738";
          ctx.beginPath();
          ctx.arc(head.x, head.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.strokeStyle = "rgba(242, 87, 56, 0.4)";
          ctx.lineWidth = 0.6;
          ctx.arc(head.x, head.y, 8 + 4 * Math.sin(now * 0.006), 0, Math.PI * 2);
          ctx.stroke();
        }
        if (prog >= 1) stateRef.current.trace = null;
      }

      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    // periodic auto-trace
    let traceTimer: ReturnType<typeof setInterval> | undefined;
    let kickoffTimer: ReturnType<typeof setTimeout> | undefined;
    if (traceOn && !reduced) {
      const fireTrace = () => {
        const stars = stateRef.current.stars;
        if (stars.length === 0) return;
        const start = Math.floor(Math.random() * stars.length);
        const path = [start];
        const used = new Set<number>([start]);
        for (let step = 0; step < 6 + Math.floor(Math.random() * 3); step++) {
          const cur = stars[path[path.length - 1]!]!;
          let next = -1;
          let nd2 = Infinity;
          for (let i = 0; i < stars.length; i++) {
            if (used.has(i)) continue;
            const d = Math.hypot(stars[i]!.x - cur.x, stars[i]!.y - cur.y);
            if (d < nd2 && d < 200) { nd2 = d; next = i; }
          }
          if (next === -1) break;
          used.add(next);
          path.push(next);
        }
        stateRef.current.trace = { path, t0: performance.now(), dur: 2600 };
      };
      traceTimer = setInterval(fireTrace, 4200);
      kickoffTimer = setTimeout(fireTrace, 800);
    }

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (traceTimer) clearInterval(traceTimer);
      if (kickoffTimer) clearTimeout(kickoffTimer);
      cvs.removeEventListener("mousemove", onMove);
      cvs.removeEventListener("mouseleave", onLeave);
      cvs.removeEventListener("click", onClick);
    };
  }, [density, traceOn, height, editorialBias]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ display: "block", width: "100%", height: height + "px", cursor: "crosshair" }}
    />
  );
}
