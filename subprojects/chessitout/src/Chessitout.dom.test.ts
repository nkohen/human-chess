// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UciEngine, type UciTransport } from '@human-chess/engine';
import { curatedMidgames } from '@human-chess/positions';
import { START_FEN } from '@human-chess/rules';
import { Chessitout } from './Chessitout';
import { SNAPSHOT_KEY, type ChessitoutSnapshot } from './snapshot';

/** A UciEngine instance that never gets a real handshake and whose transport never answers
 * anything — enough to satisfy Chessitout's `engine` prop type (it only ever gates on whether
 * the value is present, an Error, or a real engine) without contacting a real engine. The
 * snapshot below restores a game that already ended in checkmate, so nothing in Chessitout
 * ever calls `analyse`/`bestMove`/`stop` on it in this test; if it ever did, this transport
 * would just hang forever rather than let a real search run (never the wasm engine in tests). */
function inertEngine(): UciEngine {
  const transport: UciTransport = { send: () => {}, onLine: () => {}, onError: () => {}, close: () => {} };
  return new UciEngine(transport);
}

const SNAPSHOT: ChessitoutSnapshot = {
  phase: 'result',
  position: {
    kind: 'mined',
    value: {
      fen: START_FEN,
      source: 'engine-self-play-imbalanced',
      moves: [],
      eval: { score: { type: 'cp', value: 150 }, engine: 'test-engine', depth: 18 },
    },
  },
  vote: 'black',
  playerColor: 'black',
  viewFrom: 'white',
  elo: 2100,
  tally: { right: 2, wrong: 1 },
  judged: true,
  moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'], // Fool's mate: Black delivers checkmate
};

describe('Chessitout reload restore', () => {
  beforeEach(() => localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAPSHOT)));
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('seeds the restored phase, position and tally in the initialiser, before the engine loads', () => {
    // Mount with no engine at all — exactly what a reload looks like while the wasm engine is
    // still initialising. Nothing here is reset or lost while waiting (design doc: "seed in the
    // initialiser, not an effect").
    const { rerender } = render(createElement(Chessitout, { engine: undefined }));
    expect(screen.getByText(/Loading the engine…/)).toBeTruthy();

    // Providing the engine (a later render, no remount and so no re-read of storage) reveals
    // the state that was already restored at mount: the finished attempt's result screen with
    // its tally, not a fresh mining/voting screen.
    rerender(createElement(Chessitout, { engine: inertEngine() }));

    expect(screen.getByText(/Checkmate\. You won!/)).toBeTruthy();
    expect(screen.getByText(/Votes: 2 right, 1 wrong \(of 3\)\./)).toBeTruthy();
    expect(screen.getByText(/Your vote: Black/)).toBeTruthy();
    const eloSelect = screen.getByLabelText('Opponent strength (Elo)') as HTMLSelectElement;
    expect(eloSelect.value).toBe('2100');
  });

  it('rejects a corrupt snapshot and falls back to a fresh mining attempt', () => {
    localStorage.setItem(SNAPSHOT_KEY, '{not json');
    render(createElement(Chessitout, { engine: undefined }));
    expect(screen.getByText(/Loading the engine…/)).toBeTruthy();
    // No crash, and nothing from the corrupt entry leaks through once an engine is available.
  });

  it('seeds a restored curated-position attempt directly, with no recompute effect and no "Mining a position…" wait', () => {
    const entry = curatedMidgames[0]!;
    // The eval is stored whole (not recomputed after a restore — see snapshot.ts): a
    // deliberately made-up score, distinct from anything a real analyse call of this fen would
    // return, so the assertion below can only pass if this stored value is the one actually
    // rendered, not a freshly recomputed one.
    const value = { fen: entry.fen, source: 'curated-user-game', moves: [], eval: { score: { type: 'cp', value: -60 }, engine: 'test-engine', depth: 18 } };
    // What actually gets stored is the entry id (not the whole CuratedPosition) — see
    // snapshot.test.ts's own curated round-trip test for the same shape.
    const stored = {
      phase: 'voting',
      position: { kind: 'curated', entryId: entry.id, value },
      vote: undefined,
      playerColor: undefined,
      viewFrom: 'white',
      elo: 1800,
      tally: { right: 0, wrong: 0 },
      judged: false,
      moves: [],
    };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(stored));

    const { rerender } = render(createElement(Chessitout, { engine: undefined }));
    expect(screen.getByText(/Loading the engine…/)).toBeTruthy();

    // inertEngine never answers a real analyse call, so if Chessitout tried to recompute the
    // eval here (rather than using the stored value directly) the screen would be stuck on
    // "Mining a position…" — asserting the voting screen instead proves no recompute happened.
    rerender(createElement(Chessitout, { engine: inertEngine() }));
    expect(screen.queryByText(/Mining a position…/)).toBeNull();
    expect(screen.getByText(/Who stands better\?/)).toBeTruthy();
    expect(screen.getByText(/From your game vs/)).toBeTruthy();
  });
});
