// Reload survival (docs/design/2026-09-18-reload-survival.md): the parse* functions are the gate
// between localStorage and every screen's state — each round-trips its own fresh snapshot, and
// rejects (returns undefined, falling back to a fresh snapshot) a shape that is corrupt, stale
// (an old field layout), or internally inconsistent (e.g. a 'revealed'/'reveal' phase with no
// analysis, which would otherwise show a re-derived, possibly different, number — A1).
import { describe, expect, it } from 'vitest';
import {
  freshPvpSnapshot,
  freshSoloSnapshot,
  freshTopSnapshot,
  parseAnalysisBoardSnapshot,
  parsePvpSnapshot,
  parseSoloSnapshot,
  parseTopSnapshot,
  type AnalysisBoardSnapshot,
  type PvpSnapshot,
  type SoloSnapshot,
  type TopSnapshot,
} from './snapshot';

const POSITION = { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', recipe: 'quiet' as const, description: 'a king and king endgame', moves: ['a1a2'] };
const SCORE = { type: 'cp' as const, value: 120 };
const ANALYSIS = {
  engine: 'stockfish',
  fen: POSITION.fen,
  moves: [],
  limit: { depth: 14 },
  multipv: 1,
  bestmove: 'a2a3',
  lines: [{ multipv: 1, depth: 14, score: SCORE, pv: ['a2a3'] }],
  elapsedMs: 500,
};

describe('parseTopSnapshot', () => {
  it('round-trips a fresh snapshot', () => {
    const fresh = freshTopSnapshot();
    expect(parseTopSnapshot(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('round-trips a snapshot mid-round', () => {
    const snap: TopSnapshot = { screen: 'pvp', mode: 'pvp' };
    expect(parseTopSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('rejects corrupt or stale shapes', () => {
    expect(parseTopSnapshot(undefined)).toBeUndefined();
    expect(parseTopSnapshot(null)).toBeUndefined();
    expect(parseTopSnapshot('not an object')).toBeUndefined();
    expect(parseTopSnapshot({})).toBeUndefined();
    expect(parseTopSnapshot({ screen: 'summary', mode: 'solo' })).toBeUndefined(); // not a GteScreen
    expect(parseTopSnapshot({ screen: 'solo', mode: 'versus' })).toBeUndefined(); // not a GteMode
  });
});

describe('parseSoloSnapshot', () => {
  it('round-trips the fresh (generating) snapshot', () => {
    const fresh = freshSoloSnapshot();
    expect(parseSoloSnapshot(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('round-trips a snapshot mid-guess, with a position and a running clock', () => {
    const snap: SoloSnapshot = {
      position: POSITION,
      phase: 'guessing',
      guessCp: 150,
      timedOut: false,
      roundIndex: 2,
      results: [{ truth: SCORE, guessCp: 100, points: 8, timedOut: false, recipeDescription: 'a rook endgame' }],
      endAt: Date.now() + 10_000,
      analysis: undefined,
    };
    expect(parseSoloSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('round-trips a revealed snapshot carrying its analysis', () => {
    const snap: SoloSnapshot = {
      position: POSITION,
      phase: 'revealed',
      guessCp: 150,
      timedOut: false,
      roundIndex: 0,
      results: [],
      endAt: undefined,
      analysis: ANALYSIS,
    };
    expect(parseSoloSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('rejects corrupt or stale shapes', () => {
    expect(parseSoloSnapshot(undefined)).toBeUndefined();
    expect(parseSoloSnapshot({})).toBeUndefined();
    expect(parseSoloSnapshot({ ...freshSoloSnapshot(), phase: 'not-a-phase' })).toBeUndefined();
    expect(parseSoloSnapshot({ ...freshSoloSnapshot(), position: { fen: 'x' } })).toBeUndefined(); // incomplete RecipePosition
    expect(parseSoloSnapshot({ ...freshSoloSnapshot(), roundIndex: -1 })).toBeUndefined();
    expect(parseSoloSnapshot({ ...freshSoloSnapshot(), roundIndex: 99 })).toBeUndefined();
    // 'guessing' needs a position (mid-round).
    expect(parseSoloSnapshot({ ...freshSoloSnapshot(), phase: 'guessing', position: undefined })).toBeUndefined();
    // 'revealed' needs the analysis that produced it — never silently recomputed.
    expect(parseSoloSnapshot({ ...freshSoloSnapshot(), phase: 'revealed', position: POSITION, analysis: undefined })).toBeUndefined();
  });
});

describe('parsePvpSnapshot', () => {
  it('round-trips the fresh (generating) snapshot', () => {
    const fresh = freshPvpSnapshot();
    expect(parsePvpSnapshot(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('round-trips a snapshot mid-handover (player 1 already locked in, clock cleared)', () => {
    const snap: PvpSnapshot = {
      position: POSITION,
      phase: 'handover',
      roundIndex: 1,
      results: [],
      endAt: undefined,
      analysis: undefined,
      turnPlayer: 2,
      sliderCp: 0,
      guess1Cp: 220,
      guess1UsedMs: 4000,
      timedOut1: false,
      timedOut2: false,
      analysingIndex: undefined,
    };
    expect(parsePvpSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('round-trips a results snapshot with an open AnalysisBoard index', () => {
    const snap: PvpSnapshot = {
      ...freshPvpSnapshot(),
      phase: 'results',
      results: [
        {
          fen: POSITION.fen,
          lastMove: ['a1', 'a2'],
          truth: SCORE,
          guess1Cp: 100,
          guess2Cp: 90,
          points1: 8,
          points2: 9,
          timedOut1: false,
          timedOut2: true,
          recipeDescription: 'a king and king endgame',
        },
      ],
      analysingIndex: 0,
    };
    expect(parsePvpSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('rejects corrupt or stale shapes', () => {
    expect(parsePvpSnapshot(undefined)).toBeUndefined();
    expect(parsePvpSnapshot({})).toBeUndefined();
    expect(parsePvpSnapshot({ ...freshPvpSnapshot(), phase: 'not-a-phase' })).toBeUndefined();
    expect(parsePvpSnapshot({ ...freshPvpSnapshot(), turnPlayer: 3 })).toBeUndefined();
    // 'guessing' needs a position.
    expect(parsePvpSnapshot({ ...freshPvpSnapshot(), phase: 'guessing', position: undefined })).toBeUndefined();
    // 'reveal' needs the analysis that produced it.
    expect(parsePvpSnapshot({ ...freshPvpSnapshot(), phase: 'reveal', position: POSITION, analysis: undefined })).toBeUndefined();
    expect(parsePvpSnapshot({ ...freshPvpSnapshot(), analysingIndex: -1 })).toBeUndefined();
  });
});

describe('parseAnalysisBoardSnapshot', () => {
  it('round-trips a snapshot with a move played', () => {
    const snap: AnalysisBoardSnapshot = {
      seedFen: POSITION.fen,
      history: [{ fen: POSITION.fen }, { fen: '8/8/8/8/8/8/K7/7k b - - 1 1', lastMove: ['a1', 'a2'] }],
    };
    expect(parseAnalysisBoardSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('rejects corrupt or stale shapes', () => {
    expect(parseAnalysisBoardSnapshot(undefined)).toBeUndefined();
    expect(parseAnalysisBoardSnapshot({})).toBeUndefined();
    expect(parseAnalysisBoardSnapshot({ seedFen: POSITION.fen, history: [] })).toBeUndefined(); // empty history
    expect(parseAnalysisBoardSnapshot({ seedFen: POSITION.fen, history: [{ fen: 1 }] })).toBeUndefined();
  });
});
