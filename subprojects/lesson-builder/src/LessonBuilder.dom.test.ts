// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyLesson, emptyStep, type Lesson } from '@human-chess/lessons';
import { START_FEN } from '@human-chess/rules';
import { LessonBuilder } from './LessonBuilder';
import { LESSONS_STORAGE_KEY, VIEW_STORAGE_KEY } from './keys';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('LessonBuilder fresh-mount persistence', () => {
  it('persists the initial library view state on mount, before any interaction', () => {
    render(createElement(LessonBuilder));
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ view: 'library', stepIndex: 0, solved: false });
    expect(screen.getByText(/No lessons yet/)).toBeTruthy();
  });
});

function twoStepLesson(): Lesson {
  const lesson = emptyLesson('l1', 1000, 'Rook endgame');
  return {
    ...lesson,
    steps: [emptyStep('s1', START_FEN, 'white'), emptyStep('s2', START_FEN, 'black')],
  };
}

describe('LessonBuilder reload restore', () => {
  it('restores a saved lesson library and lands back on the exact editor step', () => {
    localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([twoStepLesson()]));
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view: 'editor', lessonId: 'l1', stepIndex: 1, solved: false }));

    render(createElement(LessonBuilder));

    expect(screen.getByDisplayValue('Rook endgame')).toBeTruthy();
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
  });

  it('restores a saved player position without re-locking an already-solved challenge step', () => {
    const lesson = twoStepLesson();
    const first = lesson.steps[0]!;
    lesson.steps[0] = { ...first, challenge: { answers: ['e2e4'] } };
    localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([lesson]));
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view: 'player', lessonId: 'l1', stepIndex: 0, solved: true }));

    render(createElement(LessonBuilder));

    expect(screen.getByText('Correct!')).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
  });

  it('does not carry a saved solved flag onto a different step when the index is clamped', () => {
    // The lesson was edited/re-imported down to fewer steps (or a corrupt index was stored): the
    // saved player snapshot points past the end with solved:true. The clamp lands on the last
    // step, whose challenge was NOT solved, so it must show as unsolved — not "Correct!".
    const lesson = twoStepLesson();
    const second = lesson.steps[1]!;
    lesson.steps[1] = { ...second, challenge: { answers: ['e2e4'] } };
    localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([lesson]));
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view: 'player', lessonId: 'l1', stepIndex: 5, solved: true }));

    render(createElement(LessonBuilder));

    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    expect(screen.queryByText('Correct!')).toBeNull();
    expect(screen.getByText(/Play the move to continue/)).toBeTruthy();
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement;
    expect(next.disabled).toBe(true); // still gated: the clamped step's challenge is unsolved
  });

  it('rejects a corrupt view snapshot and falls back to the library', () => {
    localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([twoStepLesson()]));
    localStorage.setItem(VIEW_STORAGE_KEY, '{not json');

    render(createElement(LessonBuilder));

    expect(screen.getByText('Lesson Builder')).toBeTruthy();
    expect(screen.getByText(/Rook endgame/)).toBeTruthy(); // shows up in the library list
  });

  it('self-heals a view pointing at a deleted lesson back to the library', () => {
    localStorage.setItem(LESSONS_STORAGE_KEY, JSON.stringify([]));
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view: 'editor', lessonId: 'gone', stepIndex: 0, solved: false }));

    render(createElement(LessonBuilder));

    expect(screen.getByText(/No lessons yet/)).toBeTruthy();
  });
});
