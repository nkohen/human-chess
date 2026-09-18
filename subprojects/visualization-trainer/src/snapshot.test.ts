// Reload survival (docs/design/2026-09-18-reload-survival.md): the parse* functions are the gate
// between localStorage and each screen's state. Each round-trips its own fresh snapshot and a
// mid-session one, and rejects (returns undefined, falling back to a fresh snapshot) a shape
// that is corrupt, stale (an old field layout), or internally inconsistent — e.g. a 'revealed'
// exercise with no ucis (would otherwise show a re-mined, possibly different, line — A1), or a
// mid-session Memorize phase whose index/fen doesn't match the stored sessionFens.
import { describe, expect, it } from 'vitest';
import { freshLinesSnapshot, freshMemorizeSnapshot, parseLinesSnapshot, parseMemorizeSnapshot, type LinesSnapshot, type MemorizeSnapshot } from './snapshot';

const START_POSITION = { fen: '8/8/8/8/8/8/8/K6k w - - 0 1', moves: ['a1a2'] };

const SCORE = {
  correct: 5,
  missing: 1,
  extra: 0,
  wrongPiece: 0,
  totalOriginalPieces: 6,
  score: 5 / 6,
  diffs: [{ square: 'e4' as const, kind: 'missing' as const, original: { color: 'white' as const, role: 'pawn' as const } }],
};

describe('parseLinesSnapshot', () => {
  it('round-trips the fresh (no exercise yet) snapshot', () => {
    const fresh = freshLinesSnapshot();
    expect(parseLinesSnapshot(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('round-trips a snapshot with a ready, unrevealed exercise', () => {
    const snap: LinesSnapshot = {
      startPosition: START_POSITION,
      exercise: { startFen: START_POSITION.fen, ucis: ['a1a2', 'h1h2'] },
      answers: { check: undefined, pieceOn: undefined, material: '' },
      revealed: false,
      tally: { correct: 2, total: 3 },
      round: 3,
      sessionDone: false,
    };
    expect(parseLinesSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('round-trips a revealed, answered snapshot at the end of a session', () => {
    const snap: LinesSnapshot = {
      startPosition: START_POSITION,
      exercise: { startFen: START_POSITION.fen, ucis: ['a1a2'] },
      answers: { check: true, pieceOn: 'a2', material: 'K vs k' },
      revealed: true,
      tally: { correct: 4, total: 5 },
      round: 5,
      sessionDone: true,
    };
    expect(parseLinesSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('rejects corrupt or stale shapes', () => {
    expect(parseLinesSnapshot(undefined)).toBeUndefined();
    expect(parseLinesSnapshot(null)).toBeUndefined();
    expect(parseLinesSnapshot('nope')).toBeUndefined();
    expect(parseLinesSnapshot({})).toBeUndefined();
    expect(parseLinesSnapshot({ ...freshLinesSnapshot(), startPosition: { fen: 'x' } })).toBeUndefined(); // missing moves
    expect(parseLinesSnapshot({ ...freshLinesSnapshot(), round: 0 })).toBeUndefined();
    expect(parseLinesSnapshot({ ...freshLinesSnapshot(), round: 99 })).toBeUndefined();
    expect(parseLinesSnapshot({ ...freshLinesSnapshot(), exercise: { startFen: START_POSITION.fen, ucis: [] } })).toBeUndefined(); // empty pv
    // 'revealed' needs the exercise that produced it — never silently re-mined (A1).
    expect(parseLinesSnapshot({ ...freshLinesSnapshot(), revealed: true, exercise: undefined })).toBeUndefined();
  });
});

describe('parseMemorizeSnapshot', () => {
  it('round-trips the fresh (settings) snapshot', () => {
    const fresh = freshMemorizeSnapshot(10, 'random');
    expect(parseMemorizeSnapshot(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('round-trips a snapshot mid-study, with an absolute endAt', () => {
    const snap: MemorizeSnapshot = {
      studySeconds: 20,
      source: 'random',
      sessionFens: [START_POSITION.fen, '8/8/8/8/8/8/8/7k w - - 0 1'],
      results: [],
      phase: { kind: 'studying', index: 0, fen: START_POSITION.fen, studySeconds: 20, endAt: Date.now() + 15_000 },
    };
    expect(parseMemorizeSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('round-trips a snapshot mid-rebuild, with an absolute startAt and a placement', () => {
    const snap: MemorizeSnapshot = {
      studySeconds: 5,
      source: 'curated',
      sessionFens: [START_POSITION.fen],
      results: [],
      phase: { kind: 'rebuilding', index: 0, fen: START_POSITION.fen, studySeconds: 5, startAt: Date.now() - 2_000, placement: '8/8/8/8/8/8/8/K7' },
    };
    expect(parseMemorizeSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('round-trips a reviewed snapshot carrying its score', () => {
    const snap: MemorizeSnapshot = {
      studySeconds: 10,
      source: 'random',
      sessionFens: [START_POSITION.fen],
      results: [{ studySeconds: 10, rebuildMs: 4200, score: SCORE }],
      phase: { kind: 'reviewed', index: 0, fen: START_POSITION.fen, studySeconds: 10, rebuildMs: 4200, placement: '8/8/8/8/8/8/8/K7', score: SCORE },
    };
    expect(parseMemorizeSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('round-trips a summary snapshot', () => {
    const snap: MemorizeSnapshot = {
      studySeconds: 10,
      source: 'random',
      sessionFens: [START_POSITION.fen],
      results: [{ studySeconds: 10, rebuildMs: 4200, score: SCORE }],
      phase: { kind: 'summary' },
    };
    expect(parseMemorizeSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });

  it('rejects corrupt or stale shapes', () => {
    expect(parseMemorizeSnapshot(undefined)).toBeUndefined();
    expect(parseMemorizeSnapshot(null)).toBeUndefined();
    expect(parseMemorizeSnapshot('nope')).toBeUndefined();
    expect(parseMemorizeSnapshot({})).toBeUndefined();
    const fresh = freshMemorizeSnapshot(10, 'random');
    expect(parseMemorizeSnapshot({ ...fresh, studySeconds: 7 })).toBeUndefined(); // not a StudySeconds option
    expect(parseMemorizeSnapshot({ ...fresh, source: 'ai' })).toBeUndefined(); // not a MemorizeSource
    expect(parseMemorizeSnapshot({ ...fresh, phase: { kind: 'not-a-phase' } })).toBeUndefined();
    // Mid-session phases must reference a real slot in sessionFens ...
    expect(
      parseMemorizeSnapshot({
        ...fresh,
        sessionFens: [START_POSITION.fen],
        phase: { kind: 'studying', index: 1, fen: START_POSITION.fen, studySeconds: 10, endAt: Date.now() + 1000 },
      }),
    ).toBeUndefined(); // index out of range
    // ... and the fen it names must match what's actually stored there (never a stale mismatch).
    expect(
      parseMemorizeSnapshot({
        ...fresh,
        sessionFens: [START_POSITION.fen],
        phase: { kind: 'studying', index: 0, fen: '8/8/8/8/8/8/8/7k w - - 0 1', studySeconds: 10, endAt: Date.now() + 1000 },
      }),
    ).toBeUndefined();
  });
});
