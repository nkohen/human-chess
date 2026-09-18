// The one place that reads the wall clock for guess-the-eval's per-position timer; timing.ts's
// pure helpers do the arithmetic so they can be tested without fake timers. Ticks every 100ms
// (plenty for a thin bar and a whole-seconds readout) and calls `onExpire` exactly once per
// `running` span, guarded against firing twice while the caller's state update (which should
// flip `running` to false) propagates.
import { useEffect, useRef, useState } from 'react';

export interface CountdownState {
  /** Milliseconds left, clamped to [0, limitMs]; Infinity when there is no limit. */
  remainingMs: number;
  /** Milliseconds actually elapsed since `running` last turned true, as of the last 100ms tick;
   * 0 when there is no limit. Fine for display. */
  elapsedMs: number;
  /** The same measurement read from the clock right now rather than at the last tick, for a
   * lock-in that feeds another player's limit (PvP) so the hand-off is not quantised to the tick. */
  elapsedNowMs: () => number;
}

export function useCountdown(limitMs: number | undefined, running: boolean, onExpire: () => void): CountdownState {
  const [remainingMs, setRemainingMs] = useState<number>(limitMs ?? Infinity);
  const expiredRef = useRef(false);
  const startRef = useRef(0);
  // A ref, not a dependency: `onExpire` is typically a fresh closure every render, and this
  // effect must not restart the clock just because its identity changed.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!running || limitMs === undefined) {
      setRemainingMs(limitMs ?? Infinity);
      return;
    }
    expiredRef.current = false;
    startRef.current = Date.now();
    setRemainingMs(limitMs);
    const tick = (): void => {
      const left = Math.max(0, limitMs - (Date.now() - startRef.current));
      setRemainingMs(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [running, limitMs]);

  const elapsedMs = limitMs === undefined ? 0 : Math.max(0, limitMs - remainingMs);
  const elapsedNowMs = (): number => (limitMs === undefined || !running ? elapsedMs : Math.min(limitMs, Math.max(0, Date.now() - startRef.current)));
  return { remainingMs, elapsedMs, elapsedNowMs };
}
