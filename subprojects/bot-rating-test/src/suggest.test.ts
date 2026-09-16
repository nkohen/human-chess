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
  it('goes up 100 after a win', () => {
    expect(suggestNextElo(1800, 'won')).toBe(1900);
  });

  it('goes down 100 after a loss', () => {
    expect(suggestNextElo(1800, 'lost')).toBe(1700);
  });

  it('stays the same after a draw', () => {
    expect(suggestNextElo(1800, 'draw')).toBe(1800);
  });

  it('never suggests below MIN_ELO or above MAX_ELO', () => {
    expect(suggestNextElo(MIN_ELO, 'lost')).toBe(MIN_ELO);
    expect(suggestNextElo(MAX_ELO, 'won')).toBe(MAX_ELO);
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
    expect(suggestedStartingElo(records)).toBe(1900);
  });
});
