// Persisted review settings: search depth and a per-position time cap. Same guarded-
// localStorage pattern as the openings builder's depth setting
// (subprojects/openings-builder/src/storage.ts) — reads and writes never throw, and a bad or
// missing stored value falls back to the default rather than sinking the screen.
//
// Timing (2026-09-17): depth 20 alone let a single complex position run the single-threaded
// wasm engine past packages/engine's own 60s+grace analyse() timeout ("no answer to go depth
// 20 within 65000 ms") on a real chess.com game. The movetime cap below bounds every
// position's search so the engine stops at whichever of depth/movetime comes first; the depth
// actually reached is read back from the engine's own report (ReviewedMove.provenance), never
// assumed to be the requested depth.
import { gameId, isImportedGame, type ImportedGame } from '@human-chess/import';
import type { Score } from '@human-chess/engine';
import type { Classification, EvalOrEnd, GameReview, ReviewedMove } from '@human-chess/review';
import type { Color, GameEnd } from '@human-chess/rules';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString } from '@human-chess/ui';

const DEPTH_KEY = 'human-chess.game-reviewer.depth';
export const DEFAULT_DEPTH = 20;
export const MIN_DEPTH = 6;
export const MAX_DEPTH = 30;

function clampDepth(depth: number): number {
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.round(depth)));
}

export function loadDepth(): number {
  try {
    const raw = globalThis.localStorage?.getItem(DEPTH_KEY);
    if (!raw) return DEFAULT_DEPTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_DEPTH;
    return clampDepth(n);
  } catch {
    return DEFAULT_DEPTH;
  }
}

export function saveDepth(depth: number): void {
  try {
    globalThis.localStorage?.setItem(DEPTH_KEY, String(clampDepth(depth)));
  } catch {
    // storage unavailable: depth choice lives for this page only
  }
}

const MOVETIME_SECONDS_KEY = 'human-chess.game-reviewer.movetime-seconds';
export const DEFAULT_MOVETIME_SECONDS = 5;
export const MIN_MOVETIME_SECONDS = 1;
export const MAX_MOVETIME_SECONDS = 60;

function clampMovetimeSeconds(seconds: number): number {
  return Math.min(MAX_MOVETIME_SECONDS, Math.max(MIN_MOVETIME_SECONDS, Math.round(seconds)));
}

export function loadMovetimeSeconds(): number {
  try {
    const raw = globalThis.localStorage?.getItem(MOVETIME_SECONDS_KEY);
    if (!raw) return DEFAULT_MOVETIME_SECONDS;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_MOVETIME_SECONDS;
    return clampMovetimeSeconds(n);
  } catch {
    return DEFAULT_MOVETIME_SECONDS;
  }
}

export function saveMovetimeSeconds(seconds: number): void {
  try {
    globalThis.localStorage?.setItem(MOVETIME_SECONDS_KEY, String(clampMovetimeSeconds(seconds)));
  } catch {
    // storage unavailable: time cap choice lives for this page only
  }
}

// ---------------------------------------------------------------------------------------------
// Reload survival (docs/design/2026-09-18-reload-survival.md): the import/review screen choice,
// and, separately, the finished review + cursor for whichever game is currently being reviewed.
// Two keys rather than one "per screen" object: the outer screen choice changes rarely (import
// vs review) while selectedPly/flipped change on every click, and splitting keeps a rapid click
// from re-serialising the (potentially large) ImportedGame alongside the review every time.
// `isImportedGame` itself is validated by the shared `@human-chess/import` validator (imported
// above) rather than a local duplicate — same shape memory-trainer's storage.ts needs, moved to
// packages/import once a second caller needed it.
const isColor = isOneOf(['white', 'black'] as const);

export const SCREEN_KEY = 'human-chess.game-reviewer.screen.v1';
export const REVIEW_KEY = 'human-chess.game-reviewer.review.v1';

export type StoredScreen = { kind: 'import' } | { kind: 'review'; game: ImportedGame };

/** Validates the outer import/review screen choice. */
export function parseStoredScreen(raw: unknown): StoredScreen | undefined {
  if (!isRecord(raw)) return undefined;
  if (raw.kind === 'import') return { kind: 'import' };
  if (raw.kind === 'review' && isImportedGame(raw.game)) return { kind: 'review', game: raw.game };
  return undefined;
}

