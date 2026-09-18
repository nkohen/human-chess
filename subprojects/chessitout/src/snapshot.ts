// Page-reload survival for the Chessitout screen (docs/design/2026-09-18-reload-survival.md):
// one snapshot object under one key, read synchronously in Chessitout's state initialisers and
// written back whenever the relevant pieces of state change. Never stores a chessops Position —
// a mined or curated position's fen/moves/eval are already plain JSON (ImbalancedPosition), a
// curated position's entry is additionally re-resolved by id against `curatedMidgames` for its
// provenance metadata (opponent, date, url), mirroring how the game in progress is only ever a
// start fen plus a UCI move list (never invented, A1).
//
// Both a mined and a curated ImbalancedPosition are stored whole, not recomputed after a
// restore: a curated position's eval is one real `analyse` call, but re-running it on every
// reload risks landing on a different number than the one the stored vote was actually judged
// against (the screen would say "right" while `tally` already counted "wrong"), and — being a
// real engine.analyse call on the shared engine — competes with whatever else that engine is
// doing right after a restore (reviewer, see commit history). ImbalancedPosition.eval is exactly
// as cheap to store as to recompute (it is already a plain score/engine/depth JSON record), so
// there is no cost to storing it.
//
// Every stored ImbalancedPosition's provenance is verified, not trusted: a mined position's
// `fen` must be exactly what replaying its own `moves` from the standard start position
// produces (mining always starts there — see packages/positions/src/selfPlay.ts), and a curated
// position's `fen` must match the curatedMidgames entry it claims to be. Either mismatch (a
// corrupt or hand-edited snapshot) rejects the whole position rather than trusting an arbitrary
// fen string straight into a board render.
import type { Score } from '@human-chess/engine';
import { curatedMidgames, type CuratedPosition, type ImbalancedPosition } from '@human-chess/positions';
import { resumeGame } from '@human-chess/play';
import { fenOf, START_FEN, type Color } from '@human-chess/rules';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import type { Vote } from './vote';

export const SNAPSHOT_KEY = 'human-chess.chessitout.session.v1';

// The opponent-strength choices offered by Chessitout.tsx's Elo selector; exported from this one
// place so the persisted `elo` field is validated against exactly the set the UI can produce,
// never an arbitrary number.
export const ELO_OPTIONS = [1320, 1500, 1800, 2100, 2400, 2700, 3000] as const;

export type Phase = 'mining' | 'voting' | 'playing' | 'result';
const PHASES = ['mining', 'voting', 'playing', 'result'] as const;
const isPhase = isOneOf(PHASES);
const isColor = isOneOf(['white', 'black'] as const);
const isVote = isOneOf(['white', 'black'] as const);
const isImbalancedSource = isOneOf(['engine-self-play-imbalanced', 'curated-user-game'] as const);
const isElo = (v: unknown): v is number => isFiniteNumber(v) && (ELO_OPTIONS as readonly number[]).includes(v);
const isNonNegInt = (v: unknown): v is number => isFiniteNumber(v) && Number.isInteger(v) && v >= 0;

export type SnapshotPosition =
  | { kind: 'mined'; value: ImbalancedPosition }
  | { kind: 'curated'; entry: CuratedPosition; value: ImbalancedPosition };

export interface ChessitoutSnapshot {
  phase: Phase;
  position: SnapshotPosition | undefined;
  vote: Vote | undefined;
  playerColor: Color | undefined;
  viewFrom: Color;
  elo: number;
  tally: { right: number; wrong: number };
  /** Whether the current attempt's vote has already been tallied (`judgedGeneration` in
   * Chessitout.tsx) — restored so a finished attempt is never counted twice. */
  judged: boolean;
  /** UCI moves played so far in the attempt (empty before or during voting). */
  moves: string[];
}

function isScore(v: unknown): v is Score {
  return isRecord(v) && (v.type === 'cp' || v.type === 'mate') && isFiniteNumber(v.value);
}

