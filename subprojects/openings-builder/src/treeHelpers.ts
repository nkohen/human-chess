// Pure helpers for the "Your games" opening-tree analysis (openingtree.com-style, over the
// user's own synced games — memory/subprojects/openings-builder-trainer.md). No React, no
// browser storage, no chess rules beyond what a caller already computed — kept here purely so
// they're unit-testable in plain vitest with no DOM (treeHelpers.test.ts).
import type { GameSpeed } from '@human-chess/import';
import type { Color } from '@human-chess/rules';

/** What the "Your games" view needs from the build tab's currently selected opening to offer
 * "Add to <name>": its display name, its colour (only surfaced when it matches the tree's own
 * colour — a black-repertoire opening has no use for a move from a white-perspective tree), and
 * a callback that adds a whole line, from the opening's own root, and persists. A *line* rather
 * than a single (epd, uci) pair: this view's own EPDs are keyed into the games tree, not
 * necessarily a node the target opening has ever reached — `addMove` on an opening throws on an
 * unknown `fromEpd` (repertoire.ts) rather than silently creating an orphan node, so the caller
 * (OpeningsBuilder) walks the opening's own tree from its root instead, adding each move of
 * `ucis` in turn. Kept as a closure so this file never has to import the repertoire model.
 * Defined here (not in GamesTreeView.tsx) so MoveTree.tsx and Diagnostics.tsx can reference the
 * type too without an import cycle; GamesTreeView.tsx re-exports it for existing callers. */
export interface GamesTreeTarget {
  name: string;
  color: Color;
  addLine: (ucis: string[]) => void;
}

/** ucis along a path of edges, in order — `GamesTreeTarget.addLine` and the "Add to <opening>"
 * button both want a flat uci list, while the rest of the UI keeps the richer per-step objects
 * (san, count, results, ...) for display. */
export function pathToUcis(path: Array<{ uci: string }>): string[] {
  return path.map(step => step.uci);
}

/**
 * A stable key for a path (root first), used to key MoveTree's `expanded`/`showAll` UI state and
 * `expandRequest` application. Keying by *path* rather than by the EPD a path ends at matters
 * because a real game can cycle back to an earlier position (e.g. `1.Nf3 Nf6 2.Ng1 Ng8` returns to
 * the start EPD) — an EPD-keyed set would then treat every occurrence of that EPD as "already
 * expanded" and MoveTree's recursion would re-enter the same subtree forever with an ever-growing
 * path. Keying by the sequence of moves taken to reach a node keeps each occurrence independent.
 * The empty path's key is `''` (the tree root).
 */
export function pathKey(path: Array<{ uci: string }>): string {
  return pathToUcis(path).join(' ');
}

/**
 * Walks `sanLine` (SAN moves, root first — the shape `worstMoves`/`mostLostPositions`/`lineTo`
 * return) down the tree exposed by `childrenAt`, matching each SAN against the current node's
 * children in turn. Stops at the first SAN with no matching child (shouldn't happen for a line
 * the tree itself produced, but a diagnostics "Show" button should land as far as it safely can
 * rather than throw). Generic over the child shape so this needs no @human-chess/opening-tree
 * types to unit-test — GamesTreeView/Diagnostics call it with `childrenOf(tree, epd)`.
 */
export function pathFromSanLine<M extends { san: string; to: string }>(
  root: string,
  childrenAt: (epd: string) => M[],
  sanLine: string[],
): M[] {
  const path: M[] = [];
  let epd = root;
  for (const san of sanLine) {
    const step = childrenAt(epd).find(child => child.san === san);
    if (!step) break;
    path.push(step);
    epd = step.to;
  }
  return path;
}

/**
 * `dateStr` ("yyyy-mm-dd", what a native `<input type="date">` gives back) as the ISO instant
 * for the END of that day in UTC. `@human-chess/opening-tree`'s `GameFilter.until` compares
 * against `playedAt` instants inclusively, and a bare date parses as that day's midnight — using
 * it as-is for "until" would exclude every game played later the same day (filters.ts's own doc
 * comment). Returns undefined for an empty or unparseable input rather than fabricating a date.
 */
export function endOfDayIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  const ms = Date.parse(`${dateStr}T23:59:59.999Z`);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/**
 * A short relative label for a `playedAt` instant ("3d ago", "2mo ago", ...), falling back to a
 * plain "yyyy-mm-dd" once it's over a year old (or in the future, or unparseable) — never
 * invents a date for `undefined`. `now` is injectable for tests; defaults to the real clock.
 */
export function formatLastPlayed(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const played = Date.parse(iso);
  if (Number.isNaN(played)) return '—';
  const diff = now - played;
  if (diff < 0) return iso.slice(0, 10);
  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)}m ago`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)}h ago`;
  if (diff < MONTH_MS) return `${Math.floor(diff / DAY_MS)}d ago`;
  if (diff < YEAR_MS) return `${Math.floor(diff / MONTH_MS)}mo ago`;
  return iso.slice(0, 10);
}

/** Filter state as the filter bar edits it — a superset of @human-chess/opening-tree's
 * `GameFilter` shaped for form controls: `since`/`until` stay plain "yyyy-mm-dd" strings (what
 * the date inputs hold; `endOfDayIso` above adjusts `until` only at tree-build time, not here),
 * `rated` is a three-way choice instead of `boolean | undefined`, and `sourceKeys` narrows which
 * *linked accounts'* games feed the tree at all (a different axis from GameFilter's own
 * `sources`, which filters by host type per game — see GamesTreeView's comment on why both
 * exist). Every field is a required key typed `T | undefined` rather than optional, so this
 * project's `exactOptionalPropertyTypes` convention (see @human-chess/store's StoredGame comment)
 * never gets in the way of writing `undefined` back into one. */