const isClassification = isOneOf(['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'mate-lost', 'mate-allowed'] as const);
const isDrawReason = isOneOf(['stalemate', 'insufficient-material', 'fifty-moves', 'threefold-repetition'] as const);
const isGameEndKind = isOneOf(['checkmate', 'stalemate', 'insufficient-material', 'fifty-moves', 'threefold-repetition'] as const);

function isScore(v: unknown): v is Score {
  return isRecord(v) && (v.type === 'cp' || v.type === 'mate') && isFiniteNumber(v.value);
}

function isEvalOrEnd(v: unknown): v is EvalOrEnd {
  if (isScore(v)) return true;
  if (!isRecord(v)) return false;
  if (v.type === 'checkmate') return isColor(v.winner);
  if (v.type === 'draw') return isDrawReason(v.reason);
  return false;
}

function isGameEnd(v: unknown): v is GameEnd {
  if (!isRecord(v) || !isGameEndKind(v.kind)) return false;
  return v.kind !== 'checkmate' || isColor(v.winner);
}

function isProvenance(v: unknown): v is ReviewedMove['provenance'] {
  return isRecord(v) && isString(v.engine) && isFiniteNumber(v.depthBefore) && (v.depthAfter === 'rules' || isFiniteNumber(v.depthAfter));
}

/**
 * The stored projection of `ReviewedMove`: `fenBefore` is dropped, since it always equals either
 * the game's `startFen` (first move) or the previous move's `fenAfter` — the review UI only ever
 * reads `fenAfter` (GameReviewer.tsx's `fen = move ? move.fenAfter : game.startFen`). Every other
 * field, including `provenance`, is kept whole: everything here is already plain JSON
 * (packages/engine's `Score`, packages/review's `Classification`/`EvalOrEnd` are all plain
 * unions/records — nothing to project beyond this one redundant FEN).
 */
export type StoredReviewedMove = Omit<ReviewedMove, 'fenBefore'>;
export interface StoredGameReview {
  moves: StoredReviewedMove[];
  end: GameReview['end'];
}

function isStoredReviewedMove(v: unknown): v is StoredReviewedMove {
  return (
    isRecord(v) &&
    isFiniteNumber(v.ply) &&
    isString(v.san) &&
    isString(v.uci) &&
    isString(v.fenAfter) &&
    isScore(v.evalBefore) &&
    isString(v.bestMove) &&
    isString(v.bestSan) &&
    isScore(v.evalAfterBest) &&
    isEvalOrEnd(v.evalAfterPlayed) &&
    (v.lossCp === undefined || isFiniteNumber(v.lossCp)) &&
    isClassification(v.classification) &&
    isProvenance(v.provenance)
  );
}

export function parseStoredGameReview(raw: unknown): StoredGameReview | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.moves) || !raw.moves.every(isStoredReviewedMove)) return undefined;
  const moves = raw.moves as StoredReviewedMove[];
  if (raw.end === undefined) return { moves, end: undefined };
  if (!isRecord(raw.end) || !isFiniteNumber(raw.end.ply) || !isGameEnd(raw.end.end)) return undefined;
  return { moves, end: { ply: raw.end.ply, end: raw.end.end } };
}

/** Projects a real `GameReview` down to the stored shape (drops `fenBefore`; see the type doc above). */
export function toStoredGameReview(review: GameReview): StoredGameReview {
  return { moves: review.moves.map(({ fenBefore: _fenBefore, ...rest }) => rest), end: review.end };
}

/** Rebuilds a full `GameReview` from the stored projection: `fenBefore` is recovered from
 * `startFen`/the previous move's `fenAfter`, never re-derived through the rules engine — the
 * stored `fenAfter` values are the review's own trusted output, not user-entered data. */
export function fromStoredGameReview(stored: StoredGameReview, startFen: string): GameReview {
  const moves: ReviewedMove[] = stored.moves.map((m, i) => ({
    ...m,
    fenBefore: i === 0 ? startFen : stored.moves[i - 1]!.fenAfter,
  }));
  return { moves, end: stored.end };
}

/** The review-screen's own state: the finished review (if any) for `game`, the selected ply, and
 * whether the board is flipped. Bound to `game` via `gameId` (packages/import) so a snapshot left
 * over from reviewing a different game is rejected rather than shown under the wrong game. */
export interface ReviewSnapshot {
  gameKey: string;
  review: GameReview | undefined;
  selectedPly: number;
  flipped: boolean;
}

interface StoredReviewSnapshot {
  gameKey: string;
  review: StoredGameReview | undefined;
  selectedPly: number;
  flipped: boolean;
}

export function parseReviewSnapshot(raw: unknown, game: ImportedGame): ReviewSnapshot | undefined {
  if (!isRecord(raw) || !isString(raw.gameKey) || raw.gameKey !== gameId(game)) return undefined;
  if (!isFiniteNumber(raw.selectedPly) || raw.selectedPly < 0 || !Number.isInteger(raw.selectedPly)) return undefined;
  if (!isBoolean(raw.flipped)) return undefined;

  if (raw.review === undefined) {
    if (raw.selectedPly !== 0) return undefined; // no review yet: only ply 0 makes sense
    return { gameKey: raw.gameKey, review: undefined, selectedPly: 0, flipped: raw.flipped };
  }
  const stored = parseStoredGameReview(raw.review);
  if (!stored) return undefined;
  // gameKey alone under-constrains the match: it's URL-based whenever the game has a URL
  // (gameId, packages/import), and two ImportedGames can share a URL but differ in ucis — a
  // truncated paste, or a re-fetch of a game that was still in progress when first fetched. A
  // stale review would otherwise restore under the wrong move list and never re-run. Requiring
  // the stored move list to match `game.ucis` move-for-move (and the end ply, when set) closes
  // that gap without needing a richer key.
  if (stored.moves.length !== game.ucis.length) return undefined;
  if (!stored.moves.every((m, i) => m.uci === game.ucis[i] && m.ply === i + 1)) return undefined;
  if (stored.end !== undefined && stored.end.ply !== stored.moves.length) return undefined;
  const review = fromStoredGameReview(stored, game.startFen);
  if (raw.selectedPly > review.moves.length) return undefined; // cursor out of range for this review
  return { gameKey: raw.gameKey, review, selectedPly: raw.selectedPly, flipped: raw.flipped };
}

export function serializeReviewSnapshot(snapshot: ReviewSnapshot): StoredReviewSnapshot {
  return {
    gameKey: snapshot.gameKey,
    review: snapshot.review ? toStoredGameReview(snapshot.review) : undefined,
    selectedPly: snapshot.selectedPly,
    flipped: snapshot.flipped,
  };
}
