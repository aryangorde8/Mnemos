import { useScroll, useTransform, motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

/**
 * 3D scroll primitives — built on Framer Motion's useScroll/useTransform.
 * All effects are GPU-only (transform + opacity) and respect prefers-reduced-motion.
 */

interface ParallaxYProps {
  children: ReactNode;
  /** how much the layer moves over the full document scroll. negative = up, positive = down. */
  amount?: number;
  className?: string;
  style?: CSSProperties;
}

/** Page-wide parallax — element drifts opposite to scroll direction. */
export function ParallaxY({ children, amount = -80, className, style }: ParallaxYProps) {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1200], [0, amount]);
  return (
    <motion.div
      className={"parallax-layer " + (className ?? "")}
      style={{ y, ...style }}
    >
      {children}
    </motion.div>
  );
}

/** Element-relative parallax — drifts based on its own viewport position. */
export function ParallaxScroll({
  children,
  amount = -60,
  className,
  style,
}: ParallaxYProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [Math.abs(amount), -Math.abs(amount)]);
  return (
    <motion.div
      ref={ref}
      className={"parallax-layer " + (className ?? "")}
      style={{ y, ...style }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Tilt3D — pointer-tracking 3D tilt. Reads pointer position over the card,
 * maps to rotateX / rotateY in [-MAX, +MAX] degrees with spring smoothing.
 */
interface Tilt3DProps {
  children: ReactNode;
  max?: number;
  className?: string;
  style?: CSSProperties;
  /** lift on hover (translateZ in px) */
  lift?: number;
}

export function Tilt3D({ children, max = 6, className, style, lift = 12 }: Tilt3DProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const z = useMotionValue(0);
  const springX = useSpring(rotX, { stiffness: 220, damping: 22, mass: 0.4 });
  const springY = useSpring(rotY, { stiffness: 220, damping: 22, mass: 0.4 });
  const springZ = useSpring(z, { stiffness: 260, damping: 20, mass: 0.4 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    function onMove(e: MouseEvent) {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      // py 0 (top) → rotX +max ; py 1 (bottom) → rotX -max
      rotX.set((0.5 - py) * 2 * max);
      // px 0 (left) → rotY -max ; px 1 (right) → rotY +max
      rotY.set((px - 0.5) * 2 * max);
    }
    function onEnter() { z.set(lift); }
    function onLeave() {
      rotX.set(0);
      rotY.set(0);
      z.set(0);
    }

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [max, lift, rotX, rotY, z]);

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        rotateX: springX,
        rotateY: springY,
        translateZ: springZ,
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * AmbientOrbs — three drifting blurred orbs in vermilion/saffron/cocoa hues.
 * Combines a slow CSS keyframe drift with parallax-Y on scroll so they feel
 * lit from behind the type. Position absolutely inside a relative parent.
 */
export function AmbientOrbs() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1200], [0, -160]);
  const y2 = useTransform(scrollY, [0, 1200], [0, -90]);
  const y3 = useTransform(scrollY, [0, 1200], [0, 40]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <motion.div
        className="ambient-orb warm drift-slow"
        style={{ y: y1, width: 520, height: 520, top: -120, right: -120 }}
      />
      <motion.div
        className="ambient-orb saffron drift-med"
        style={{ y: y2, width: 380, height: 380, top: 320, left: -80 }}
      />
      <motion.div
        className="ambient-orb cocoa drift-slow"
        style={{ y: y3, width: 620, height: 620, bottom: -200, left: "30%" }}
      />
    </div>
  );
}

/**
 * ScrollReveal — fade-up that triggers when the element enters the viewport.
 * Different from Reveal in motion-primitives (which fires on mount). Use this
 * for content far down the page so the entrance is tied to scroll.
 */
export function ScrollReveal({
  children,
  className,
  style,
  amount = 24,
  duration = 0.6,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  amount?: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: amount }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px -10% 0px" }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
