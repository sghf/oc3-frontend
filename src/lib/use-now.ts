import { useEffect, useState } from "react";

/**
 * The time it is, refreshed every `tickMs`: what is displayed by age moves on
 * while the page stays open, though the data does not change.
 */
export function useNow(tickMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, tickMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [tickMs]);
  return now;
}
