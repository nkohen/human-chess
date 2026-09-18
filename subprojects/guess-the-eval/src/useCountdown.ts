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

/**
 * `endAt`, when given, is the absolute deadline (`Date.now()`-based) the caller is persisting for
 * this countdown across a reload (docs/design/2026-09-18-reload-survival.md: "Clocks persist an
 * absolute endAt/startAt"). The caller computes it once, the moment the clock starts (typically
 * `Date.now() + limitMs`), stores it alongside the rest of its snapshot, and passes the same
 * value back on every render — including the first render after a reload, read synchronously from
 * storage in the caller's state initialiser. Without `endAt` the hook computes and keeps its own
 * deadline the instant `running` turns true, exactly as before (the ephemeral case: nothing
 * persists this clock). Either way, a deadline already in the past — the tab was away long enough
 * for it to expire — fires `onExpire` immediately, on mount, rather than restarting a fresh
 * countdown: a reload never grants extra time.
 */
export function useCountdown(limitMs: number | undefined, running: boolean, onExpire: () => void, endAt?: number): CountdownState {
  const [remainingMs, setRemainingMs] = useState<number>(() => {
    if (limitMs === undefined) return Infinity;
    if (!running) return limitMs;
    return Math.max(0, (endAt ?? Date.now() + limitMs) - Date.now());
  });
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
    const end = endAt ?? Date.now() + limitMs;
    startRef.current = end - limitMs;
    const tick = (): void => {
      const left = Math.max(0, end - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick(); // synchronous: an `endAt` already passed (restored after the tab was away) expires
    // on this same mount instead of waiting for the first 100ms tick to notice.
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [running, limitMs, endAt]);

  const elapsedMs = limitMs === undefined ? 0 : Math.max(0, limitMs - remainingMs);
  const elapsedNowMs = (): number => (limitMs === undefined || !running ? elapsedMs : Math.min(limitMs, Math.max(0, Date.now() - startRef.current)));
  return { remainingMs, elapsedMs, elapsedNowMs };
}
