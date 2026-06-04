import { useEffect, useRef } from "react";

/**
 * Polling hook — calls `fn` every `intervalMs` milliseconds.
 * Automatically cleans up on unmount.
 * If `fn` returns a Promise, waits for it before scheduling next poll.
 */
export function usePolling(fn, intervalMs = 5000, deps = []) {
  const timerRef = useRef(null);
  const fnRef = useRef(fn);

  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      try {
        await fnRef.current();
      } catch {
        // Silent fail — polling should be resilient
      }
      if (mounted) {
        timerRef.current = setTimeout(tick, intervalMs);
      }
    };

    // Initial call
    tick();

    return () => {
      mounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
