import { describe, expect, it } from 'vitest';
import { fenOf, parsePgnGame, playUci, positionFromFen, turn } from '@human-chess/rules';
import { fetchNextPuzzle, fetchPuzzleById, parseLichessPuzzle, PuzzleError } from './puzzle';

// Canned fixture: verbatim output of
//   curl -s https://lichess.org/api/puzzle/next
// on 2026-09-16 (see the shape comment in puzzle.ts). A second curl against
// https://lichess.org/api/puzzle/daily on the same day returned the identical top-level shape
// with different values, confirming this is the stable response contract, not a fluke of one
// puzzle.
const FIXTURE = {
  game: {
    id: 'r94yQg2R',
    perf: { key: 'rapid', name: 'Rapid' },
    rated: true,
    players: [
      { name: 'Arminius4', id: 'arminius4', color: 'white', rating: 1990 },
      { name: 'BelikovMaksim-65', id: 'belikovmaksim-65', color: 'black', rating: 1962 },
    ],
    pgn:
      'e4 e5 Nf3 Nc6 Bc4 Be7 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 Bb3 a5 Qf3 O-O a4 d5 e5 Ne4 Nc3 Bb4 O-O Ba6 Rd1 Nc5 Be3 Nxb3 cxb3 Qe7 Bf4 Rfd8 Rac1 Qe6 Qg3 Bxc3 Rxc3 d4 Rc5 Be2 Rdc1 Ra6 Bd2 d3 Rxa5',
    clock: '10+5',
  },
  puzzle: {
    id: 'tBsnX',
    rating: 1362,
    plays: 11463,
    solution: ['a6a5', 'd2a5', 'd3d2', 'a5d2', 'd8d2'],
    themes: ['advantage', 'advancedPawn', 'long', 'middlegame'],
    initialPly: 44,
  },
};

describe('parseLichessPuzzle', () => {
  it('parses the canned lichess API fixture', () => {
    const result = parseLichessPuzzle(FIXTURE);
    expect(result.id).toBe('tBsnX');
    expect(result.rating).toBe(1362);
    expect(result.themes).toEqual(['advantage', 'advancedPawn', 'long', 'middlegame']);
    expect(result.solution).toEqual(['a6a5', 'd2a5', 'd3d2', 'a5d2', 'd8d2']);

    // Cross-check startFen/solverColor independently, the same way a caller who trusted A1 would.
    const setup = parsePgnGame(FIXTURE.game.pgn);
    expect(setup.ucis).toHaveLength(FIXTURE.puzzle.initialPly + 1);
    let pos = positionFromFen(setup.startFen);
    for (const uci of setup.ucis) pos = playUci(pos, uci).pos;
    expect(result.startFen).toBe(fenOf(pos));
    expect(result.solverColor).toBe(turn(pos));
    expect(result.setupSans).toEqual(setup.sans);

    // The first solution move must be legal from startFen, i.e. the reconstruction is sound.
    expect(() => playUci(positionFromFen(result.startFen), result.solution[0]!)).not.toThrow();
  });

  it('throws PuzzleError when game.pgn is missing', () => {
    const bad = { game: {}, puzzle: FIXTURE.puzzle };
    expect(() => parseLichessPuzzle(bad)).toThrow(PuzzleError);
    expect(() => parseLichessPuzzle(bad)).toThrow(/game\.pgn/);
  });

  it('throws PuzzleError when puzzle.solution is missing', () => {
    const { solution: _solution, ...rest } = FIXTURE.puzzle;
    const bad = { game: FIXTURE.game, puzzle: rest };
    expect(() => parseLichessPuzzle(bad)).toThrow(PuzzleError);
    expect(() => parseLichessPuzzle(bad)).toThrow(/solution/);
  });

  it('throws PuzzleError when the response is not an object', () => {
    expect(() => parseLichessPuzzle(null)).toThrow(PuzzleError);
    expect(() => parseLichessPuzzle('nope')).toThrow(PuzzleError);
  });

  it('throws PuzzleError when initialPly does not match the pgn ply count', () => {
    const bad = { game: FIXTURE.game, puzzle: { ...FIXTURE.puzzle, initialPly: 10 } };
    expect(() => parseLichessPuzzle(bad)).toThrow(PuzzleError);
    expect(() => parseLichessPuzzle(bad)).toThrow(/initialPly/);
  });
});

describe('fetchNextPuzzle', () => {
  it('fetches and parses on success', async () => {
    const fakeFetch = (async (url: string | URL) => {
      expect(String(url)).toBe('https://lichess.org/api/puzzle/next');
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as typeof fetch;
    const result = await fetchNextPuzzle(fakeFetch);
    expect(result.id).toBe('tBsnX');
  });

  it('gives an explicit message on 429', async () => {
    const fakeFetch = (async () => new Response('', { status: 429 })) as typeof fetch;
    await expect(fetchNextPuzzle(fakeFetch)).rejects.toThrow(/429/);
  });

  it('gives an explicit message on 404', async () => {
    const fakeFetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(fetchNextPuzzle(fakeFetch)).rejects.toThrow(/no next puzzle/);
  });

  it('gives an explicit message on other non-ok statuses', async () => {
    const fakeFetch = (async () => new Response('', { status: 500, statusText: 'Internal Server Error' })) as typeof fetch;
    await expect(fetchNextPuzzle(fakeFetch)).rejects.toThrow(/500/);
  });
});

describe('fetchPuzzleById', () => {
  it('requests the id-specific URL and parses on success', async () => {
    const fakeFetch = (async (url: string | URL) => {
      expect(String(url)).toBe('https://lichess.org/api/puzzle/tBsnX');
      return new Response(JSON.stringify(FIXTURE), { status: 200 });
    }) as typeof fetch;
    const result = await fetchPuzzleById('tBsnX', fakeFetch);
    expect(result.id).toBe('tBsnX');
  });

  it('gives an explicit message naming the id on 404', async () => {
    const fakeFetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    await expect(fetchPuzzleById('nope', fakeFetch)).rejects.toThrow(/"nope"/);
  });

  it('rejects a blank id without making a request', async () => {
    const fakeFetch = (async () => {
      throw new Error('should not be called');
    }) as typeof fetch;
    await expect(fetchPuzzleById('  ', fakeFetch)).rejects.toThrow(PuzzleError);
  });
});
