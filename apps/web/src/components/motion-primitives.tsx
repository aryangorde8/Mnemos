import { motion, type Variants } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";

/**
 * Shared Framer Motion primitives tuned to the Mnemos editorial brand:
 *   - Easing always "ease-out-quart" (snappy in, calm out)
 *   - Durations 280–520ms (faster than the default 400, slower than feels-cheap)
 *   - Stagger 60–80ms between siblings (reads as "ordered prose," not "decoration")
 *   - Reduced-motion fallback handled by Framer automatically when MotionConfig wraps the app
 */

const QUART_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
const SPRING_SOFT = { type: "spring" as const, stiffness: 220, damping: 26, mass: 0.6 };

export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.52, ease: QUART_OUT },
  },
};

export const fadeRiseTight: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.36, ease: QUART_OUT },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -14 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.36, ease: QUART_OUT },
  },
};

export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: {
    transition: {
      staggerChildren: gap,
      delayChildren: delay,
    },
  },
});

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: SPRING_SOFT },
};

/**
 * Words component — splits a string into per-word motion children, rising
 * sequentially. Use for hero headlines. Each word gets its own delay so a
 * 3-line headline reads as a deliberate reveal, not a wall.
 */
interface WordsProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  /** delay between word entries (s) */
  gap?: number;
  /** delay before the first word (s) */
  delay?: number;
  /** wrap in italic display style */
  italic?: boolean;
}

export function Words({ text, className, style, gap = 0.04, delay = 0, italic }: WordsProps) {
  const words = text.split(/\s+/);
  return (
    <motion.span
      className={className}
      style={{ display: "inline-block", ...style }}
      variants={stagger(gap, delay)}
      initial="hidden"
      animate="show"
    >
      {words.map((w, i) => (
        <motion.span
          key={i}
          variants={fadeRiseTight}
          style={{
            display: "inline-block",
            marginRight: "0.28em",
            ...(italic ? { fontStyle: "italic" } : {}),
          }}
        >
          {w}
        </motion.span>
      ))}
    </motion.span>
  );
}

/**
 * Drawline — a horizontal accent rule that "draws" from left to right
 * on mount. Used for hero kickers, card top accents, section breaks.
 */
export function Drawline({
  width = 40,
  height = 1,
  color = "var(--color-vermilion)",
  delay = 0,
  duration = 0.6,
}: {
  width?: number | string;
  height?: number;
  color?: string;
  delay?: number;
  duration?: number;
}) {
  return (
    <motion.span
      aria-hidden
      style={{
        display: "inline-block",
        width,
        height,
        background: color,
        transformOrigin: "left center",
      }}
      initial={{ scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={{ duration, delay, ease: QUART_OUT }}
    />
  );
}

/**
 * Reveal — wraps any block with the fadeRise variant. Use for sections that
 * should animate on first appearance.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
  variant = "fadeRise",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  variant?: "fadeRise" | "fadeRiseTight" | "slideInLeft" | "scaleIn";
}) {
  const map: Record<string, Variants> = {
    fadeRise,
    fadeRiseTight,
    slideInLeft,
    scaleIn,
  };
  return (
    <motion.div
      className={className}
      style={style}
      variants={map[variant] ?? fadeRise}
      initial="hidden"
      animate="show"
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}
