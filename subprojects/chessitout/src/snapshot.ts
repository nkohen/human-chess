// Page-reload survival for the Chessitout screen (docs/design/2026-09-18-reload-survival.md):
// one snapshot object under one key, read synchronously in Chessitout's state initialisers and
// written back whenever the relevant pieces of state change. Never stores a chessops Position —
// a mined position's fen/moves/eval are already plain JSON (ImbalancedPosition), and a curated
// position is stored by id and re-resolved against `curatedMidgames`, mirroring how the position
// itself is only ever a start fen plus a UCI move list (never invented, A1).
//
// The mined ImbalancedPosition is expensive (up to MAX_ATTEMPTS depth-18-confirmed self-play
// searches) so it is stored whole; a curated position's fen is already known for free from the
// pool, so only its id is stored and its eval (one depth-18 analyse call) is recomputed after a
// restore — see Chessitout.tsx's dedicated effect for that recompute, which fires only when a
// curatedEntry is known but its evaluated `position` is not yet.
import type { Score } from '@human-chess/engine';
import { curatedMidgames, type CuratedPosition, type ImbalancedPosition } from '@human-chess/positions';
import { resumeGame } from '@human-chess/play';
import type { Color } from '@human-chess/rules';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import type { Vote } from './vote';

export const SNAPSHOT_KEY = 'human-chess.chessitout.session.v1';

export type Phase = 'mining' | 'voting' | 'playing' | 'result';
const PHASES = ['mining', 'voting', 'playing', 'result'] as const;
const isPhase = isOneOf(PHASES);
const isColor = isOneOf(['white', 'black'] as const);
const isVote = isOneOf(['white', 'black'] as const);
const isImbalancedSource = isOneOf(['engine-self-play-imbalanced', 'curated-user-game'] as const);

export type SnapshotPosition = { kind: 'mined'; value: ImbalancedPosition } | { kind: 'curated'; entry: CuratedPosition };

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

function isImbalancedPosition(v: unknown): v is ImbalancedPosition {
  if (!isRecord(v)) return false;
  if (!isString(v.fen) || !isImbalancedSource(v.source) || !isStringArray(v.moves)) return false;
  const ev = v.eval;
  return isRecord(ev) && isScore(ev.score) && isString(ev.engine) && isFiniteNumber(ev.depth);
}

function parsePosition(v: unknown): SnapshotPosition | undefined | 'invalid' {
  if (v === undefined) return undefined;
  if (!isRecord(v)) return 'invalid';
  if (v.kind === 'mined') {
    return isImbalancedPosition(v.value) ? { kind: 'mined', value: v.value } : 'invalid';
  }
  if (v.kind === 'curated') {
    if (!isString(v.entryId)) return 'invalid';
    const entry = curatedMidgames.find(p => p.id === v.entryId);
    return entry ? { kind: 'curated', entry } : 'invalid';
  }
  return 'invalid';
}

/** Validates the decoded JSON and rejects (returns undefined) any shape that is not current, or
 * whose move list does not legally replay against its position — never half-restored (A1). */
export function parseChessitoutSnapshot(raw: unknown): ChessitoutSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { phase, position, vote, playerColor, viewFrom, elo, tally, judged, moves } = raw;
  if (!isPhase(phase) || !isColor(viewFrom) || !isFiniteNumber(elo) || !isBoolean(judged) || !isStringArray(moves)) return undefined;
  if (vote !== undefined && !isVote(vote)) return undefined;
  if (playerColor !== undefined && !isColor(playerColor)) return undefined;
  if (!isRecord(tally) || !isFiniteNumber(tally.right) || !isFiniteNumber(tally.wrong)) return undefined;

  const resolvedPosition = parsePosition(position);
  if (resolvedPosition === 'invalid') return undefined;

  // 'voting', 'playing' and 'result' all require a resolved position; 'mining' may have none
  // (a reload during mining simply starts mining again, per the design doc).
  if (phase !== 'mining' && !resolvedPosition) return undefined;
  // 'playing' and 'result' both require the vote already cast.
  if ((phase === 'playing' || phase === 'result') && (vote === undefined || playerColor === undefined)) return undefined;

  if (moves.length > 0) {
    if (!resolvedPosition || playerColor === undefined) return undefined;
    const fen = resolvedPosition.kind === 'mined' ? resolvedPosition.value.fen : resolvedPosition.entry.fen;
    try {
      resumeGame(fen, playerColor, moves);
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
