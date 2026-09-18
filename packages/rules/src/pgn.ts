// PGN parsing: a thin wrapper over chessops/pgn + chessops/san (GPL-3.0-or-later, lichess).
// Chessops is only ever imported inside this package. Only the FIRST game in the text is
// parsed; chessops' `mainline()` walks only the first child at each ply, so comments and
// side variations are skipped for free.
import { makePgn, parsePgn, startingPosition } from 'chessops/pgn';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { RulesError } from './index.js';

export interface ParsedPgnGame {
  headers: Record<string, string>;
  startFen: string;
  ucis: string[];
  sans: string[];
  /** This one game's own PGN text, reconstructed by chessops (`makePgn`) from the parsed game
   * rather than sliced out of a longer multi-game string (there is no reliable separator to
   * slice on). Only `parsePgnGames` populates this — `parsePgnGame`'s caller already has the
   * source text (it's the whole argument), so it has no need for a copy back. */
  pgn?: string;
}

/** Variant headers this package's Position (standard chessops Chess) can represent. Anything
 * else (Crazyhouse, Atomic, Antichess, ...) needs its own rules object chessops does not give
 * us here, so it is rejected rather than silently parsed as if it were standard chess. */
const SUPPORTED_VARIANTS = new Set(['standard', 'chess960', 'from position']);

type ChessopsGame = ReturnType<typeof parsePgn>[number];

/** Shared by `parsePgnGame` and `parsePgnGames`: headers, start position, and the move list as
 * UCI+SAN, from one already-parsed chessops game. Throws RulesError, naming the move number, on
 * an unparseable move, and rejects a `Variant` header outside Standard/Chess960/From Position
 * (missing header means standard). */
function parsedFromChessopsGame(game: ChessopsGame, includePgn: boolean): ParsedPgnGame {
  const headers: Record<string, string> = {};
  for (const [key, value] of game.headers) headers[key] = value;

  const variant = headers.Variant;
  if (variant !== undefined && !SUPPORTED_VARIANTS.has(variant.trim().toLowerCase())) {
    throw new RulesError(`unsupported PGN variant "${variant}"; only Standard, Chess960, and From Position are supported`);
  }

  const startResult = startingPosition(game.headers);
  if (startResult.isErr) {
    throw new RulesError(`invalid PGN starting position: ${startResult.error.message}`);
  }
  const startFen = makeFen(startResult.value.toSetup());
  // The move-number-in-error below is anchored to the real start position, not always White
  // to move 1 (a FEN start can begin with Black to move at any fullmove number).
  const startColor = startResult.value.turn;
  const startFullmove = startResult.value.fullmoves;

  const pos = startResult.value.clone();
  const ucis: string[] = [];
  const sans: string[] = [];
  let ply = 0;
  for (const node of game.moves.mainline()) {
    ply += 1;
    const move = parseSan(pos, node.san);
    if (!move) {
      const offset = startColor === 'white' ? 1 : 0;
      const moveNumber = startFullmove + Math.floor((ply - offset) / 2);
      throw new RulesError(`unparseable move at move ${moveNumber} ("${node.san}")`);
    }
    ucis.push(makeUci(move));
    sans.push(node.san);
    pos.play(move);
  }

  return { headers, startFen, ucis, sans, ...(includePgn ? { pgn: makePgn(game) } : {}) };
}

/** Parses the first game in `pgn`. */
export function parsePgnGame(pgn: string): ParsedPgnGame {
  const games = parsePgn(pgn);
  const game = games[0];
  if (!game) throw new RulesError('no game found in PGN text');
  return parsedFromChessopsGame(game, false);
}

export interface ParsePgnGamesResult {
  games: ParsedPgnGame[];
  /** Games chessops split `pgn` into that failed to convert (an unparseable move, an
   * unsupported Variant header) — caught individually so one bad game in a multi-game export
   * doesn't discard every other game alongside it. Only a RulesError is swallowed this way;
   * anything else still propagates as a real bug. */
  skipped: number;
}

/**
 * Every game found in `pgn` — chessops' own parser already treats a PGN's game boundaries
 * (blank line before the next `[Event ...]` header block) as separating games, which is exactly
 * lichess's multi-game export format. Each result's `pgn` field is that one game's own
 * reconstructed text, so a caller that needs one game's raw PGN (not just its parsed fields)
 * doesn't have to re-slice the original string.
 *
 * Converted one game at a time (not a single `.map()`) precisely so one malformed game — an
 * illegal move chessops' lenient PGN parse let through, an unsupported variant — can be skipped
 * without an exception unwinding past every other, perfectly good, game in the same export.
 */
export function parsePgnGames(pgn: string): ParsePgnGamesResult {
  const games: ParsedPgnGame[] = [];
  let skipped = 0;
  for (const game of parsePgn(pgn)) {
    try {
      games.push(parsedFromChessopsGame(game, true));
    } catch (err) {
      if (!(err instanceof RulesError)) throw err;
      skipped += 1;
    }
  }
  return { games, skipped };
}
