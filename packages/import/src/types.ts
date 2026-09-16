// A game imported from somewhere, already parsed. PGN parsing itself lives in
// @human-chess/rules (the only package that imports chessops); this shape is what the rest
// of the app consumes regardless of where the game came from.
export interface ImportedGame {
  source: 'lichess' | 'pgn';
  /** The lichess username used to fetch it, when the source is 'lichess'. */
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
}
