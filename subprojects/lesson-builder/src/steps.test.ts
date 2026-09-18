import { describe, expect, it } from 'vitest';
import type { LessonStep } from '@human-chess/lessons';
import { insertStep, moveStep, removeStep } from './steps';

function step(id: string): LessonStep {
  return { id, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', orientation: 'white', text: '', shapes: [] };
}

describe('moveStep', () => {
  it('swaps a step with its previous neighbour', () => {
    const steps = [step('a'), step('b'), step('c')];
    const moved = moveStep(steps, 1, -1);
    expect(moved.map(s => s.id)).toEqual(['b', 'a', 'c']);
  });

  it('swaps a step with its next neighbour', () => {
    const steps = [step('a'), step('b'), step('c')];
    const moved = moveStep(steps, 1, 1);
    expect(moved.map(s => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op at the start/end boundary', () => {
    const steps = [step('a'), step('b')];
    expect(moveStep(steps, 0, -1).map(s => s.id)).toEqual(['a', 'b']);
    expect(moveStep(steps, 1, 1).map(s => s.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const steps = [step('a'), step('b')];
    moveStep(steps, 0, 1);
    expect(steps.map(s => s.id)).toEqual(['a', 'b']);
  });
});

describe('insertStep', () => {
  it('inserts at a given index', () => {
    const steps = [step('a'), step('c')];
    const next = insertStep(steps, 1, step('b'));
    expect(next.map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an out-of-range index to the end', () => {
    const steps = [step('a')];
    const next = insertStep(steps, 99, step('b'));
    expect(next.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('clamps a negative index to the start', () => {
    const steps = [step('a')];
    const next = insertStep(steps, -5, step('b'));
    expect(next.map(s => s.id)).toEqual(['b', 'a']);
  });
});

describe('removeStep', () => {
  it('removes the step at an index', () => {
    const steps = [step('a'), step('b'), step('c')];
    expect(removeStep(steps, 1).map(s => s.id)).toEqual(['a', 'c']);
  });

  it('is a no-op out of range', () => {
    const steps = [step('a')];
    expect(removeStep(steps, 5).map(s => s.id)).toEqual(['a']);
  });
});
