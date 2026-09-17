// Builds an ImportedGame from raw PGN text, whatever its source. PGN parsing is delegated to
// @human-chess/rules (parsePgnGame), which is the only package allowed to import chessops.
import { parsePgnGame } from '@human-chess/rules';
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
  const { headers, startFen, ucis, sans } = parsePgnGame(pgn);
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
