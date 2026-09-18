import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTER_STATE,
  endOfDayIso,
  formatLastPlayed,
  formatSkippedBreakdown,
  parseFilterState,
  pathFromSanLine,
  pathKey,
  pathToUcis,
  serializeFilterState,
  sourceKey,
  wdlPercents,
} from './treeHelpers';

describe('pathToUcis', () => {
  it('flattens a path of edges to its ucis, in order', () => {
    expect(pathToUcis([{ uci: 'e2e4' }, { uci: 'e7e5' }, { uci: 'g1f3' }])).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('returns [] for an empty path', () => {
    expect(pathToUcis([])).toEqual([]);
  });
});

describe('pathKey', () => {
  it('joins ucis with a space', () => {
    expect(pathKey([{ uci: 'g1f3' }, { uci: 'g8f6' }])).toBe('g1f3 g8f6');
  });

  it('is the empty string for the root (empty path)', () => {
    expect(pathKey([])).toBe('');
  });

  it('gives a different key to two paths that reach the same position by different move orders', () => {
    // 1.Nf3 Nf6 2.Ng1 Ng8 3.e4 e5 returns to the starting EPD, but by a different path than the
    // empty path that also reaches it — this is exactly the case MoveTree's cycle guard relies on
    // pathKey to distinguish, so expanding one occurrence never looks like the other is already
    // expanded.
    const start: Array<{ uci: string }> = [];
    const cycledBack = [{ uci: 'g1f3' }, { uci: 'g8f6' }, { uci: 'g1g1' }, { uci: 'g8g8' }, { uci: 'e2e4' }, { uci: 'e7e5' }];
    expect(pathKey(start)).not.toBe(pathKey(cycledBack));
  });
});

describe('pathFromSanLine', () => {
  interface Edge {
    san: string;
    to: string;
  }
  const tree: Record<string, Edge[]> = {
    root: [{ san: 'e4', to: 'a' }, { san: 'd4', to: 'b' }],
    a: [{ san: 'e5', to: 'c' }],
    c: [{ san: 'Nf3', to: 'd' }],
  };
  const childrenAt = (epd: string): Edge[] => tree[epd] ?? [];

  it('walks a matching SAN line all the way down', () => {
    const path = pathFromSanLine('root', childrenAt, ['e4', 'e5', 'Nf3']);
    expect(path.map(e => e.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(path[path.length - 1]!.to).toBe('d');
  });

  it('stops at the first SAN with no matching child', () => {
    const path = pathFromSanLine('root', childrenAt, ['e4', 'Bc4']);
    expect(path.map(e => e.san)).toEqual(['e4']);
  });

  it('returns [] for an empty line', () => {
    expect(pathFromSanLine('root', childrenAt, [])).toEqual([]);
  });

  it('returns [] when the very first SAN does not match', () => {
    expect(pathFromSanLine('root', childrenAt, ['Nf3'])).toEqual([]);
  });
});

describe('endOfDayIso', () => {
  it('returns the end of the given UTC day', () => {
    expect(endOfDayIso('2026-09-01')).toBe('2026-09-01T23:59:59.999Z');
  });

  it('returns undefined for an empty string', () => {
    expect(endOfDayIso('')).toBeUndefined();
  });

  it('returns undefined for an unparseable date', () => {
    expect(endOfDayIso('not-a-date')).toBeUndefined();
  });
});

describe('formatLastPlayed', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');

  it('returns an em dash for undefined', () => {
    expect(formatLastPlayed(undefined, now)).toBe('—');
  });

  it('returns an em dash for an unparseable instant', () => {
    expect(formatLastPlayed('garbage', now)).toBe('—');
  });

  it('formats minutes, hours, days, months ago', () => {
    expect(formatLastPlayed(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5m ago');
    expect(formatLastPlayed(new Date(now - 5 * 3_600_000).toISOString(), now)).toBe('5h ago');
    expect(formatLastPlayed(new Date(now - 5 * 86_400_000).toISOString(), now)).toBe('5d ago');
    expect(formatLastPlayed(new Date(now - 60 * 86_400_000).toISOString(), now)).toBe('2mo ago');
  });

  it('falls back to a plain date once over a year old', () => {
    expect(formatLastPlayed('2020-01-01T00:00:00Z', now)).toBe('2020-01-01');
  });

  it('falls back to a plain date for a future instant', () => {
    expect(formatLastPlayed('2030-01-01T00:00:00Z', now)).toBe('2030-01-01');
  });
});

describe('filter state serialisation', () => {
  it('round-trips a fully-populated state', () => {
    const state = {
      speeds: ['blitz', 'rapid'] as const,
      rated: 'rated' as const,
      opponentRatingMin: 1500,
      opponentRatingMax: 2000,
      opponent: 'Nadav',
      since: '2026-01-01',
      until: '2026-09-01',
      sourceKeys: ['lichess:nkohen'],
    };
    expect(parseFilterState(serializeFilterState({ ...state, speeds: [...state.speeds] }))).toEqual({ ...state, speeds: [...state.speeds] });
  });

  it('defaults on null/undefined/empty input', () => {
    expect(parseFilterState(null)).toEqual(DEFAULT_FILTER_STATE);
    expect(parseFilterState(undefined)).toEqual(DEFAULT_FILTER_STATE);
    expect(parseFilterState('')).toEqual(DEFAULT_FILTER_STATE);
  });

  it('defaults on unparseable JSON', () => {
    expect(parseFilterState('not json')).toEqual(DEFAULT_FILTER_STATE);
  });

  it('drops an unrecognised speed but keeps the rest', () => {
    const raw = JSON.stringify({ ...DEFAULT_FILTER_STATE, speeds: ['blitz', 'made-up'] });
    expect(parseFilterState(raw).speeds).toEqual(['blitz']);
  });

  it('falls back field-by-field when one field has the wrong type', () => {
    const raw = JSON.stringify({ ...DEFAULT_FILTER_STATE, rated: 42, opponent: 'kept' });
    const parsed = parseFilterState(raw);
    expect(parsed.rated).toBe('all');
    expect(parsed.opponent).toBe('kept');
  });
});

describe('wdlPercents', () => {
  it('computes percentages of the total', () => {
    expect(wdlPercents({ wins: 5, draws: 3, losses: 2 })).toEqual({ win: 50, draw: 30, loss: 20 });
  });

  it('returns all zero for a count of 0 (never NaN)', () => {
    expect(wdlPercents({ wins: 0, draws: 0, losses: 0 })).toEqual({ win: 0, draw: 0, loss: 0 });
  });
});

describe('sourceKey', () => {
  it('lowercases the username', () => {
    expect(sourceKey({ site: 'lichess', username: 'NadavK' })).toBe('lichess:nadavk');
  });
});

describe('formatSkippedBreakdown', () => {
  it('lists only non-zero categories with their labels', () => {
    expect(
      formatSkippedBreakdown({ notPlayer: 0, wrongColor: 2, selfPlay: 0, undecided: 1, unparsable: 0, filteredOut: 5 }),
    ).toBe('2 wrong colour, 1 undecided, 5 filtered out');
  });

  it('returns an empty string when nothing was skipped', () => {
    expect(formatSkippedBreakdown({ notPlayer: 0, wrongColor: 0 })).toBe('');
  });
});
