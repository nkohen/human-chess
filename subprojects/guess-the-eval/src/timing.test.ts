import { describe, expect, it } from 'vitest';
import {
  clampRemainingMs,
  DEFAULT_PVE_TIME_LIMIT,
  DEFAULT_PVP_TIME_LIMIT,
  PVP_SECOND_PLAYER_CUSHION_MS,
  pvpSecondPlayerLimitMs,
  secondsLeft,
} from './timing';

describe('pvpSecondPlayerLimitMs', () => {
  it('gives player 2 the full shared limit when player 1 used all of it', () => {
    expect(pvpSecondPlayerLimitMs(30, 30_000)).toBe(30_000);
  });

  it('caps player 2 at what player 1 used plus the cushion, when that is the smaller value', () => {
    expect(pvpSecondPlayerLimitMs(60, 5_000)).toBe(5_000 + PVP_SECOND_PLAYER_CUSHION_MS);
  });

  it('never exceeds the shared limit even with a generous cushion', () => {
    expect(pvpSecondPlayerLimitMs(15, 100_000)).toBe(15_000);
  });

  it('floors at the cushion alone when player 1 locked in instantly', () => {
    expect(pvpSecondPlayerLimitMs(30, 0)).toBe(PVP_SECOND_PLAYER_CUSHION_MS);
  });

  it('never goes negative for a (nonsensical) negative used time', () => {
    expect(pvpSecondPlayerLimitMs(30, -5_000)).toBe(PVP_SECOND_PLAYER_CUSHION_MS);
  });
});

describe('clampRemainingMs', () => {
  it('clamps negative remaining time to zero', () => {
    expect(clampRemainingMs(-500, 30_000)).toBe(0);
  });

  it('clamps remaining time above the limit down to the limit', () => {
    expect(clampRemainingMs(50_000, 30_000)).toBe(30_000);
  });

  it('leaves an in-range value alone', () => {
    expect(clampRemainingMs(12_345, 30_000)).toBe(12_345);
  });
});

describe('secondsLeft', () => {
  it('rounds up to whole seconds so the display never reads 0s while time remains', () => {
    expect(secondsLeft(1, 30_000)).toBe(1);
    expect(secondsLeft(1001, 30_000)).toBe(2);
  });

  it('reads 0 once no time remains', () => {
    expect(secondsLeft(0, 30_000)).toBe(0);
  });
});

describe('defaults', () => {
  it('defaults PvE to no clock and PvP to 30s', () => {
    expect(DEFAULT_PVE_TIME_LIMIT).toBe('none');
    expect(DEFAULT_PVP_TIME_LIMIT).toBe(30);
  });
});
