import { describe, expect, it } from 'vitest';
import type { BotRatingRecord } from './records';
import { highestWin, summarize } from './summary';

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

describe('summarize', () => {
  it('returns no rows for no records', () => {
    expect(summarize([])).toEqual([]);
  });

  it('tallies wins, draws and losses per Elo, ascending by Elo', () => {
    const records = [
      record({ elo: 1900, result: 'lost' }),
      record({ elo: 1500, result: 'won' }),
      record({ elo: 1500, result: 'won' }),
      record({ elo: 1500, result: 'draw' }),
      record({ elo: 1900, result: 'lost' }),
    ];
    expect(summarize(records)).toEqual([
      { elo: 1500, wins: 2, draws: 1, losses: 0 },
      { elo: 1900, wins: 0, draws: 0, losses: 2 },
    ]);
  });
});

describe('highestWin', () => {
  it('is undefined when no win is recorded', () => {
    expect(highestWin([])).toBeUndefined();
    expect(highestWin([record({ elo: 1500, result: 'lost' }), record({ elo: 1600, result: 'draw' })])).toBeUndefined();
  });

  it('reports the highest Elo with a win and how many wins there', () => {
    const records = [
      record({ elo: 1500, result: 'won' }),
      record({ elo: 2000, result: 'won' }),
      record({ elo: 2000, result: 'won' }),
      record({ elo: 2200, result: 'lost' }),
    ];
    expect(highestWin(records)).toEqual({ elo: 2000, wins: 2 });
  });
});
