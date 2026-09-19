import { describe, expect, it } from 'vitest';
import {
  composeFen,
  emptyLesson,
  emptyStep,
  isLegalMoveFrom,
  parseLesson,
  parseLessonFile,
  parseLessonList,
  parseLessonStep,
  parsePlayOut,
  sanOfMove,
  serializeLesson,
  type Lesson,
} from './index';

const TWO_ROOKS = '8/8/8/4k3/8/8/8/R3K2R w - - 0 1';

function sampleLesson(): Lesson {
  return {
    id: 'l1',
    title: 'Two rooks',
    description: 'Push the king to the edge.',
    createdAt: 1000,
    updatedAt: 2000,
    steps: [
      { id: 's1', fen: TWO_ROOKS, orientation: 'white', text: 'Cut the king off.', shapes: [{ orig: 'a1', dest: 'a4', brush: 'green' }, { orig: 'e5', brush: 'red' }] },
      { id: 's2', fen: TWO_ROOKS, orientation: 'white', text: 'Now check.', shapes: [], challenge: { answers: ['h1h5'], prompt: 'Give a check with the h-rook.' } },
    ],
  };
}

describe('position and move helpers (rules-library backed)', () => {
  it('composeFen builds a legal full FEN from placement + side to move', () => {
    const fen = composeFen('8/8/8/4k3/8/8/8/R3K2R', 'white');
    expect(fen).toBe('8/8/8/4k3/8/8/8/R3K2R w - - 0 1');
    expect(isLegalMoveFrom(fen, 'a1a4')).toBe(true);
  });

  it('composeFen throws on an illegal placement (adjacent kings)', () => {
    expect(() => composeFen('8/8/8/8/8/8/8/Kk6', 'white')).toThrow();
  });

  it('isLegalMoveFrom / sanOfMove accept legal moves and reject others', () => {
    expect(isLegalMoveFrom(TWO_ROOKS, 'a1a4')).toBe(true);
    expect(isLegalMoveFrom(TWO_ROOKS, 'a1h8')).toBe(false); // rook can't move diagonally
    expect(isLegalMoveFrom(TWO_ROOKS, 'zzzz')).toBe(false); // unparseable
    expect(sanOfMove(TWO_ROOKS, 'h1h5')).toBe('Rh5+');
    expect(sanOfMove(TWO_ROOKS, 'a1h8')).toBeUndefined();
  });
});

describe('step validation', () => {
  it('accepts a valid step and preserves its shapes and challenge', () => {
    const step = parseLessonStep(sampleLesson().steps[1]);
    expect(step?.challenge?.answers).toEqual(['h1h5']);
  });

  it('rejects a step with an illegal FEN', () => {
    expect(parseLessonStep({ id: 's', fen: 'not-a-fen', orientation: 'white', text: '', shapes: [] })).toBeUndefined();
  });

  it('keeps only the legal answers of a challenge, dropping ones no longer legal (A1/V3)', () => {
    // 'a1h8' is not a legal move from TWO_ROOKS; 'h1h5' is. The illegal one is dropped, the legal
    // one survives — we never keep an unvalidated move, but a stale answer must not fail the step.
    const step = parseLessonStep({ id: 's', fen: TWO_ROOKS, orientation: 'white', text: '', shapes: [], challenge: { answers: ['a1h8', 'h1h5'] } });
    expect(step?.challenge?.answers).toEqual(['h1h5']);
  });

  it('keeps the step (challenge-less) when no challenge answer is legal, rather than dropping it', () => {
    // The realistic data-loss path: the author edited the step's position after recording a
    // challenge, so every stored answer is now illegal. The step's position and prose are valid,
    // so the step survives without its challenge — the whole lesson must not vanish on reload.
    const step = parseLessonStep({ id: 's', fen: TWO_ROOKS, orientation: 'white', text: 'keep me', shapes: [], challenge: { answers: ['a1h8'] } });
    expect(step).toBeDefined();
    expect(step?.challenge).toBeUndefined();
    expect(step?.text).toBe('keep me');
  });

  it('rejects a shape with a bad square or brush', () => {
    expect(parseLessonStep({ id: 's', fen: TWO_ROOKS, orientation: 'white', text: '', shapes: [{ orig: 'z9', brush: 'green' }] })).toBeUndefined();
    expect(parseLessonStep({ id: 's', fen: TWO_ROOKS, orientation: 'white', text: '', shapes: [{ orig: 'a1', brush: 'purple' }] })).toBeUndefined();
  });
});

