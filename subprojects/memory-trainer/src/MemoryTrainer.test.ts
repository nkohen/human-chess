// @vitest-environment jsdom
// Render tests for reload survival (docs/design/2026-09-18-reload-survival.md). No JSX here (the
// workspace's vitest config only picks up `*.test.ts`) — screens are built with `createElement`.
// Chessground (packages/board) touches a couple of browser APIs jsdom doesn't provide
// (`ResizeObserver`, `requestAnimationFrame`); both are stubbed below.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportedGame } from '@human-chess/import';
import { MemoryTrainer } from './MemoryTrainer';
import { STATE_KEY, type TrainerSnapshot } from './storage';

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

const GAME: ImportedGame = {
  source: 'pgn',
  username: undefined,
  pgn: '1. e4 e5 2. Nf3 Nc6',
  headers: {},
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ucis: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  sans: ['e4', 'e5', 'Nf3', 'Nc6'],
  playedAs: 'white',
  white: 'Alice',
  black: 'Bob',
  result: undefined,
  url: undefined,
  playedAt: undefined,
};

describe('MemoryTrainer reload survival', () => {
  it('restores a mid-reconstruction attempt (fetched game never re-fetched) with no network calls', () => {
    const stored = {
      screen: { kind: 'reconstruct', game: GAME, ucis: ['e2e4'] },
      flipped: true,
      replayIndex: 0,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(stored));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { container } = render(createElement(MemoryTrainer));

    expect(container.textContent).toContain('1. e4');
    expect(container.querySelector('.memory-trainer-identity')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('restores the review screen with claimedComplete and replayIndex from the snapshot', () => {
    const stored = {
      screen: { kind: 'review', game: GAME, ucis: ['e2e4', 'e7e5'], claimedComplete: false },
      flipped: false,
      replayIndex: 0,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(stored));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { container } = render(createElement(MemoryTrainer));

    // The review screen (not import, not reconstruct) is what's on screen.
    expect(container.textContent).toContain('reconstructed the first 2 plies correctly');
    // replayIndex 0 is the start position: "prev" is disabled.
    const prevButton = [...container.querySelectorAll('button')].find(b => b.textContent === 'prev');
    expect(prevButton?.hasAttribute('disabled')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a snapshot whose stored ucis do not replay legally, falling back to the import screen', () => {
    const stored = {
      screen: { kind: 'reconstruct', game: GAME, ucis: ['e2e5'] }, // illegal
      flipped: false,
      replayIndex: 0,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(stored));

    const { container } = render(createElement(MemoryTrainer));

    expect(container.querySelector('#hc-import-pgn, [placeholder*="username" i]')).not.toBeNull();
  });
});
