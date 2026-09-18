// Pure timing helpers for guess-the-eval's optional per-position clock (PvE) and its always-on
// clock (PvP). No React, no Date.now() — useCountdown.ts is the one place that reads the wall
// clock; keeping the arithmetic here lets it be tested without fake timers.

/** PvE's four choices: no clock, or a fixed number of seconds per position. */
export type PveTimeLimit = 'none' | TimeLimitSec;
export type TimeLimitSec = 15 | 30 | 60;

export const PVE_TIME_LIMITS: PveTimeLimit[] = ['none', 15, 30, 60];
// PvP is always timed (interview: memory/subprojects/guess-the-eval.md); no 'none' option.
export const PVP_TIME_LIMITS: TimeLimitSec[] = [15, 30, 60];

// First-guess defaults (not researched), per the interview: PvE defaults to no clock, PvP
// defaults to 30s since it is always timed and needs *some* starting value.
export const DEFAULT_PVE_TIME_LIMIT: PveTimeLimit = 'none';
export const DEFAULT_PVP_TIME_LIMIT: TimeLimitSec = 30;

/**
 * Extra time (ms) player 2 gets on top of what player 1 actually used. The interview's
 * GeoGuessr rule — "once one player locks in, the other gets a short countdown" — needs
 * simultaneous play and isn't buildable pass-and-play on one device (there's no second screen
 * to start a countdown on while player 1 is still answering). This cushion is the stand-in,
 * recorded as a decision in memory/subprojects/guess-the-eval.md: a first guess, not researched.
 */
export const PVP_SECOND_PLAYER_CUSHION_MS = 10_000;

/**
 * Player 2's actual time limit (ms) for one PvP position: the shared per-position limit, or —
 * when player 1 finished faster than that — player 1's real elapsed time plus the fixed
 * cushion, whichever is smaller. `firstPlayerUsedMs` must be a real measured duration (A1: never
 * an invented number), not an estimate; a caller that hasn't measured it yet has nothing to pass
 * here.
 */
export function pvpSecondPlayerLimitMs(limitSec: TimeLimitSec, firstPlayerUsedMs: number): number {
  const limitMs = limitSec * 1000;
  const cushioned = Math.max(0, firstPlayerUsedMs) + PVP_SECOND_PLAYER_CUSHION_MS;
  return Math.min(limitMs, cushioned);
}

/** Clamps a remaining-time reading into [0, limitMs] — a countdown can briefly read slightly
 * over the limit right after it starts (state set before the first tick) or under zero a tick
 * after expiry; display and scoring both want the clamped value. */
export function clampRemainingMs(remainingMs: number, limitMs: number): number {
  return Math.max(0, Math.min(limitMs, remainingMs));
}

/** Whole seconds left, rounded up so the countdown never shows "0s" while any time remains. */
export function secondsLeft(remainingMs: number, limitMs: number): number {
  return Math.ceil(clampRemainingMs(remainingMs, limitMs) / 1000);
}
