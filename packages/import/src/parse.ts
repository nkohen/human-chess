// Builds an ImportedGame from raw PGN text, whatever its source. PGN parsing is delegated to
// @human-chess/rules (parsePgnGame/parsePgnGames), which is the only package allowed to import
// chessops.
import { parsePgnGame, parsePgnGames, type ParsedPgnGame } from '@human-chess/rules';
import type { GameSpeed, ImportedGame, ImportedGameMeta } from './types';

/** A fetcher's own more-authoritative values for `url`/`playedAt`/some of `meta`, when it has
 * them (e.g. chess.com's Published-Data API gives a structured `url`, a Unix `end_time`, and its
 * own `time_class`/`rated`/ratings fields alongside the PGN) — these win over whatever the PGN
 * headers say. Header-derived values are the fallback, used as-is for lichess (whose PGN headers
 * are the only source) and for the pasted-PGN path (which has no API response to draw from at
 * all). `meta` here only ever overrides `speed`/`rated`/`whiteElo`/`blackElo` — `eco`,
 * `openingName` and `timeControl` come from the PGN headers on every source, since chess.com's
 * PGNs carry ECO/TimeControl headers too and no fetcher has a JSON field for `Opening`. */
export interface ImportedGameOverrides {
  url?: string | undefined;
  playedAt?: string | undefined;
  meta?: Pick<ImportedGameMeta, 'speed' | 'rated' | 'whiteElo' | 'blackElo'> | undefined;
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
    meta: metaFromHeaders(headers, overrides.meta),
  };
}

/** lichess's six perf-type names, as they appear in the `[Event]` header's middle word
 * ("Rated Blitz game"), lowercased for case-insensitive matching. */
const SPEED_WORDS: Record<string, GameSpeed> = {
  ultrabullet: 'ultraBullet',
  bullet: 'bullet',
  blitz: 'blitz',
  rapid: 'rapid',
  classical: 'classical',
  correspondence: 'correspondence',
};

/** lichess's `[Event]` header reads e.g. "Rated Blitz game" for a normal game, but a tournament
 * or simul game shapes it differently: "Rated Blitz tournament https://lichess.org/tournament/…"
 * (URL trails the word "tournament", not anchored at the end of the string) or "Blitz simul
 * https://lichess.org/simul/…" (simuls often have no "Rated"/"Casual" word at all). Matched
 * case-insensitively; the optional leading word gives `rated` (undefined, not false, when it's
 * absent — a missing prefix means "unknown", not "known to be casual"), the word right before
 * "game"/"tournament"/"simul" gives `speed` when it names one of lichess's six perf types.
 * Anything that doesn't fit the pattern (a non-lichess Event, or a variant name in that slot)
 * leaves both undefined rather than guessing. */
function speedAndRatedFromEvent(event: string | undefined): { speed: GameSpeed | undefined; rated: boolean | undefined } {
  if (!event) return { speed: undefined, rated: undefined };
  const match = /^(?:(rated|casual)\s+)?(\S+)\s+(?:game|tournament|simul)\b/i.exec(event.trim());
  if (!match) return { speed: undefined, rated: undefined };
  const rated = match[1] ? match[1].toLowerCase() === 'rated' : undefined;
  const speed = SPEED_WORDS[match[2]!.toLowerCase()];
  return { speed, rated };
}

/** `[TimeControl "180+2"]` -> `{ initialSeconds: 180, incrementSeconds: 2 }`; a bare
 * `[TimeControl "300"]` (seen in chess.com PGNs) -> increment 0; `"-"` (no clock, e.g.
 * correspondence) or anything else that doesn't parse -> undefined, never guessed. */
function timeControlFromHeader(tc: string | undefined): ImportedGameMeta['timeControl'] {
  if (!tc) return undefined;
  const trimmed = tc.trim();
  if (trimmed === '-') return undefined;
  const withIncrement = /^(\d+)\+(\d+)$/.exec(trimmed);
  if (withIncrement) return { initialSeconds: Number(withIncrement[1]), incrementSeconds: Number(withIncrement[2]) };
  const bare = /^(\d+)$/.exec(trimmed);
  if (bare) return { initialSeconds: Number(bare[1]), incrementSeconds: 0 };
  return undefined;
}

/**
 * lichess's Speed rule (lila's `Speed` object / `byTime`, matched by the estimated-duration shape
 * lichess documents for its perf types) as a first guess: this codebase never fetches lichess.org
 * for tests or verification (no-live-probing rule), so this is written from the
 * commonly-documented formula, verified against scalachess Speed.scala/Clock.scala 2026-09-17 (no
 * live fetch — cross-checked from memory of that source, not a live probe). Estimated game
 * duration in seconds = `initialSeconds + 40 * incrementSeconds`; < 30 s ultraBullet, < 180 s
 * bullet, < 480 s blitz, < 1500 s rapid, < 21600 s (6 h) classical, else `correspondence` (lila's
 * `byTime` bucket for very long estimates, e.g. large-increment or no-clock-equivalent games sent
 * through with a TimeControl header lichess itself would classify that way). Only used when the
 * `[Event]` header itself doesn't already name a speed (chess.com PGNs and hand-edited PGNs have a
 * TimeControl header but no lichess-style Event line).
 */
function speedFromTimeControl(tc: ImportedGameMeta['timeControl']): GameSpeed | undefined {
  if (!tc) return undefined;
  const estimateSeconds = tc.initialSeconds + 40 * tc.incrementSeconds;
  if (estimateSeconds < 30) return 'ultraBullet';
  if (estimateSeconds < 180) return 'bullet';
  if (estimateSeconds < 480) return 'blitz';
  if (estimateSeconds < 1500) return 'rapid';
  if (estimateSeconds < 21_600) return 'classical';
  return 'correspondence';
}

/** `[WhiteElo]`/`[BlackElo]` as a number; a non-numeric value (lichess writes "?" for an
 * unrated/guest player) gives undefined rather than NaN or a fabricated rating. */
function eloFromHeader(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Builds `ImportedGame.meta` from a game's own PGN headers, then lets `override` (a fetcher's
 * more-authoritative JSON fields, e.g. chess.com's `time_class`/`rated`/ratings) win for the four
 * fields it can supply; `eco`/`openingName`/`timeControl` are always header-derived (see
 * ImportedGameOverrides's comment). */
function metaFromHeaders(
  headers: Record<string, string>,
  override?: ImportedGameOverrides['meta'],
): ImportedGameMeta {
  const { speed: eventSpeed, rated: eventRated } = speedAndRatedFromEvent(headers.Event);
  const timeControl = timeControlFromHeader(headers.TimeControl);
  const headerSpeed = eventSpeed ?? speedFromTimeControl(timeControl);
  return {
    speed: override?.speed ?? headerSpeed,
    rated: override?.rated ?? eventRated,
    whiteElo: override?.whiteElo ?? eloFromHeader(headers.WhiteElo),
    blackElo: override?.blackElo ?? eloFromHeader(headers.BlackElo),
    eco: headers.ECO,
    openingName: headers.Opening,
    timeControl,
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
