// Builds an ImportedGame from raw PGN text, whatever its source. PGN parsing is delegated to
// @human-chess/rules (parsePgnGame/parsePgnGames), which is the only package allowed to import
// chessops.
import { parsePgnGame, parsePgnGames, type ParsedPgnGame } from '@human-chess/rules';
import type { ImportedGame } from './types';

/** A fetcher's own more-authoritative values for `url`/`playedAt`, when it has them (e.g.
 * chess.com's Published-Data API gives a structured `url` and a Unix `end_time` alongside the
 * PGN) — these win over whatever the PGN headers say. Header-derived values are the fallback,
 * used as-is for lichess (whose PGN headers are the only source) and for the pasted-PGN path
 * (which has no API response to draw from at all). */
export interface ImportedGameOverrides {
  url?: string | undefined;
  playedAt?: string | undefined;
}

export function toImportedGame(
  source: ImportedGame['source'],
  pgn: string,
  username?: string,
  overrides: ImportedGameOverrides = {},
): ImportedGame {
  return fromParsed(source, parsePgnGame(pgn), pgn, username, overrides);
}

export interface ImportedGamesResult {
  games: ImportedGame[];
  /** Games in the multi-game text that failed to parse (an illegal move, an unsupported
   * variant) and were skipped, per `@human-chess/rules`'s `parsePgnGames` — never thrown, so one
   * bad game in a fetched batch doesn't blank a caller's whole result. A caller reporting "N of
   * M games used" needs this alongside `games.length` for that count to stay honest: M is
   * `games.length + skipped`, not just however many games the site said it sent. */
  skipped: number;
}

/**
 * Every game in a multi-game PGN (e.g. lichess's `?max=N` export, which returns several games
 * separated by blank lines) as its own ImportedGame. There is no per-game JSON override here
 * (unlike chess.com's Published-Data API, lichess's multi-game export is PGN only) — each
 * game's url/playedAt come from its own headers, same as the single-game lichess path.
 */
export function toImportedGames(source: ImportedGame['source'], pgn: string, username?: string): ImportedGamesResult {
  const { games: parsed, skipped } = parsePgnGames(pgn);
  const games = parsed.map(p => fromParsed(source, p, p.pgn ?? pgn, username, {}));
  return { games, skipped };
}

function fromParsed(
  source: ImportedGame['source'],
  parsed: ParsedPgnGame,
  pgn: string,
  username: string | undefined,
  overrides: ImportedGameOverrides,
): ImportedGame {
  const { headers, startFen, ucis, sans } = parsed;
  const white = headers.White;
  const black = headers.Black;
  const result = headers.Result;
  return {
    source,
    username,
    pgn,
    headers,
    startFen,
    ucis,
    sans,
    white,
    black,
    result,
    playedAs: playedColor(username, white, black),
    url: overrides.url ?? urlFromHeaders(headers),
    playedAt: overrides.playedAt ?? playedAtFromHeaders(headers),
  };
}

/** A PGN `[Site]` (lichess's convention) or `[Link]` (chess.com's convention) header, when it's
 * actually a URL — never invented from, say, a bare event name. */
function urlFromHeaders(headers: Record<string, string>): string | undefined {
  const link = headers.Link;
  if (link && /^https?:\/\//.test(link)) return link;
  const site = headers.Site;
  if (site && /^https?:\/\//.test(site)) return site;
  return undefined;
}

/** `[UTCDate "2026.03.10"]` + `[UTCTime "18:00:00"]` -> "2026-03-10T18:00:00Z". Both headers
 * (lichess and chess.com PGNs both carry them) must be present and well-formed, or this returns
 * undefined rather than guessing at a partial or malformed value. */
function playedAtFromHeaders(headers: Record<string, string>): string | undefined {
  const date = headers.UTCDate;
  const time = headers.UTCTime;
  if (!date || !time) return undefined;
  const isoDate = date.replaceAll('.', '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return undefined;
  return `${isoDate}T${time}Z`;
}

function playedColor(
  username: string | undefined,
  white: string | undefined,
  black: string | undefined,
): 'white' | 'black' | undefined {
  if (!username) return undefined;
  const lower = username.toLowerCase();
  if (white?.toLowerCase() === lower) return 'white';
  if (black?.toLowerCase() === lower) return 'black';
  return undefined;
}
