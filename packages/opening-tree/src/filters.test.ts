import { describe, expect, it } from 'vitest';
import { matchesFilter, type GameFilter } from './filters';
import type { TrackedGame } from './tree';

/** A TrackedGame with sensible defaults, overridable per test — TrackedGame is a plain data
 * shape (no chess rules involved), so there's no need to round-trip through a PGN here. */
function game(overrides: Partial<TrackedGame> = {}): TrackedGame {
  return {
    index: 0,
    url: undefined,
    playedAt: '2026-06-15T12:00:00Z',
    opponent: 'someOpponent',
    opponentRating: 1600,
    result: 'win',
    source: 'lichess',
    speed: 'blitz',
    rated: true,
    eco: 'C50',
    openingName: 'Italian Game',
    ...overrides,
  };
}

function passes(g: TrackedGame, filter: GameFilter): boolean {
  return matchesFilter(g, filter);
}

describe('matchesFilter', () => {
  it('passes everything when the filter has no fields set', () => {
    expect(passes(game(), {})).toBe(true);
    expect(passes(game({ speed: undefined, rated: undefined, opponentRating: undefined }), {})).toBe(true);
  });

  describe('speeds', () => {
    it('matches a listed speed and rejects an unlisted one', () => {
      expect(passes(game({ speed: 'blitz' }), { speeds: ['blitz', 'bullet'] })).toBe(true);
      expect(passes(game({ speed: 'rapid' }), { speeds: ['blitz', 'bullet'] })).toBe(false);
    });

    it('rejects a game with no speed once the filter sets one', () => {
      expect(passes(game({ speed: undefined }), { speeds: ['blitz'] })).toBe(false);
    });
  });

  describe('rated', () => {
    it('matches the exact rated flag', () => {
      expect(passes(game({ rated: true }), { rated: true })).toBe(true);
      expect(passes(game({ rated: false }), { rated: true })).toBe(false);
    });

    it('rejects a game with no rated flag once the filter sets one', () => {
      expect(passes(game({ rated: undefined }), { rated: true })).toBe(false);
    });
  });

  describe('opponentRatingMin/Max', () => {
    it('accepts a rating within [min, max], inclusive', () => {
      expect(passes(game({ opponentRating: 1600 }), { opponentRatingMin: 1600, opponentRatingMax: 1600 })).toBe(true);
      expect(passes(game({ opponentRating: 1599 }), { opponentRatingMin: 1600 })).toBe(false);
      expect(passes(game({ opponentRating: 1601 }), { opponentRatingMax: 1600 })).toBe(false);
    });

    it('rejects a game with no opponent rating once either bound is set', () => {
      expect(passes(game({ opponentRating: undefined }), { opponentRatingMin: 1000 })).toBe(false);
      expect(passes(game({ opponentRating: undefined }), { opponentRatingMax: 2000 })).toBe(false);
    });
  });

  describe('opponent', () => {
    it('matches a case-insensitive substring', () => {
      expect(passes(game({ opponent: 'MagnusCarlsen' }), { opponent: 'carlsen' })).toBe(true);
      expect(passes(game({ opponent: 'MagnusCarlsen' }), { opponent: 'hikaru' })).toBe(false);
    });

    it('rejects a game with no recorded opponent once the filter sets one', () => {
      expect(passes(game({ opponent: undefined }), { opponent: 'carlsen' })).toBe(false);
    });

    it('an empty/whitespace opponent filter is treated as unset', () => {
      expect(passes(game({ opponent: undefined }), { opponent: '  ' })).toBe(true);
    });
  });

  describe('since/until', () => {
    it('is inclusive at the boundary instant', () => {
      const g = game({ playedAt: '2026-06-15T12:00:00Z' });
      expect(passes(g, { since: '2026-06-15T12:00:00Z' })).toBe(true);
      expect(passes(g, { until: '2026-06-15T12:00:00Z' })).toBe(true);
      expect(passes(g, { since: '2026-06-15T12:00:01Z' })).toBe(false);
      expect(passes(g, { until: '2026-06-15T11:59:59Z' })).toBe(false);
    });

    it('rejects a game with no playedAt once either bound is set', () => {
      expect(passes(game({ playedAt: undefined }), { since: '2026-01-01' })).toBe(false);
      expect(passes(game({ playedAt: undefined }), { until: '2026-12-31' })).toBe(false);
    });

    it('rejects rather than silently passing on a malformed date (Date.parse -> NaN)', () => {
      // NaN < x and NaN > x are both always false, so without an explicit NaN check a malformed
      // since/until/playedAt would silently pass instead of being excluded as "unknown".
      const g = game({ playedAt: '2026-06-15T12:00:00Z' });
      expect(passes(g, { since: 'not-a-real-date' })).toBe(false);
      expect(passes(g, { until: 'not-a-real-date' })).toBe(false);
      expect(passes(game({ playedAt: 'also-not-a-date' }), { since: '2026-01-01' })).toBe(false);
      expect(passes(game({ playedAt: 'also-not-a-date' }), { until: '2026-12-31' })).toBe(false);
    });
  });

  describe('sources', () => {
    it('matches a listed source and rejects an unlisted one', () => {
      expect(passes(game({ source: 'chess.com' }), { sources: ['lichess', 'chess.com'] })).toBe(true);
      expect(passes(game({ source: 'pgn' }), { sources: ['lichess', 'chess.com'] })).toBe(false);
    });
  });

  it('requires every set field to match (AND, not OR)', () => {
    const g = game({ speed: 'blitz', rated: true, opponentRating: 1600 });
    expect(passes(g, { speeds: ['blitz'], rated: true, opponentRatingMin: 1500 })).toBe(true);
    expect(passes(g, { speeds: ['blitz'], rated: false })).toBe(false);
  });
});
