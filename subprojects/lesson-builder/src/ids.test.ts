import { describe, expect, it } from 'vitest';
import { genLessonId, genStepId } from './ids';

describe('id generation', () => {
  it('prefixes lesson and step ids distinctly', () => {
    expect(genLessonId()).toMatch(/^lesson_[0-9a-z]+_[0-9a-z]{6}$/);
    expect(genStepId()).toMatch(/^step_[0-9a-z]+_[0-9a-z]{6}$/);
  });

  it('generates ids that do not collide across many calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => genStepId()));
    expect(ids.size).toBe(500);
  });
});