describe('play-out validation', () => {
  it('accepts a valid full-strength play-out', () => {
    expect(parsePlayOut({ strength: { kind: 'max' } })).toEqual({ strength: { kind: 'max' } });
  });

  it('accepts a valid elo play-out', () => {
    expect(parsePlayOut({ strength: { kind: 'elo', elo: 1500 } })).toEqual({ strength: { kind: 'elo', elo: 1500 } });
  });

  it('rejects a malformed strength', () => {
    expect(parsePlayOut(undefined)).toBeUndefined();
    expect(parsePlayOut({})).toBeUndefined();
    expect(parsePlayOut({ strength: { kind: 'weak' } })).toBeUndefined();
    expect(parsePlayOut({ strength: { kind: 'elo', elo: 'high' } })).toBeUndefined();
    expect(parsePlayOut({ strength: { kind: 'elo', elo: NaN } })).toBeUndefined();
  });

  it('parseLessonStep accepts a step with a valid playOut', () => {
    const step = parseLessonStep({ id: 's', fen: TWO_ROOKS, orientation: 'white', text: '', shapes: [], playOut: { strength: { kind: 'elo', elo: 1800 } } });
    expect(step?.playOut).toEqual({ strength: { kind: 'elo', elo: 1800 } });
  });

  it('serialize -> parse round-trips a step with playOut', () => {
    const lesson = sampleLesson();
    lesson.steps.push({ id: 's3', fen: TWO_ROOKS, orientation: 'black', text: 'Play it out.', shapes: [], playOut: { strength: { kind: 'max' } } });
    const restored = parseLessonFile(serializeLesson(lesson));
    expect(restored).toEqual(lesson);
  });
});

describe('lesson validation and round-trip', () => {
  it('serialize -> parseLessonFile is a faithful round-trip', () => {
    const lesson = sampleLesson();
    const restored = parseLessonFile(serializeLesson(lesson));
    expect(restored).toEqual(lesson);
  });

  it('parseLessonFile accepts a bare lesson object too', () => {
    const lesson = sampleLesson();
    expect(parseLessonFile(JSON.stringify(lesson))).toEqual(lesson);
  });

  it('parseLessonFile returns undefined on non-JSON or an invalid lesson', () => {
    expect(parseLessonFile('{not json')).toBeUndefined();
    expect(parseLessonFile(JSON.stringify({ version: 1, lesson: { id: 'x' } }))).toBeUndefined();
  });

  it('a single structurally-corrupt step rejects the whole lesson', () => {
    const lesson = sampleLesson();
    (lesson.steps[0] as { fen: string }).fen = 'bogus';
    expect(parseLesson(lesson)).toBeUndefined();
  });

  it('does not lose a lesson on reload when a challenge answer is stale after a position edit', () => {
    // Regression: the author recorded a challenge answer, then edited that step's position so the
    // move is no longer legal. Before the fix this made parseLessonStep -> parseLesson ->
    // parseLessonList drop the entire lesson, so an accidental refresh wiped it.
    const lesson = sampleLesson();
    (lesson.steps[1] as { fen: string }).fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'; // 'h1h5' now illegal
    const list = parseLessonList([lesson]);
    expect(list?.map(l => l.id)).toEqual(['l1']); // lesson survives...
    expect(list?.[0]?.steps[1]?.challenge).toBeUndefined(); // ...minus the stale challenge
  });

  it('parseLessonList drops invalid lessons but keeps valid ones', () => {
    const list = parseLessonList([sampleLesson(), { id: 'broken' }, emptyLesson('l2', 5)]);
    expect(list?.map(l => l.id)).toEqual(['l1', 'l2']);
  });

  it('emptyLesson / emptyStep produce valid, parseable values', () => {
    const lesson = emptyLesson('e1', 42);
    lesson.steps.push(emptyStep('st1', TWO_ROOKS));
    expect(parseLesson(lesson)).toEqual(lesson);
  });
});
