import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up from zero to its final value with an ease-out curve.
 * Used on the result page so the key figures read as "calculated" rather than
 * appearing instantly. Formatting stays the caller's responsibility, so the
 * exact same formatter renders the animated frames and the final value.
 *
 * Honors prefers-reduced-motion: the final value is shown immediately.
 * The component is only mounted with data on the client (the result page
 * renders a loader server-side), so no hydration mismatch can occur.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 1200,
  className,
}: {
  value: number;
  /** Same formatter used for the static value — every frame and the end state. */
  format: (v: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const rafRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
