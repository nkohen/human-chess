import { describe, expect, it } from 'vitest';
import { INITIAL_VIEW_STATE, parseViewState } from './viewState';

describe('parseViewState', () => {
  it('round-trips a full editor snapshot', () => {
    const state = parseViewState({ view: 'editor', lessonId: 'l1', stepIndex: 2, solved: false });
    expect(state).toEqual({ view: 'editor', lessonId: 'l1', stepIndex: 2, solved: false });
  });

  it('accepts the library view with no lessonId', () => {
    expect(parseViewState({ view: 'library', stepIndex: 0, solved: false })).toEqual(INITIAL_VIEW_STATE);
  });

  it('defaults a missing solved to false', () => {
    const state = parseViewState({ view: 'player', lessonId: 'l1', stepIndex: 0 });
    expect(state?.solved).toBe(false);
  });

  it('rejects a bad view name', () => {
    expect(parseViewState({ view: 'nope', stepIndex: 0, solved: false })).toBeUndefined();
  });

  it('rejects a negative or non-numeric stepIndex', () => {
    expect(parseViewState({ view: 'library', stepIndex: -1, solved: false })).toBeUndefined();
    expect(parseViewState({ view: 'library', stepIndex: 'x', solved: false })).toBeUndefined();
  });

  it('rejects a non-record and a non-string lessonId', () => {
    expect(parseViewState(null)).toBeUndefined();
    expect(parseViewState('library')).toBeUndefined();
    expect(parseViewState({ view: 'editor', lessonId: 5, stepIndex: 0, solved: false })).toBeUndefined();
  });

  it('truncates a fractional stepIndex', () => {
    expect(parseViewState({ view: 'library', stepIndex: 2.9, solved: false })?.stepIndex).toBe(2);
  });

  it('round-trips a valid moves list', () => {
    const state = parseViewState({ view: 'player', lessonId: 'l1', stepIndex: 0, solved: false, moves: ['e2e4', 'e7e5'] });
    expect(state?.moves).toEqual(['e2e4', 'e7e5']);
  });

  it('rejects a non-array-of-strings moves', () => {
    expect(parseViewState({ view: 'player', stepIndex: 0, solved: false, moves: 'e2e4' })).toBeUndefined();
    expect(parseViewState({ view: 'player', stepIndex: 0, solved: false, moves: [1, 2] })).toBeUndefined();
  });
});
