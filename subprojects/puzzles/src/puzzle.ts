// Lichess puzzle API client and parser. Data: lichess puzzles, CC0
// (https://database.lichess.org/#puzzles — "This database is made available under the
// Creative Commons CC0 License"). CC0 is compatible with the project's AGPL-3.0-or-later
// (memory/reuse-library.md).
//
// This slice uses the live puzzle API (https://lichess.org/api/puzzle/{next,daily,<id>})
// rather than the bulk CSV dump. Observed shape (curled 2026-09-16, both `/next` and
// `/daily`):
//   {
//     game: { id, perf: { key, name }, rated, players: [{ name, id, color, rating }, ...],
//              pgn: string, clock?: string },
//     puzzle: { id, rating, plays, solution: string[] (UCI), themes: string[], initialPly }
//   }
// `game.pgn` is bare SAN movetext with no move numbers and no result marker (e.g.
// "e4 e5 Nf3 Nc6 ..."). Playing every move of it from the start reaches the puzzle position;
// `parsePgnGame` (chessops-backed, tolerant of headerless/number-less movetext) was verified
// against this exact shape. `puzzle.initialPly` is the ply count of `game.pgn`; the number of
// plies parsed out of the pgn must equal `initialPly + 1` — a guard against lichess ever
// changing this contract silently, since a silently-wrong puzzle position would violate A1.
import { cachedLichessJson, lichessFetch, type LichessFetchImpl } from '@human-chess/lichess';
import {
  fenOf, parsePgnGame, playUci, positionFromFen, turn, type Color,
} from '@human-chess/rules';

// Puzzles are immutable once created (lichess never edits a puzzle's game/solution in place),
// so an individual puzzle fetched by id is safe to cache for a long time.
const PUZZLE_BY_ID_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class PuzzleError extends Error {}

export interface ParsedPuzzle {
  id: string;
  rating: number;
  themes: string[];
  /** FEN of the position the solver must move in — after every move of game.pgn is played. */
  startFen: string;
  solverColor: Color;
  /** The engine-verified winning line for this puzzle, as UCI moves, straight from lichess (A1). */
  solution: string[];
  /** SAN of every move played to reach startFen, for context/display. */
  setupSans: string[];
  /** The source game's lichess URL, when `game.id` is present in the response (observed shape
   * always has it, but it isn't required by asLichessPuzzleResponse above, so this stays
   * optional rather than asserting on a field this module doesn't otherwise depend on). First
   * guess: lichess's own game URL convention is "https://lichess.org/{id}" — not re-derived
   * from any other field, and never fabricated when `game.id` is missing. */
  gameUrl: string | undefined;
}

