// Builds an ImportedGame from raw PGN text, whatever its source. PGN parsing is delegated to
// @human-chess/rules (parsePgnGame), which is the only package allowed to import chessops.
import { parsePgnGame } from '@human-chess/rules';
import type { ImportedGame } from './types';

export function toImportedGame(source: ImportedGame['source'], pgn: string, username?: string): ImportedGame {
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
  };
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