function isImbalancedShape(v: unknown): v is ImbalancedPosition {
  if (!isRecord(v)) return false;
  if (!isString(v.fen) || !isImbalancedSource(v.source) || !isStringArray(v.moves)) return false;
  const ev = v.eval;
  return isRecord(ev) && isScore(ev.score) && isString(ev.engine) && isFiniteNumber(ev.depth);
}

/** A mined ImbalancedPosition's `fen` must be exactly what replaying its own mining `moves` from
 * the standard start position produces — generateImbalancedPosition (imbalanced.ts) always mines
 * from START_FEN, so anything else is a corrupt or hand-edited entry, never a real mining result. */
function verifyMinedProvenance(value: ImbalancedPosition): boolean {
  try {
    return fenOf(resumeGame(START_FEN, 'white', value.moves).pos) === value.fen;
  } catch {
    return false;
  }
}

function parsePosition(v: unknown): SnapshotPosition | undefined | 'invalid' {
  if (v === undefined) return undefined;
  if (!isRecord(v)) return 'invalid';
  if (v.kind === 'mined') {
    if (!isImbalancedShape(v.value) || v.value.source !== 'engine-self-play-imbalanced') return 'invalid';
    return verifyMinedProvenance(v.value) ? { kind: 'mined', value: v.value } : 'invalid';
  }
  if (v.kind === 'curated') {
    if (!isString(v.entryId) || !isImbalancedShape(v.value) || v.value.source !== 'curated-user-game') return 'invalid';
    const entry = curatedMidgames.find(p => p.id === v.entryId);
    // The stored fen must match the entry it claims: evaluateCuratedMidgame always evaluates
    // entry.fen unchanged (curatedEval.ts), so any other fen means a stale pool or a corrupt entry.
    return entry && v.value.fen === entry.fen ? { kind: 'curated', entry, value: v.value } : 'invalid';
  }
  return 'invalid';
}

/** Validates the decoded JSON and rejects (returns undefined) any shape that is not current, or
 * whose move list does not legally replay against its position — never half-restored (A1). */
export function parseChessitoutSnapshot(raw: unknown): ChessitoutSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { phase, position, vote, playerColor, viewFrom, elo, tally, judged, moves } = raw;
  if (!isPhase(phase) || !isColor(viewFrom) || !isElo(elo) || !isBoolean(judged) || !isStringArray(moves)) return undefined;
  if (vote !== undefined && !isVote(vote)) return undefined;
  if (playerColor !== undefined && !isColor(playerColor)) return undefined;
  // The player always votes for, and then plays, the same side (onVote sets both from the same
  // value) — a mismatch here can only be a corrupt or hand-edited entry.
  if (vote !== undefined && playerColor !== undefined && vote !== playerColor) return undefined;
  if (!isRecord(tally) || !isNonNegInt(tally.right) || !isNonNegInt(tally.wrong)) return undefined;

  const resolvedPosition = parsePosition(position);
  if (resolvedPosition === 'invalid') return undefined;

  // 'voting', 'playing' and 'result' all require a resolved position; 'mining' may have none
  // (a reload during mining simply starts mining again, per the design doc).
  if (phase !== 'mining' && !resolvedPosition) return undefined;
  // 'playing' and 'result' both require the vote already cast.
  if ((phase === 'playing' || phase === 'result') && (vote === undefined || playerColor === undefined)) return undefined;

  if (moves.length > 0) {
    if (!resolvedPosition || playerColor === undefined) return undefined;
    try {
      resumeGame(resolvedPosition.value.fen, playerColor, moves);
    } catch {
      return undefined; // illegal or corrupt move list: reject the whole snapshot
    }
  }

  return {
    phase,
    position: resolvedPosition,
    vote: vote as Vote | undefined,
    playerColor: playerColor as Color | undefined,
    viewFrom,
    elo,
    tally: { right: tally.right, wrong: tally.wrong },
    judged,
    moves,
  };
}
