import { describe, expect, it } from 'vitest';
import type { LessonChallenge, LessonStep } from '@human-chess/lessons';
import { addChallengeAnswer, checkChallengeAnswer, removeChallengeAnswer, withChallenge, withChallengePrompt, withoutChallenge } from './challenge';

const STEP: LessonStep = { id: 's1', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', orientation: 'white', text: '', shapes: [] };

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
