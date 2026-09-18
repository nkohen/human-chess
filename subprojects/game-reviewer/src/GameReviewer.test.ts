// @vitest-environment jsdom
// Render tests for reload survival (docs/design/2026-09-18-reload-survival.md). No JSX here (the
// workspace's vitest config only picks up `*.test.ts`, and plain `.ts` files can't parse JSX) —
// screens are built with `createElement`. Chessground (packages/board) touches a couple of
// browser APIs jsdom doesn't provide (`ResizeObserver`, `requestAnimationFrame`); both are
// stubbed below, the same minimal shims any jsdom+chessground test needs.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gameId, type ImportedGame } from '@human-chess/import';
import type { GameReview } from '@human-chess/review';
import { GameReviewer } from './GameReviewer';
import { REVIEW_KEY, SCREEN_KEY, serializeReviewSnapshot } from './storage';

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
  window.location.hash = '';
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
  white: undefined,
  black: undefined,
  result: undefined,
  playedAs: 'white',
  url: undefined,
  playedAt: undefined,
};

const REVIEW: GameReview = {
  moves: [
    {
      ply: 1,
      san: 'e4',
      uci: 'e2e4',
      fenBefore: GAME.startFen,
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      evalBefore: { type: 'cp', value: 20 },
      bestMove: 'e2e4',
      bestSan: 'e4',
      evalAfterBest: { type: 'cp', value: 20 },
      evalAfterPlayed: { type: 'cp', value: 20 },
      lossCp: 0,
      classification: 'best',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
    {
      ply: 2,
      san: 'e5',
      uci: 'e7e5',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      evalBefore: { type: 'cp', value: 20 },
      bestMove: 'e7e5',
      bestSan: 'e5',
      evalAfterBest: { type: 'cp', value: 20 },
      evalAfterPlayed: { type: 'cp', value: 15 },
      lossCp: 5,
      classification: 'good',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
    {
      ply: 3,
      san: 'Nf3',
      uci: 'g1f3',
      fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      evalBefore: { type: 'cp', value: 15 },
      bestMove: 'g1f3',
      bestSan: 'Nf3',
      evalAfterBest: { type: 'cp', value: 15 },
      evalAfterPlayed: { type: 'cp', value: 15 },
      lossCp: 0,
      classification: 'best',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
    {
      ply: 4,
      san: 'Nc6',
      uci: 'b8c6',
      fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      fenAfter: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      evalBefore: { type: 'cp', value: 15 },
      bestMove: 'b8c6',
      bestSan: 'Nc6',
      evalAfterBest: { type: 'cp', value: 15 },
      evalAfterPlayed: { type: 'cp', value: 15 },
      lossCp: 0,
      classification: 'best',
      provenance: { engine: 'stockfish', depthBefore: 20, depthAfter: 20 },
    },
  ],
  end: undefined,
};

function seedRestoredReview(): void {
  localStorage.setItem(SCREEN_KEY, JSON.stringify({ kind: 'review', game: GAME }));
  localStorage.setItem(
    REVIEW_KEY,
    JSON.stringify(serializeReviewSnapshot({ gameKey: gameId(GAME), review: REVIEW, selectedPly: 1, flipped: false })),
  );
}

describe('GameReviewer reload survival', () => {
  it('restores the review screen and selected ply from a persisted snapshot with no network calls', () => {
    seedRestoredReview();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('network disabled in this test')));

    const { container } = render(createElement(GameReviewer, { engine: undefined }));

    // The restored review's move table is on screen — no re-import, no re-analysis.
    const rows = container.querySelectorAll('.gr-move-table tbody tr');
    expect(rows.length).toBe(4);
    expect(container.textContent).toContain('e4');
    expect(container.textContent).toContain('e5');
    // selectedPly 1 → the first move's row is selected and its summary is the primary content.
    expect(rows[0]?.className).toContain('gr-move-row-selected');
    expect(container.textContent).toContain('Played');

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the restored review even when the engine failed to load, with the error as status', () => {
    seedRestoredReview();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new Error('network disabled in this test')));

    const { container } = render(createElement(GameReviewer, { engine: new Error('wasm init failed') }));

    // The restored review's move table is still the primary content...
    const rows = container.querySelectorAll('.gr-move-table tbody tr');
    expect(rows.length).toBe(4);
    expect(container.textContent).toContain('Played');
    // ...while the engine error is surfaced too, rather than one hiding the other (A1: never
    // hide that an engine call failed).
    expect(container.textContent).toContain('wasm init failed');
  });

  it('a fresh hand-off overrides the persisted snapshot and strips the query string from the URL', () => {
    seedRestoredReview();
    const pgn = '1. d4 d5';
    window.location.hash = `#/review?pgn=${encodeURIComponent(pgn)}`;

    const { container } = render(createElement(GameReviewer, { engine: undefined }));

    // Landed on the import screen (paste box prefilled with the hand-off PGN), not the restored review.
    const textarea = container.querySelector('#hc-import-pgn') as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe(pgn);
    expect(container.querySelector('.gr-move-table')).toBeNull();

    // The hand-off is consumed out of the URL so a later reload restores the snapshot instead.
    expect(window.location.hash).toBe('#/review');
  });
});
