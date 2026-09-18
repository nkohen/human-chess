// @vitest-environment jsdom
// Render test for reload survival (docs/design/2026-09-18-reload-survival.md). No JSX here (the
// workspace's vitest config only picks up `*.test.ts`) — the screen is built with `createElement`.
// Chessground (packages/board) touches a couple of browser APIs jsdom doesn't provide
// (`ResizeObserver`, `requestAnimationFrame`); both are stubbed below.
import { cleanup, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Puzzles } from './Puzzles';
import type { ParsedPuzzle } from './puzzle';
import { EMPTY_TALLY, STATE_KEY } from './storage';

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });
  Object.assign(globalThis, {
    requestAnimationFrame: (cb: FrameRequestCallback): number => setTimeout(() => cb(performance.now()), 0) as unknown as number,
    cancelAnimationFrame: (id: number): void => clearTimeout(id),
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const PUZZLE: ParsedPuzzle = {
  id: 'abc12',
  rating: 1500,
  themes: ['fork', 'middlegame'],
  startFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
  solverColor: 'black',
  solution: ['b8c6', 'f1c4', 'g8f6'],
  setupSans: ['e4', 'e5', 'Nf3'],
  gameUrl: 'https://lichess.org/abcdefgh',
};

describe('Puzzles reload survival', () => {
  it('restores the persisted puzzle, solve progress, id field and tally with no network calls', () => {
    const stored = {
      puzzle: PUZZLE,
      solve: { index: 0, everFailed: false, status: 'thinking' },
      idInput: 'abc12',
      tally: { solvedFirstTry: 2, solvedAfterMistake: 1, total: 3 },
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(stored));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { container } = render(createElement(Puzzles));

    expect(container.textContent).toContain('Black to move');
    expect(container.textContent).toContain('1500');
    expect(container.textContent).toContain('Solved first try: 2');
    expect(container.textContent).toContain('Solved after a mistake: 1');
    expect(container.textContent).toContain('Total: 3');
    const idInput = container.querySelector('#puzzles-id-input') as HTMLInputElement | null;
    expect(idInput?.value).toBe('abc12');

    // Never re-fetches a puzzle when one was restored (fetchNextPuzzle/fetchPuzzleById both go
    // through lichessFetch, which itself is a `fetch` wrapper): a network call here would mean
    // the restored puzzle got silently discarded for a new one.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('restores a mid-solve attempt (never re-fetched) with the derived last move and no network calls', () => {
    const stored = {
      puzzle: PUZZLE,
      solve: { index: 2, everFailed: false, status: 'correct' },
      idInput: '',
      tally: EMPTY_TALLY,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(stored));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { container } = render(createElement(Puzzles));

    expect(container.textContent).toContain('Correct!');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to fetching a puzzle when nothing was persisted', async () => {
    // No localStorage entry: this is the one case a fresh mount is expected to fetch, so the
    // guard (hadRestoredPuzzleRef) is exercised on both sides, not just "never fetches". The
    // client's own serial queue (packages/site-client) dispatches asynchronously, so this waits
    // for the call rather than asserting synchronously right after render.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {})); // never resolves; only call-count matters here
    render(createElement(Puzzles));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  });
});
