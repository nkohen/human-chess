import { describe, expect, it } from 'vitest';
import type { CuratedPosition } from '@human-chess/positions';
import { pickUnshownCuratedMidgame } from './curatedPick';

function pos(id: string): CuratedPosition {
  return {
    id,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    playAs: 'white',
    screenshot: `${id}.png`,
    game: { site: 'chess.com', url: `https://www.chess.com/game/live/${id}`, white: 'chicachoo123', black: 'someone' },
    source: 'game-record',
  };
}

describe('pickUnshownCuratedMidgame', () => {
  it('throws on an empty pool', () => {
    expect(() => pickUnshownCuratedMidgame([], new Set())).toThrow(/no curated midgames/);
  });

  it('picks the only unshown entry when the pool has one', () => {
    const pool = [pos('a')];
    const { position, shownIds } = pickUnshownCuratedMidgame(pool, new Set());
    expect(position.id).toBe('a');
    expect(shownIds).toEqual(new Set(['a']));
  });

  it('never repeats an id until every id has been shown', () => {
    const pool = [pos('a'), pos('b'), pos('c')];
    let shown = new Set<string>();
    const seenInFirstRound: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const { position, shownIds } = pickUnshownCuratedMidgame(pool, shown, () => 0.999);
      seenInFirstRound.push(position.id);
      shown = shownIds;
    }
    expect(new Set(seenInFirstRound).size).toBe(pool.length);
    expect(shown).toEqual(new Set(pool.map(p => p.id)));
  });

  it('starts over once every entry has been shown', () => {
    const pool = [pos('a'), pos('b')];
    const allShown = new Set(pool.map(p => p.id));
    const { position, shownIds } = pickUnshownCuratedMidgame(pool, allShown, () => 0);
    // Starting over: candidates are the whole pool again, and the result records only the one
    // just picked, not the full previous "everything shown" set.
    expect(pool.map(p => p.id)).toContain(position.id);
    expect(shownIds).toEqual(new Set([position.id]));
  });

  it('random draws are within range: 0 picks the first candidate, near-1 picks the last', () => {
    const pool = [pos('a'), pos('b'), pos('c')];
    expect(pickUnshownCuratedMidgame(pool, new Set(), () => 0).position.id).toBe('a');
    expect(pickUnshownCuratedMidgame(pool, new Set(), () => 0.999).position.id).toBe('c');
  });
});
