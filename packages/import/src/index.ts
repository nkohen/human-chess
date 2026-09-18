// Shared game-import layer: turns a lichess username, a chess.com username, or pasted PGN into
// one ImportedGame shape, consumed by the memory trainer, the game reviewer, and the openings
// tools.
export type { GameSpeed, ImportedGame, ImportedGameMeta, RecentGamesResult } from './types';
export {
  fetchLatestLichessGame,
  fetchLichessGames,
  fetchRecentLichessGames,
  DEFAULT_MAX_LICHESS_GAMES,
  HARD_CAP_LICHESS_GAMES,
  LICHESS_GAMES_IDLE_TIMEOUT_MS,
  MAX_RECENT_LICHESS_GAMES,
  type FetchLichessGamesOpts,
  type FetchRecentLichessGamesOpts,
} from './lichess';
export { fetchLatestChesscomGame, fetchRecentChesscomGames, MAX_RECENT_CHESSCOM_GAMES, type FetchRecentChesscomGamesOpts } from './chesscom';
export { toImportedGames, type ImportedGamesResult } from './parse';
export {
  syncSourceGames,
  LICHESS_BACKFILL_WINDOW_MS,
  type SyncProgress,
  type SyncSourceGamesOpts,
  type SyncSourceGamesResult,
} from './sync';
export { fnv1aHash, gameId, normaliseGameUrl, toStoredGame, type StoredImportedGame } from './hash';
export { isImportedGame } from './validate';
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

export function importPgn(pgn: string): ImportedGame {
  return toImportedGame('pgn', pgn);
}
