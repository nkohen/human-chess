// Shared game-import layer: turns a lichess username, a chess.com username, or pasted PGN into
// one ImportedGame shape, consumed by the memory trainer, the game reviewer, and the openings
// tools.
export type { GameSpeed, ImportedGame, ImportedGameMeta, RecentGamesResult } from './types';
export { fetchLatestLichessGame, fetchRecentLichessGames, MAX_RECENT_LICHESS_GAMES, type FetchRecentLichessGamesOpts } from './lichess';
export { fetchLatestChesscomGame, fetchRecentChesscomGames, MAX_RECENT_CHESSCOM_GAMES, type FetchRecentChesscomGamesOpts } from './chesscom';
export { toImportedGames, type ImportedGamesResult } from './parse';
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

export function importPgn(pgn: string): ImportedGame {
  return toImportedGame('pgn', pgn);
}
