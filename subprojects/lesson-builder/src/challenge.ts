// Pure logic for the editor's "ask the learner to play a move" section and the player's
// answer-checking: never re-implements legality (answers are only ever added from a move the
// board already offered as a legal destination, or validated with @human-chess/lessons'
// isLegalMoveFrom before being stored), and is careful about exactOptionalPropertyTypes — an
// absent `prompt` is an omitted key, never an explicit `prompt: undefined`.
import { isLegalMoveFrom, type LessonChallenge, type LessonStep } from '@human-chess/lessons';

/** True when `uci` is one of the challenge's accepted answers — what the player uses to judge a
 * played move. */
export function checkChallengeAnswer(challenge: LessonChallenge, uci: string): boolean {
  return challenge.answers.includes(uci);
}

/** Adds `uci` to the accepted answers, unless it is already there. */
export function addChallengeAnswer(challenge: LessonChallenge, uci: string): LessonChallenge {
  if (challenge.answers.includes(uci)) return challenge;
  return { ...challenge, answers: [...challenge.answers, uci] };
}

/** Drops `uci` from the accepted answers. May leave `answers` empty — callers that must keep a
 * lesson storable (parseLessonStep rejects an empty-answers challenge) use `withoutChallenge`
 * once this returns an empty list. */
export function removeChallengeAnswer(challenge: LessonChallenge, uci: string): LessonChallenge {
  return { ...challenge, answers: challenge.answers.filter(a => a !== uci) };
}

/** Sets the optional prompt, or clears it (by omitting the key, not by assigning `undefined`)
 * when given blank text. */
export function withChallengePrompt(challenge: LessonChallenge, prompt: string): LessonChallenge {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    const { prompt: _drop, ...rest } = challenge;
    return rest;
  }
  return { ...challenge, prompt: trimmed };
}

export function withChallenge(step: LessonStep, challenge: LessonChallenge): LessonStep {
  return { ...step, challenge };
}

/** Removes the `challenge` key entirely (never sets it to `undefined` — exactOptionalPropertyTypes). */
export function withoutChallenge(step: LessonStep): LessonStep {
  const { challenge: _drop, ...rest } = step;
  return rest;
}

/** Sets the step's position to `fen`, dropping any challenge answers that are no longer legal from
 * it (and the whole challenge if none survive). Every place the editor changes a step's position
 * goes through this: a challenge answer recorded from the old position would otherwise fail
 * validation on reload, and a single invalid step makes the whole lesson unreadable — so the author
 * would "accidentally refresh" and find the lesson gone. Pruning here keeps stored lessons always
 * valid and shows the author immediately which answers no longer apply. */
export function withStepFen(step: LessonStep, fen: string): LessonStep {
  if (!step.challenge) return { ...step, fen };
  const answers = step.challenge.answers.filter(uci => isLegalMoveFrom(fen, uci));
  if (answers.length === 0) return withoutChallenge({ ...step, fen });
  return { ...step, fen, challenge: { ...step.challenge, answers } };
}
