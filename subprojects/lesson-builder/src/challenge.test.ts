import { describe, expect, it } from 'vitest';
import type { LessonChallenge, LessonStep } from '@human-chess/lessons';
import { addChallengeAnswer, checkChallengeAnswer, removeChallengeAnswer, withChallenge, withChallengePrompt, withoutChallenge, withStepFen } from './challenge';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const STEP: LessonStep = { id: 's1', fen: START, orientation: 'white', text: '', shapes: [] };

describe('checkChallengeAnswer', () => {
  it('matches one of several accepted answers', () => {
    const challenge: LessonChallenge = { answers: ['e2e4', 'd2d4'] };
    expect(checkChallengeAnswer(challenge, 'd2d4')).toBe(true);
    expect(checkChallengeAnswer(challenge, 'g1f3')).toBe(false);
  });
});

describe('addChallengeAnswer / removeChallengeAnswer', () => {
  it('adds without duplicating', () => {
    let challenge: LessonChallenge = { answers: ['e2e4'] };
    challenge = addChallengeAnswer(challenge, 'e2e4');
    expect(challenge.answers).toEqual(['e2e4']);
    challenge = addChallengeAnswer(challenge, 'd2d4');
    expect(challenge.answers).toEqual(['e2e4', 'd2d4']);
  });

  it('removes an answer, possibly down to empty', () => {
    const challenge: LessonChallenge = { answers: ['e2e4'] };
    expect(removeChallengeAnswer(challenge, 'e2e4').answers).toEqual([]);
  });
});

describe('withChallengePrompt', () => {
  it('sets a trimmed prompt', () => {
    const challenge = withChallengePrompt({ answers: ['e2e4'] }, '  Give check  ');
    expect(challenge.prompt).toBe('Give check');
  });

  it('omits the prompt key entirely for blank text (exactOptionalPropertyTypes-safe)', () => {
    const challenge = withChallengePrompt({ answers: ['e2e4'], prompt: 'old' }, '   ');
    expect('prompt' in challenge).toBe(false);
  });
});

describe('withChallenge / withoutChallenge', () => {
  it('attaches and removes the challenge key without ever assigning undefined', () => {
    const withC = withChallenge(STEP, { answers: ['e2e4'] });
    expect(withC.challenge?.answers).toEqual(['e2e4']);
    const withoutC = withoutChallenge(withC);
    expect('challenge' in withoutC).toBe(false);
  });
});

describe('withStepFen', () => {
  const KINGS = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';

  it('sets the fen and keeps a challenge whose answers are still legal', () => {
    const step = withChallenge(STEP, { answers: ['e2e4', 'd2d4'], prompt: 'Open up' });
    // A different but legal position where both pawn moves still exist (add a black piece).
    const next = withStepFen(step, 'rnbqkbnr/pppppppp/8/8/8/7p/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(next.challenge?.answers).toEqual(['e2e4', 'd2d4']);
    expect(next.challenge?.prompt).toBe('Open up');
  });

  it('drops only the answers that are no longer legal from the new position', () => {
    const step = withChallenge(STEP, { answers: ['e2e4', 'e7e5'] }); // e7e5 is Black's move, illegal for White
    const next = withStepFen(step, START);
    expect(next.challenge?.answers).toEqual(['e2e4']);
  });

  it('removes the whole challenge (key omitted) when no answer survives the new position', () => {
    const step = withChallenge(STEP, { answers: ['e2e4', 'd2d4'] });
    const next = withStepFen(step, KINGS); // neither pawn exists anymore
    expect('challenge' in next).toBe(false);
    expect(next.fen).toBe(KINGS);
  });

  it('leaves a challenge-less step untouched but for the fen', () => {
    const next = withStepFen(STEP, KINGS);
    expect(next.fen).toBe(KINGS);
    expect('challenge' in next).toBe(false);
  });
});
