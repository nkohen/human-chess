// @vitest-environment jsdom
// The reload-survival clock rule (docs/design/2026-09-18-reload-survival.md): a persisted `endAt`
// already in the past — the tab was away past the deadline — must be treated as expired on this
// same mount, not restarted with a fresh full-length countdown; one still in the future restores
// with the real remaining time.
import { renderHook } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCountdown } from './useCountdown';

describe('useCountdown with a persisted endAt', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('an endAt already in the past fires onExpire immediately and reads zero remaining', () => {
    const onExpire = vi.fn();
    const endAt = Date.now() - 5_000; // the clock ran out while the tab was away
    const { result, unmount: u } = renderHook(() => useCountdown(30_000, true, onExpire, endAt));
    unmount = u;
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.remainingMs).toBe(0);
  });

  it('an endAt still in the future restores with the real remaining time, not a fresh full limit', () => {
    const onExpire = vi.fn();
    const endAt = Date.now() + 10_000;
    const { result, unmount: u } = renderHook(() => useCountdown(30_000, true, onExpire, endAt));
    unmount = u;
    expect(onExpire).not.toHaveBeenCalled();
    // Restored remaining time is close to the real 10s left, never the full 30s limit.
    expect(result.current.remainingMs).toBeGreaterThan(9_000);
    expect(result.current.remainingMs).toBeLessThanOrEqual(10_000);
  });

  it('without a running clock, remaining time is the full limit regardless of endAt', () => {
    const onExpire = vi.fn();
    const { result, unmount: u } = renderHook(() => useCountdown(30_000, false, onExpire, Date.now() - 5_000));
    unmount = u;
    expect(onExpire).not.toHaveBeenCalled();
    expect(result.current.remainingMs).toBe(30_000);
  });

  it('fires onExpire exactly once even as ticks continue past expiry', async () => {
    vi.useFakeTimers();
    try {
      const onExpire = vi.fn();
      const endAt = Date.now() + 150;
      const { unmount: u } = renderHook(() => useCountdown(1_000, true, onExpire, endAt));
      unmount = u;
      await vi.advanceTimersByTimeAsync(600);
      expect(onExpire).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // React StrictMode (apps/web/src/main.tsx) deliberately double-invokes every effect
  // (mount -> cleanup -> mount) in development/test builds. Before firedEndRef replaced a simple
  // "have we fired" boolean, this double mount re-armed the same already-expired endAt and called
  // onExpire twice — the root cause of the SoloRound/PvpRound hot-loop bug
  // (see SoloRound.tsx/PvpRound.tsx's analysis-failure handling and the review it came from).
  it('under StrictMode double-invocation, an already-past endAt still fires onExpire exactly once', () => {
    const onExpire = vi.fn();
    const endAt = Date.now() - 5_000;
    const { result, unmount: u } = renderHook(() => useCountdown(30_000, true, onExpire, endAt), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    unmount = u;
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(result.current.remainingMs).toBe(0);
  });
});
