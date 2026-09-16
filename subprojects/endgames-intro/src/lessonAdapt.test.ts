import { describe, expect, it } from 'vitest';
import type { EndgameLesson } from '@human-chess/positions';
import { fenFor, lessonOutcome } from './lessonAdapt';

const lesson: EndgameLesson = { id: 't', stage: 1, title: 't', fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1', intro: '' };

describe('fenFor', () => {
  it('keeps the lesson FEN unchanged for White', () => {
    expect(fenFor(lesson, 'white')).toBe(lesson.fen);
  });

  it('mirrors colours and the board for Black, so the learner still moves first', () => {
    expect(fenFor(lesson, 'black')).toBe('r3k2r/8/8/8/4K3/8/8/8 b - - 0 1');
  });
});

describe('lessonOutcome', () => {
  it('keeps "won" as the only celebrated outcome', () => {
    expect(lessonOutcome('won')).toBe('won');
  });

  it('folds a loss and a draw into "not-won"', () => {
    expect(lessonOutcome('lost')).toBe('not-won');
    expect(lessonOutcome('draw')).toBe('not-won');
  });

  it('passes undefined through for an unfinished game', () => {
    expect(lessonOutcome(undefined)).toBeUndefined();
  });
});
