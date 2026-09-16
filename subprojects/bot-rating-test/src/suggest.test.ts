import { describe, expect, it } from 'vitest';
import type { BotRatingRecord } from './records';
import { ELO_LEVELS, MAX_ELO, MIN_ELO, clampElo, suggestNextElo, suggestedStartingElo } from './suggest';

function record(overrides: Partial<BotRatingRecord>): BotRatingRecord {
  return {
    id: 'x',
    playedAt: '2026-01-01T00:00:00.000Z',
    opponentId: 'limited-strength-1800',
    elo: 1800,
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playerColor: 'white',
    result: 'won',
    moves: [],
    source: 'bot-rating-test',
    ...overrides,
  };
}

describe('ELO_LEVELS', () => {
  it('starts at MIN_ELO and ends exactly at MAX_ELO', () => {
    expect(ELO_LEVELS[0]).toBe(MIN_ELO);
    expect(ELO_LEVELS[ELO_LEVELS.length - 1]).toBe(MAX_ELO);
  });

  it('steps by 100 except possibly the final entry', () => {
    for (let i = 1; i < ELO_LEVELS.length - 1; i++) {
      expect(ELO_LEVELS[i]! - ELO_LEVELS[i - 1]!).toBe(100);
    }
  });
});

describe('clampElo', () => {
  it('clamps below MIN_ELO and above MAX_ELO', () => {
    expect(clampElo(0)).toBe(MIN_ELO);
    expect(clampElo(10_000)).toBe(MAX_ELO);
    expect(clampElo(1800)).toBe(1800);
  });
});

describe('suggestNextElo', () => {
  // 1820 (not 1800) is used here because it is itself one of ELO_LEVELS' values (1320 stepping
  // by 100); suggestNextElo steps through ELO_LEVELS' own indices, so a non-level input like
  // 1800 is only meaningful through the closest-level fallback exercised separately below.
  it('goes up one ELO_LEVELS step after a win', () => {
    expect(suggestNextElo(1820, 'won')).toBe(1920);
  });

  it('goes down one ELO_LEVELS step after a loss', () => {
    expect(suggestNextElo(1820, 'lost')).toBe(1720);
  });

  it('stays the same after a draw', () => {
    expect(suggestNextElo(1820, 'draw')).toBe(1820);
  });

  it('falls back to the closest ELO_LEVELS entry for a value that is not itself a level', () => {
    // 1800 is not a level (closest are 1720 and 1820); closest is 1820, so a win steps up from
    // there to 1920, same as suggestNextElo(1820, 'won') above.
    expect(suggestNextElo(1800, 'won')).toBe(1920);
  });

  it('never suggests below MIN_ELO or above MAX_ELO', () => {
    expect(suggestNextElo(MIN_ELO, 'lost')).toBe(MIN_ELO);
    expect(suggestNextElo(MAX_ELO, 'won')).toBe(MAX_ELO);
  });

  it('always returns a value that is itself one of ELO_LEVELS, even from the short final step', () => {
    // MAX_ELO (3190) is only 70 above the level below it (3120), not the usual 100: a flat
    // ±100 offset from MAX_ELO would land on 3090, which ELO_LEVELS does not contain.
    const secondToLast = ELO_LEVELS[ELO_LEVELS.length - 2]!;
    expect(suggestNextElo(MAX_ELO, 'lost')).toBe(secondToLast);
    expect(ELO_LEVELS).toContain(suggestNextElo(MAX_ELO, 'lost'));
  });
});

describe('suggestedStartingElo', () => {
  it('defaults to MIN_ELO with no history', () => {
    expect(suggestedStartingElo([])).toBe(MIN_ELO);
  });

  it('follows the suggestion for the most recently played record', () => {
    const records = [
      record({ elo: 1500, result: 'won', playedAt: '2026-01-01T00:00:00.000Z' }),
      record({ elo: 2000, result: 'lost', playedAt: '2026-01-03T00:00:00.000Z' }),
      record({ elo: 1800, result: 'won', playedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    // Most recent by playedAt is elo 2000 (not itself an ELO_LEVELS value), lost: steps down one
    // level from the closest ELO_LEVELS entry (2020) to 1920.
    expect(suggestedStartingElo(records)).toBe(1920);
  });
});
