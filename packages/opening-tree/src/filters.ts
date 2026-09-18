// Pure predicate for narrowing which of a player's tracked games feed a GamesTree. Used both as
// `buildTree`'s own `opts.filter` (applied before folding, so `skipped.filteredOut` stays
// honest) and standalone by a caller that wants to re-filter an already-built tree's
// `tree.games` for its own display. No engine or judgement here — field comparisons only (V3
// doesn't apply: nothing here is a claim about a position).
import type { GameSpeed } from '@human-chess/import';
import type { TrackedGame } from './tree';

export interface GameFilter {
  speeds?: GameSpeed[] | undefined;
  rated?: boolean | undefined;
  opponentRatingMin?: number | undefined;
  opponentRatingMax?: number | undefined;
  /** Case-insensitive substring match against the opponent's name. */
  opponent?: string | undefined;
  /** ISO date (or full ISO instant); compared against `playedAt` as instants, inclusive at the
   * boundary. A bare date like "2026-09-01" is midnight UTC that day — `until: "2026-09-01"`
   * excludes games later the same day; pass a full instant (or the next day) for "through the
   * end of" a date. */
  since?: string | undefined;
  until?: string | undefined;
  sources?: Array<'lichess' | 'chess.com' | 'pgn'> | undefined;
}

/**
 * `game` passes `filter` when every field the filter actually sets matches. A game missing the
 * relevant meta (no `speed`/`rated`/`opponentRating` — lichess and chess.com both fill these in
 * for games they fetched, but a pasted PGN or an older fetch might not) passes a field the
 * filter leaves unset, but FAILS a field the filter does set: "unknown" is never treated as "yes,
 * matches", only as "this game can't be judged on that field, so it's excluded once you've asked
 * to be strict about it."
 */
export function matchesFilter(game: TrackedGame, filter: GameFilter): boolean {
  if (filter.speeds && filter.speeds.length > 0) {
    if (game.speed === undefined || !filter.speeds.includes(game.speed)) return false;
  }
  if (filter.rated !== undefined) {
    if (game.rated === undefined || game.rated !== filter.rated) return false;
  }
  if (filter.opponentRatingMin !== undefined) {
    if (game.opponentRating === undefined || game.opponentRating < filter.opponentRatingMin) return false;
  }
  if (filter.opponentRatingMax !== undefined) {
    if (game.opponentRating === undefined || game.opponentRating > filter.opponentRatingMax) return false;
  }
  if (filter.opponent !== undefined && filter.opponent.trim() !== '') {
    const needle = filter.opponent.toLowerCase();
    if (!game.opponent || !game.opponent.toLowerCase().includes(needle)) return false;
  }
  if (filter.since !== undefined) {
    const played = game.playedAt === undefined ? NaN : Date.parse(game.playedAt);
    const since = Date.parse(filter.since);
    // `Date.parse` returns NaN for a malformed string, and any `<`/`>` comparison against NaN is
    // always false — so without this explicit check, a malformed `playedAt` or `filter.since`
    // would silently PASS instead of being excluded as "unknown", the opposite of this file's own
    // stated convention (see the doc comment above).
    if (Number.isNaN(played) || Number.isNaN(since) || played < since) return false;
  }
  if (filter.until !== undefined) {
    const played = game.playedAt === undefined ? NaN : Date.parse(game.playedAt);
    const until = Date.parse(filter.until);
    if (Number.isNaN(played) || Number.isNaN(until) || played > until) return false;
  }
  if (filter.sources && filter.sources.length > 0) {
    if (!filter.sources.includes(game.source)) return false;
  }
  return true;
}