export interface YourGamesFilterState {
  speeds: GameSpeed[];
  rated: 'all' | 'rated' | 'casual';
  opponentRatingMin: number | undefined;
  opponentRatingMax: number | undefined;
  opponent: string;
  since: string;
  until: string;
  /** `${site}:${username.toLowerCase()}` keys of the linked accounts whose games are included;
   * empty means "all" (same "empty = all" convention as `speeds`). */
  sourceKeys: string[];
}

export const DEFAULT_FILTER_STATE: YourGamesFilterState = {
  speeds: [],
  rated: 'all',
  opponentRatingMin: undefined,
  opponentRatingMax: undefined,
  opponent: '',
  since: '',
  until: '',
  sourceKeys: [],
};

const SPEED_VALUES: readonly GameSpeed[] = ['ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence'];
const RATED_VALUES = ['all', 'rated', 'casual'] as const;

function isGameSpeed(v: unknown): v is GameSpeed {
  return typeof v === 'string' && (SPEED_VALUES as readonly string[]).includes(v);
}

/** JSON round-trip for `YourGamesFilterState`, tolerant of anything malformed (missing keys, a
 * garbage type on one field, or not-JSON at all) — every field falls back to
 * `DEFAULT_FILTER_STATE`'s value independently, rather than the whole object being discarded for
 * one bad field. */
export function serializeFilterState(state: YourGamesFilterState): string {
  return JSON.stringify(state);
}

export function parseFilterState(raw: string | null | undefined): YourGamesFilterState {
  if (!raw) return DEFAULT_FILTER_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_FILTER_STATE;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_FILTER_STATE;
  const p = parsed as Record<string, unknown>;
  const speeds = Array.isArray(p.speeds) ? p.speeds.filter(isGameSpeed) : DEFAULT_FILTER_STATE.speeds;
  const rated = typeof p.rated === 'string' && (RATED_VALUES as readonly string[]).includes(p.rated) ? (p.rated as YourGamesFilterState['rated']) : DEFAULT_FILTER_STATE.rated;
  const opponentRatingMin = typeof p.opponentRatingMin === 'number' && Number.isFinite(p.opponentRatingMin) ? p.opponentRatingMin : undefined;
  const opponentRatingMax = typeof p.opponentRatingMax === 'number' && Number.isFinite(p.opponentRatingMax) ? p.opponentRatingMax : undefined;
  const opponent = typeof p.opponent === 'string' ? p.opponent : DEFAULT_FILTER_STATE.opponent;
  const since = typeof p.since === 'string' ? p.since : DEFAULT_FILTER_STATE.since;
  const until = typeof p.until === 'string' ? p.until : DEFAULT_FILTER_STATE.until;
  const sourceKeys = Array.isArray(p.sourceKeys) ? p.sourceKeys.filter((k): k is string => typeof k === 'string') : DEFAULT_FILTER_STATE.sourceKeys;
  return { speeds, rated, opponentRatingMin, opponentRatingMax, opponent, since, until, sourceKeys };
}

/** win/draw/loss as percentages of `total`, or all-zero for a count of 0 (never NaN) — shared by
 * MoveTree's and Diagnostics' win/draw/loss bars. */
export function wdlPercents(r: { wins: number; draws: number; losses: number }): { win: number; draw: number; loss: number } {
  const total = r.wins + r.draws + r.losses;
  if (total <= 0) return { win: 0, draw: 0, loss: 0 };
  return { win: (r.wins / total) * 100, draw: (r.draws / total) * 100, loss: (r.losses / total) * 100 };
}

/** The win/draw/loss bar's hover text. */
export function wdlTitle(pct: { win: number; draw: number; loss: number }, total: number): string {
  return `Won ${pct.win.toFixed(1)}% · Drew ${pct.draw.toFixed(1)}% · Lost ${pct.loss.toFixed(1)}% (${total} game${total === 1 ? '' : 's'}, your side)`;
}

/** The Perf. column's title attribute — cites the formula from opening-tree/src/tree.ts's own
 * doc comment on `TreeMove.performance` verbatim in spirit, so a reader never has to guess what
 * "est." means. */
export const PERFORMANCE_TITLE =
  'Estimated performance rating: average opponent rating + 400 × (wins − losses) / games, over this move\'s games with a known opponent rating. A common simplification, not a real (nonlinear) FIDE performance calculation — an estimate, not a rating.';

const SKIPPED_LABELS: Record<string, string> = {
  notPlayer: 'not this player',
  wrongColor: 'wrong colour',
  selfPlay: 'self-play',
  undecided: 'undecided',
  unparsable: 'unparsable',
  filteredOut: 'filtered out',
};

/** A muted "N not this player, M wrong colour, ..." breakdown of a `GamesTree.skipped` record —
 * only the non-zero categories, in `skipped`'s own key order, joined with commas. `''` when
 * every category is 0 (a caller shows nothing extra in that case). Every number here is read
 * straight off the tree's own bookkeeping, never recomputed or guessed (A1). */
export function formatSkippedBreakdown(skipped: Record<string, number>): string {
  return Object.entries(skipped)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${SKIPPED_LABELS[key] ?? key}`)
    .join(', ');
}

/** `${site}:${username.toLowerCase()}` — the one key both FilterBar's per-source checkboxes and
 * GamesTreeView's game-loading effect use to identify a linked account, matching
 * `@human-chess/store`'s own case-insensitive-username convention (GameSource's doc comment). */
export function sourceKey(source: { site: string; username: string }): string {
  return `${source.site}:${source.username.toLowerCase()}`;
}
