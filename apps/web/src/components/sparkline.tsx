import { useEffect, useState } from "react";

interface Props {
  live?: boolean;
  seed?: number;
  width?: number;
  height?: number;
}

export function Sparkline({ live = false, seed = 0, width = 40, height = 10 }: Props) {
  const [bars, setBars] = useState<number[]>(() => {
    const a: number[] = [];
    for (let i = 0; i < 16; i++) a.push(2 + (Math.sin(i * 0.7 + seed) + 1) * 3);
    return a;
  });

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      setBars((prev) => {
        const next = prev.slice(1);
        next.push(2 + Math.random() * 7);
        return next;
      });
    }, 600);
    return () => clearInterval(id);
  }, [live]);

  return (
    <span className={"spark" + (live ? " live" : "")} style={{ width, height }}>
      {bars.map((h, i) => (
        <span key={i} style={{ height: live ? h : Math.min(h, 4) }} />
      ))}
    </span>
  );
}
