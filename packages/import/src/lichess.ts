// Fetches a lichess player's most recent game through lichess's public game-export API — no
// OAuth, browser CORS is allowed. The PGN (moves, headers) lichess returns is game data,
// licensed CC0 by lichess; see memory/reuse-library.md.
import { toImportedGame } from './parse';
import type { ImportedGame } from './types';

const LICHESS_GAMES_URL = 'https://lichess.org/api/games/user';
// Restrict to the standard time controls so lichess itself excludes variant games (Chess960,
// Crazyhouse, ...) — parsePgnGame in @human-chess/rules also rejects an unsupported Variant
// header, but filtering server-side means we never fetch one in the first place.
const STANDARD_PERF_TYPES = 'ultraBullet,bullet,blitz,rapid,classical,correspondence';
const TIMEOUT_MS = 15_000;

export async function fetchLatestLichessGame(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImportedGame> {
  const url = `${LICHESS_GAMES_URL}/${encodeURIComponent(username)}?max=1&moves=true&tags=true&perfType=${STANDARD_PERF_TYPES}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/x-chess-pgn' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('lichess did not answer within 15 s');
    }
    throw err;
  }

  if (response.status === 404) {
    throw new Error(`no lichess user "${username}"`);
  }
  if (response.status === 429) {
    throw new Error('lichess rate-limited this request; wait a moment and try again');
  }
  if (!response.ok) {
    throw new Error(`lichess game export failed: HTTP ${response.status}`);
  }

  const pgn = (await response.text()).trim();
  if (!pgn) {
    throw new Error(`${username} has no games on lichess`);
  }

  const game = toImportedGame('lichess', pgn, username);
  if (game.ucis.length === 0) {
    throw new Error(`${username}'s latest game on lichess has no moves`);
  }
  return game;
}
