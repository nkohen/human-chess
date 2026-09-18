// Stable id for a stored game, plus the `StoredImportedGame` shape this package passes to
// @human-chess/store's generic `GamesStore<G>`. Lives here (not in packages/store) because it
// needs `ImportedGame` — see packages/store/src/types.ts's header comment for why that package
// stays generic and import-agnostic instead (moved here 2026-09-17, code review: the reverse
// dependency made the pnpm workspace graph a real cycle at runtime, not just a type-only one).
import type { StoredGame } from '@human-chess/store';
import type { ImportedGame } from './types';

/** What this package stores via `GamesStore`: every `ImportedGame` field plus the `id` the store
 * dedupes on. A caller wanting a store typed for this package's games uses
 * `GamesStore<StoredImportedGame>` (see sync.ts). */
export type StoredImportedGame = ImportedGame & StoredGame;

/**
 * FNV-1a, 32-bit, as an 8-hex-digit string. Chosen because it's a few lines of well-known
 * integer math with no dependency and no async step (`crypto.subtle.digest` is async, awkward
 * to thread through a value that's otherwise computed synchronously while building a
 * `StoredImportedGame[]`); this is not a cryptographic hash and isn't trying to be one — it only
 * needs to make two *different* games' ids collide by accident vanishingly rarely for one
 * person's own game history (at most a few thousand games), not resist a deliberate collision
 * attack.
 */
export function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // hash = (hash * 0x01000193) >>> 0, done with shifts/adds to stay in 32-bit integer math
    // (see the well-known FNV-1a reference algorithm) rather than risking float precision loss
    // from `Math.imul`-free multiplication of two large numbers.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Collapses different spellings of the same game URL to one canonical form, so `gameId` dedupes
 * them to the same stored id: strips a `#...` fragment, a trailing `/white` or `/black`
 * orientation suffix (lichess and chess.com both let a URL end in the viewed side), and a
 * trailing slash; then, for a lichess URL whose path is a 12-character id (lichess's
 * "player-perspective" full id: the 8-character game id plus a 4-character player id, e.g. from
 * a mobile share link), collapses it to the first 8 characters — the plain game id every other
 * lichess URL for the same game uses.
 */
export function normaliseGameUrl(url: string): string {
  let u = url.split('#')[0]!.replace(/\/+$/, '');
  u = u.replace(/\/(?:white|black)$/i, '').replace(/\/+$/, '');
  const lichessFullId = /^(https?:\/\/lichess\.org\/)([0-9A-Za-z]{12})$/.exec(u);
  if (lichessFullId) return lichessFullId[1] + lichessFullId[2]!.slice(0, 8);
  return u;
}

/** The `id` a StoredImportedGame gets: the game's own `url` (normalised — see
 * `normaliseGameUrl`) when it has one (every real lichess/chess.com fetch does), else
 * `pgn:<fnv1a hash of the pgn text>` — the `pgn:` prefix keeps hash-based ids visibly distinct
 * from url-based ones (both are just opaque strings to the store itself, but a developer reading
 * stored data benefits from the tag). */
export function gameId(game: Pick<ImportedGame, 'url' | 'pgn'>): string {
  return game.url ? normaliseGameUrl(game.url) : `pgn:${fnv1aHash(game.pgn)}`;
}

/** Convenience for a caller (this package's own syncSourceGames) turning a freshly-fetched batch
 * of ImportedGame into what `GamesStore<StoredImportedGame>.putGames` wants. */
export function toStoredGame(game: ImportedGame): StoredImportedGame {
  return { ...game, id: gameId(game) };
}
