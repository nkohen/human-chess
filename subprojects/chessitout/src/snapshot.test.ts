import { describe, expect, it } from 'vitest';
import { curatedMidgames } from '@human-chess/positions';
import { START_FEN } from '@human-chess/rules';
import { parseChessitoutSnapshot, type ChessitoutSnapshot } from './snapshot';

const MINED_SNAPSHOT: ChessitoutSnapshot = {
  phase: 'result',
  position: {
    kind: 'mined',
    value: {
      fen: START_FEN,
      source: 'engine-self-play-imbalanced',
      moves: [],
      eval: { score: { type: 'cp', value: 150 }, engine: 'test-engine', depth: 18 },
    },
  },
  vote: 'black',
  playerColor: 'black',
  viewFrom: 'white',
  elo: 1800,
  tally: { right: 2, wrong: 1 },
  judged: true,
  moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], // Fool's mate: Black delivers checkmate
};

describe('parseChessitoutSnapshot', () => {
  it('round-trips a mined-position snapshot through JSON', () => {
    const decoded = parseChessitoutSnapshot(JSON.parse(JSON.stringify(MINED_SNAPSHOT)));
    expect(decoded).toEqual(MINED_SNAPSHOT);
  });

  it('round-trips a curated-position snapshot, re-resolving the entry by id', () => {
    const entry = curatedMidgames[0]!;
    const snapshot: ChessitoutSnapshot = {
      phase: 'voting',
      position: { kind: 'curated', entry },
      vote: undefined,
      playerColor: undefined,
      viewFrom: 'black',
      elo: 2100,
      tally: { right: 0, wrong: 0 },
      judged: false,
      moves: [],
    };
    // What actually gets stored is just the entry id, not the whole CuratedPosition — simulate
    // that round trip rather than JSON.stringify-ing the resolved snapshot directly.
    const stored = { ...snapshot, position: { kind: 'curated', entryId: entry.id } };
    const decoded = parseChessitoutSnapshot(JSON.parse(JSON.stringify(stored)));
    expect(decoded).toEqual(snapshot);
  });

  it('accepts a mining-phase snapshot with no position at all', () => {
    const snapshot: ChessitoutSnapshot = {
      phase: 'mining',
      position: undefined,
      vote: undefined,
      playerColor: undefined,
      viewFrom: 'white',
      elo: 1800,
      tally: { right: 1, wrong: 0 },
      judged: false,
      moves: [],
    };
    expect(parseChessitoutSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it('rejects non-object input', () => {
    expect(parseChessitoutSnapshot(null)).toBeUndefined();
    expect(parseChessitoutSnapshot('result')).toBeUndefined();
    expect(parseChessitoutSnapshot([1, 2, 3])).toBeUndefined();
  });

  it('rejects a stale/unknown phase', () => {
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, phase: 'grading' })).toBeUndefined();
  });

  it('rejects a curated position whose entry id is no longer in the pool', () => {
    const snapshot = { ...MINED_SNAPSHOT, position: { kind: 'curated', entryId: 'not-a-real-id' } };
    expect(parseChessitoutSnapshot(snapshot)).toBeUndefined();
  });

  it('rejects a mined position missing required fields (corrupt shape)', () => {
    const bad = { ...MINED_SNAPSHOT, position: { kind: 'mined', value: { fen: START_FEN } } };
    expect(parseChessitoutSnapshot(bad)).toBeUndefined();
  });

  it("rejects 'playing'/'result' phases with no vote or player colour", () => {
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, vote: undefined })).toBeUndefined();
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, playerColor: undefined })).toBeUndefined();
  });

  it("rejects 'voting'/'playing'/'result' phases with no position", () => {
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, phase: 'voting', position: undefined })).toBeUndefined();
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, phase: 'result', position: undefined })).toBeUndefined();
  });

  it('rejects an illegal move list, the whole snapshot at once, never half-restored', () => {
    const bad = { ...MINED_SNAPSHOT, moves: ['e2e4', 'e2e4'] }; // e2e4 twice: the second is illegal
    expect(parseChessitoutSnapshot(bad)).toBeUndefined();
  });

  it('rejects a move list that continues past a completed game', () => {
    const bad = { ...MINED_SNAPSHOT, moves: [...MINED_SNAPSHOT.moves, 'a2a3'] }; // after checkmate
    expect(parseChessitoutSnapshot(bad)).toBeUndefined();
  });

  it('rejects malformed tally, elo or judged fields', () => {
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, tally: { right: '2', wrong: 1 } })).toBeUndefined();
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, elo: '1800' })).toBeUndefined();
    expect(parseChessitoutSnapshot({ ...MINED_SNAPSHOT, judged: 'yes' })).toBeUndefined();
  });
});
