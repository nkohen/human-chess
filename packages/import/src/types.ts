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
}
