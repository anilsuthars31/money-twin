"use client";

import { useEffect, useRef, useState } from "react";

const format = (n: number, rupees: boolean) =>
  `${n < 0 ? "−" : ""}${rupees ? "₹" : ""}${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

const MAX_DURATION = 800; // ms: numbers never take longer than this to settle

/**
 * A number that counts from what's on screen to the new value in under a second. A plain
 * requestAnimationFrame loop: a new value cancels the old animation, so it can never lag behind.
 */
export function CountUp({
  value,
  from,
  rupees = true,
  className,
}: {
  value: number;
  from?: number; // start here on mount instead of at `value`
  rupees?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(from ?? value);
  // React renders the first value only; after that the effect writes the text directly.
  const [initial] = useState(from ?? value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = shown.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || start === value) {
      shown.current = value;
      el.textContent = format(value, rupees);
      return;
    }
    const duration = Math.min(MAX_DURATION, 300 + Math.abs(value - start) / 50);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      shown.current = start + (value - start) * eased;
      el.textContent = format(shown.current, rupees);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, rupees]);

  return (
    <span ref={ref} className={className}>
      {format(initial, rupees)}
    </span>
  );
}
