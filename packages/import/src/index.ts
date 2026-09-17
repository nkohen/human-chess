// Shared game-import layer: turns a lichess username, a chess.com username, or pasted PGN into
// one ImportedGame shape, consumed by the memory trainer, the game reviewer, and the openings
// tools.
export type { ImportedGame } from './types';
export { fetchLatestLichessGame } from './lichess';
export { fetchLatestChesscomGame } from './chesscom';
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

export function importPgn(pgn: string): ImportedGame {
  return toImportedGame('pgn', pgn);
}
