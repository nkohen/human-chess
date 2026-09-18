// A game imported from somewhere, already parsed. PGN parsing itself lives in
// @human-chess/rules (the only package that imports chessops); this shape is what the rest
// of the app consumes regardless of where the game came from.
export interface ImportedGame {
  source: 'lichess' | 'chess.com' | 'pgn';
  /** The lichess or chess.com username used to fetch it, when the source is 'lichess' or
   * 'chess.com'. */
  username: string | undefined;
  pgn: string;
  headers: Record<string, string>;
  startFen: string;
  ucis: string[];
  sans: string[];
  white: string | undefined;
  black: string | undefined;
  result: string | undefined;
  /** Which colour `username` played, by case-insensitive match against the White/Black headers. */
  playedAs: 'white' | 'black' | undefined;
  /** The game's page on its source site, when known: lichess's `[Site]` header, chess.com's
   * `[Link]` header (or the Published-Data API's own `url` field, preferred when a fetcher has
   * it), or undefined for a pasted PGN without such a header. Never fabricated. */
  url: string | undefined;
  /** When the game was played, as an ISO-8601 UTC instant (e.g. "2026-03-10T18:00:00Z"), when
   * known: derived from the PGN's `[UTCDate]`/`[UTCTime]` headers, or from chess.com's own
   * `end_time` (preferred when a fetcher has it, since it's an unambiguous Unix timestamp
   * rather than a parsed header pair). Undefined when neither is available — never fabricated. */
  playedAt: string | undefined;
  /** Game metadata for filtering and per-move statistics (opening-tree analysis, 2026-09-17).
   * Every field is optional and undefined when the source did not say — never inferred from
   * anything but the source's own headers or API fields. */
  meta?: ImportedGameMeta;
}

/** Normalised across sites: lichess's perf types and chess.com's `time_class` both map onto
 * `speed`; chess.com's "daily" is `correspondence`. */
export type GameSpeed = 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface ImportedGameMeta {
  /** From lichess's `[Event]` header ("Rated Blitz game") or chess.com's `time_class`. */
  speed?: GameSpeed | undefined;
  /** From lichess's `[Event]` header ("Rated …"/"Casual …") or chess.com's `rated` field. */
  rated?: boolean | undefined;
  /** `[WhiteElo]`/`[BlackElo]` headers or chess.com's `white.rating`/`black.rating`, as numbers. */
  whiteElo?: number | undefined;
  blackElo?: number | undefined;
  /** `[ECO]` header, when present. */
  eco?: string | undefined;
  /** `[Opening]` header (lichess sends it with `opening=true`), when present. */
  openingName?: string | undefined;
  /** The clock in seconds+increment from `[TimeControl "180+2"]`, when it parses. */
  timeControl?: { initialSeconds: number; incrementSeconds: number } | undefined;
}

/**
 * Shared result shape for both `fetchRecentLichessGames` and `fetchRecentChesscomGames` (M1,
 * 2026-09-17): `games` is every game that parsed cleanly; `skipped` is how many the fetch found
 * but could not turn into an ImportedGame (an illegal move, an unsupported PGN variant) — caught
 * and counted rather than letting one bad game blank the whole batch. A caller reporting "folded
 * N of M games" needs `games.length + skipped` for M, not just `games.length`, or that count
 * quietly stops including games the fetch actually saw.
 */
export interface RecentGamesResult {
  games: ImportedGame[];
  skipped: number;
}