interface RawLichessPuzzleResponse {
  game: { pgn: string; id?: string };
  puzzle: {
    id: string;
    rating: number;
    plays: number;
    solution: string[];
    themes: string[];
    initialPly: number;
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}

/** Validates the shape this module depends on; throws PuzzleError naming what was wrong. */
function asLichessPuzzleResponse(json: unknown): RawLichessPuzzleResponse {
  if (typeof json !== 'object' || json === null) {
    throw new PuzzleError('lichess puzzle response was not a JSON object');
  }
  const { game, puzzle } = json as Record<string, unknown>;
  if (typeof game !== 'object' || game === null || typeof (game as Record<string, unknown>).pgn !== 'string') {
    throw new PuzzleError('lichess puzzle response is missing a string "game.pgn"');
  }
  const gameId = (game as Record<string, unknown>).id;
  if (gameId !== undefined && typeof gameId !== 'string') {
    throw new PuzzleError('lichess puzzle response has a non-string "game.id"');
  }
  if (typeof puzzle !== 'object' || puzzle === null) {
    throw new PuzzleError('lichess puzzle response is missing a "puzzle" object');
  }
  const p = puzzle as Record<string, unknown>;
  if (typeof p.id !== 'string') throw new PuzzleError('lichess puzzle response is missing "puzzle.id"');
  if (typeof p.rating !== 'number') throw new PuzzleError('lichess puzzle response is missing numeric "puzzle.rating"');
  if (typeof p.plays !== 'number') throw new PuzzleError('lichess puzzle response is missing numeric "puzzle.plays"');
  if (!isStringArray(p.solution) || p.solution.length === 0) {
    throw new PuzzleError('lichess puzzle response is missing a non-empty "puzzle.solution" array of UCI moves');
  }
  if (!isStringArray(p.themes)) throw new PuzzleError('lichess puzzle response is missing a "puzzle.themes" array');
  if (typeof p.initialPly !== 'number') throw new PuzzleError('lichess puzzle response is missing numeric "puzzle.initialPly"');
  return json as RawLichessPuzzleResponse;
}

/** Parses a lichess puzzle-API JSON body (from /api/puzzle/next, /daily, or /{id}) into a ParsedPuzzle. */
export function parseLichessPuzzle(json: unknown): ParsedPuzzle {
  const { game, puzzle } = asLichessPuzzleResponse(json);

  const parsed = parsePgnGame(game.pgn);
  if (parsed.ucis.length !== puzzle.initialPly + 1) {
    throw new PuzzleError(
      `lichess puzzle "${puzzle.id}": game.pgn has ${parsed.ucis.length} plies but initialPly is ` +
        `${puzzle.initialPly} (expected ${puzzle.initialPly + 1} plies) — cannot trust the reconstructed position`,
    );
  }

  let pos = positionFromFen(parsed.startFen);
  for (const uci of parsed.ucis) {
    pos = playUci(pos, uci).pos;
  }

  return {
    id: puzzle.id,
    rating: puzzle.rating,
    themes: puzzle.themes,
    startFen: fenOf(pos),
    solverColor: turn(pos),
    solution: puzzle.solution,
    setupSans: parsed.sans,
    gameUrl: game.id !== undefined ? `https://lichess.org/${game.id}` : undefined,
  };
}

type FetchFn = LichessFetchImpl;

async function parseFetchedPuzzle(res: Response, notFoundMessage: string): Promise<ParsedPuzzle> {
  if (res.status === 404) throw new PuzzleError(notFoundMessage);
  if (res.status === 429) throw new PuzzleError('lichess rate-limited this request (HTTP 429) — wait a moment and try again');
  if (!res.ok) throw new PuzzleError(`lichess puzzle API returned HTTP ${res.status} ${res.statusText}`);
  const json: unknown = await res.json();
  return parseLichessPuzzle(json);
}

/** Fetches a fresh puzzle from https://lichess.org/api/puzzle/next. Never cached — "next" must
 * return a different puzzle each time. */
export async function fetchNextPuzzle(fetchImpl: FetchFn = lichessFetch): Promise<ParsedPuzzle> {
  const res = await fetchImpl('https://lichess.org/api/puzzle/next');
  return parseFetchedPuzzle(res, 'lichess had no next puzzle to give');
}

/**
 * Fetches a specific puzzle by id from https://lichess.org/api/puzzle/{id}, through the shared
 * 24 h localStorage cache (puzzles are immutable, so a cache hit is always correct). A cache
 * hit resolves from localStorage with no network call and no queue interaction, per cache.ts.
 * On a miss, `fetchImpl` runs and its status is checked before the (2xx-only) response reaches
 * the cache, so a 404/429/other error is never itself cached.
 */
export async function fetchPuzzleById(id: string, fetchImpl: FetchFn = lichessFetch): Promise<ParsedPuzzle> {
  const trimmed = id.trim();
  if (!trimmed) throw new PuzzleError('a puzzle id is required');
  const url = `https://lichess.org/api/puzzle/${encodeURIComponent(trimmed)}`;

  const statusCheckedFetchImpl: FetchFn = async (input, init) => {
    const res = await fetchImpl(input, init);
    if (res.status === 404) throw new PuzzleError(`no puzzle found with id "${trimmed}"`);
    if (res.status === 429) throw new PuzzleError('lichess rate-limited this request (HTTP 429) — wait a moment and try again');
    if (!res.ok) throw new PuzzleError(`lichess puzzle API returned HTTP ${res.status} ${res.statusText}`);
    return res;
  };

  const json = await cachedLichessJson<unknown>(url, PUZZLE_BY_ID_CACHE_TTL_MS, undefined, statusCheckedFetchImpl);
  return parseLichessPuzzle(json);
}
