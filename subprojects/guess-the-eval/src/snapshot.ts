// Reload survival (docs/design/2026-09-18-reload-survival.md): one persisted snapshot object per
// screen, each behind its own `human-chess.guessTheEval.<name>.v1` key, validated on the way back
// in by the `parse*` functions below so a stale or corrupt entry is rejected as a whole rather
// than half-restored. Nothing here re-derives an engine number that was already shown to the
// player — a stored `Analysis`/`Score` is exactly the one the engine returned (A1); positions are
// stored as the whole `RecipePosition` engine mining already produced, never re-mined.
import type { Analysis, PvLine, Score } from '@human-chess/engine';
import { RECIPES, type RecipeId, type RecipePosition } from '@human-chess/positions';
import { positionFromFen, uciSquares, type SquareName } from '@human-chess/rules';
import { isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray } from '@human-chess/ui';
import { ROUNDS } from './rounds';
import { MAX_POINTS, SLIDER_MAX_CP, SLIDER_MIN_CP } from './scoring';

const isRecipeId = isOneOf(RECIPES as readonly RecipeId[]);

/** A guess/slider value in centipawns, White's perspective — must fall inside the slider's own
 * range, the same bound the UI itself clamps to (scoring.ts's SLIDER_MIN_CP/SLIDER_MAX_CP). */
function isSliderCp(v: unknown): v is number {
  return isFiniteNumber(v) && v >= SLIDER_MIN_CP && v <= SLIDER_MAX_CP;
}

/** A points value scoring.ts's `points()` could actually have produced: a non-negative integer,
 * never above MAX_POINTS. */
function isPointsValue(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0 && v <= MAX_POINTS;
}

/** A FEN that fails to parse (corrupt storage, a hand-edited value) would otherwise throw deep
 * inside a render (positionFromFen is called unguarded by every screen); rejecting it here means
 * the screen starts fresh instead of white-screening (docs/design/2026-09-18-reload-survival.md). */
function isLegalFen(fen: string): boolean {
  try {
    positionFromFen(fen);
    return true;
  } catch {
    return false;
  }
}

function isRecipePosition(v: unknown): v is RecipePosition {
  if (!isRecord(v) || !isString(v.fen) || !isRecipeId(v.recipe) || !isString(v.description) || !isStringArray(v.moves)) return false;
  if (!isLegalFen(v.fen)) return false;
  // Only the last move is ever read back out (uciSquares, for the "previous move" highlight), but
  // it is read unguarded, so a corrupt entry there needs the same rejection as a corrupt fen.
  const lastMove = v.moves[v.moves.length - 1];
  if (lastMove === undefined) return true;
  try {
    uciSquares(lastMove);
    return true;
  } catch {
    return false;
  }
}

function isScore(v: unknown): v is Score {
  return isRecord(v) && (v.type === 'cp' || v.type === 'mate') && isFiniteNumber(v.value);
}

function isSquareTuple(v: unknown): v is [SquareName, SquareName] {
  return Array.isArray(v) && v.length === 2 && isString(v[0]) && isString(v[1]);
}

function isPvLine(v: unknown): v is PvLine {
  return (
    isRecord(v) &&
    isFiniteNumber(v.multipv) &&
    isFiniteNumber(v.depth) &&
    isScore(v.score) &&
    isStringArray(v.pv) &&
    (v.seldepth === undefined || isFiniteNumber(v.seldepth)) &&
    (v.nodes === undefined || isFiniteNumber(v.nodes)) &&
    (v.nps === undefined || isFiniteNumber(v.nps)) &&
    (v.timeMs === undefined || isFiniteNumber(v.timeMs))
  );
}

function isAnalysis(v: unknown): v is Analysis {
  return (
    isRecord(v) &&
    isString(v.engine) &&
    isString(v.fen) &&
    isStringArray(v.moves) &&
    isRecord(v.limit) &&
    isFiniteNumber(v.multipv) &&
    (v.bestmove === undefined || isString(v.bestmove)) &&
    Array.isArray(v.lines) &&
    v.lines.every(isPvLine) &&
    isFiniteNumber(v.elapsedMs)
  );
}

function isRoundIndex(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v >= 0 && v < ROUNDS;
}

// ---------- top-level (GuessTheEval.tsx): the settings/solo/pvp screen and the chosen mode ----------

export type GteMode = 'solo' | 'pvp';
export type GteScreen = 'settings' | GteMode;
export const GTE_TOP_KEY = 'human-chess.guessTheEval.top.v1';

export interface TopSnapshot {
  screen: GteScreen;
  mode: GteMode;
}

const isGteMode = isOneOf(['solo', 'pvp'] as const);
const isGteScreen = isOneOf(['settings', 'solo', 'pvp'] as const);

export function parseTopSnapshot(raw: unknown): TopSnapshot | undefined {
  if (!isRecord(raw) || !isGteScreen(raw.screen) || !isGteMode(raw.mode)) return undefined;
  return { screen: raw.screen, mode: raw.mode };
}

export function freshTopSnapshot(): TopSnapshot {
  return { screen: 'settings', mode: 'solo' };
}

// ---------- SoloRound.tsx ----------

export type SoloPhase = 'generating' | 'guessing' | 'evaluating' | 'revealed' | 'analysing' | 'summary';
const isSoloPhase = isOneOf(['generating', 'guessing', 'evaluating', 'revealed', 'analysing', 'summary'] as const);

export interface RoundResult {
  truth: Score;
  guessCp: number;
  points: number;
  /** True when this guess was locked in automatically because the clock ran out, rather than by
   * the player pressing "Lock in" — shown in the reveal, never silently treated the same. */
  timedOut: boolean;
  /** The recipe description shown in the summary list, alongside the reveal (never before it —
   * it can hint at the answer, see describeRecipe). */
  recipeDescription: string;
}

function isRoundResult(v: unknown): v is RoundResult {
  return isRecord(v) && isScore(v.truth) && isSliderCp(v.guessCp) && isPointsValue(v.points) && isBoolean(v.timedOut) && isString(v.recipeDescription);
}

export interface SoloSnapshot {
  position: RecipePosition | undefined;
  phase: SoloPhase;
  guessCp: number;
  timedOut: boolean;
  roundIndex: number;
  results: RoundResult[];
  /** Absolute deadline (`Date.now()`-based) for the current position's clock, or undefined when
   * there is no time limit or no clock is currently running. */
  endAt: number | undefined;
  /** The engine's analysis for the current (or just-revealed) position, so a reload's reveal shows
   * exactly the number it showed before — never a re-analysed, possibly different, one. */
  analysis: Analysis | undefined;
}

export function freshSoloSnapshot(): SoloSnapshot {
  return { position: undefined, phase: 'generating', guessCp: 0, timedOut: false, roundIndex: 0, results: [], endAt: undefined, analysis: undefined };
}

export const GTE_SOLO_KEY = 'human-chess.guessTheEval.solo.v1';

/** A round's results only ever grow by exactly one entry, right when that round's reveal is
 * written (SoloRound.tsx's analyse effect), and `roundIndex` only advances after that: so
 * `results.length` is pinned to `roundIndex` before a round's own reveal exists ('generating',
 * 'guessing', 'evaluating') and to `roundIndex + 1` once it does ('revealed', 'analysing') — and,
 * since `advance()` leaves `roundIndex` at its last value rather than incrementing past it,
 * `results.length === ROUNDS` at 'summary'. A mismatch is a corrupt or hand-edited entry, not a
 * shape this screen could have produced on its own. */
function isSoloResultsConsistent(phase: SoloPhase, roundIndex: number, resultsLength: number): boolean {
  if (resultsLength > ROUNDS) return false;
  if (phase === 'summary') return resultsLength === ROUNDS;
  if (phase === 'revealed' || phase === 'analysing') return resultsLength === roundIndex + 1;
  return resultsLength === roundIndex;
}

export function parseSoloSnapshot(raw: unknown): SoloSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { position, phase, guessCp, timedOut, roundIndex, results, endAt, analysis } = raw;
  if (!isSoloPhase(phase)) return undefined;
  if (position !== undefined && !isRecipePosition(position)) return undefined;
  if (!isSliderCp(guessCp) || !isBoolean(timedOut) || !isRoundIndex(roundIndex)) return undefined;
  if (!Array.isArray(results) || !results.every(isRoundResult)) return undefined;
  if (endAt !== undefined && !isFiniteNumber(endAt)) return undefined;
  if (analysis !== undefined && !isAnalysis(analysis)) return undefined;
  // Every phase but 'generating' and 'summary' is mid-position and needs the position it is about.
  if (phase !== 'generating' && phase !== 'summary' && !position) return undefined;
  // A revealed (or, from there, re-opened analysis) position must have the analysis that produced
  // its own reveal, never recomputed (A1).
  if ((phase === 'revealed' || phase === 'analysing') && !analysis) return undefined;
  // The stored analysis must actually be *for* the stored position — never a stale one left over
  // from a previous position that would otherwise show as this position's reveal.
  if (analysis && position && analysis.fen !== position.fen) return undefined;
  if (!isSoloResultsConsistent(phase, roundIndex, results.length)) return undefined;
  return { position: position as RecipePosition | undefined, phase, guessCp, timedOut, roundIndex, results, endAt, analysis: analysis as Analysis | undefined };
}

// ---------- PvpRound.tsx ----------

export type PvpPhase = 'generating' | 'handover' | 'guessing' | 'evaluating' | 'reveal' | 'results';
const isPvpPhase = isOneOf(['generating', 'handover', 'guessing', 'evaluating', 'reveal', 'results'] as const);

export interface PvpRoundResult {
  fen: string;
  lastMove: [SquareName, SquareName] | undefined;
  truth: Score;
  guess1Cp: number;
  guess2Cp: number;
  points1: number;
  points2: number;
  timedOut1: boolean;
  timedOut2: boolean;
  recipeDescription: string;
}

function isPvpRoundResult(v: unknown): v is PvpRoundResult {
  return (
    isRecord(v) &&
    isString(v.fen) &&
    (v.lastMove === undefined || isSquareTuple(v.lastMove)) &&
    isScore(v.truth) &&
    isSliderCp(v.guess1Cp) &&
    isSliderCp(v.guess2Cp) &&
    isPointsValue(v.points1) &&
    isPointsValue(v.points2) &&
    isBoolean(v.timedOut1) &&
    isBoolean(v.timedOut2) &&
    isString(v.recipeDescription)
  );
}

export interface PvpSnapshot {
  position: RecipePosition | undefined;
  phase: PvpPhase;
  roundIndex: number;
  results: PvpRoundResult[];
  endAt: number | undefined;
  analysis: Analysis | undefined;
  turnPlayer: 1 | 2;
  /** The active player's in-progress slider position (SoloRound's `guessCp`, under PvpRound's own
   * name for it) — restored so a reload mid-drag does not throw away the guess in progress. */
  sliderCp: number;
  guess1Cp: number;
  guess1UsedMs: number;
  timedOut1: boolean;
  timedOut2: boolean;
  /** Index into `results` currently open in the results screen's AnalysisBoard, or undefined. */
  analysingIndex: number | undefined;
}

export function freshPvpSnapshot(): PvpSnapshot {
  return {
    position: undefined,
    phase: 'generating',
    roundIndex: 0,
    results: [],
    endAt: undefined,
    analysis: undefined,
    turnPlayer: 1,
    sliderCp: 0,
    guess1Cp: 0,
    guess1UsedMs: 0,
    timedOut1: false,
    timedOut2: false,
    analysingIndex: undefined,
  };
}

export const GTE_PVP_KEY = 'human-chess.guessTheEval.pvp.v1';

// Mirrors isSoloResultsConsistent, keyed to PvP's own phase set: 'reveal' is the one phase that
// has claimed this round's own result (roundIndex + 1, same shape as Solo's 'revealed'/'analysing'),
// and 'results' is the terminal screen where roundIndex is left at ROUNDS - 1 (advance() never
// increments past it) so the count there is checked against ROUNDS instead.
function isPvpResultsConsistent(phase: PvpPhase, roundIndex: number, resultsLength: number): boolean {
  if (resultsLength > ROUNDS) return false;
  if (phase === 'results') return resultsLength === ROUNDS;
  if (phase === 'reveal') return resultsLength === roundIndex + 1;
  return resultsLength === roundIndex;
}

export function parsePvpSnapshot(raw: unknown): PvpSnapshot | undefined {
  if (!isRecord(raw)) return undefined;
  const { position, phase, roundIndex, results, endAt, analysis, turnPlayer, sliderCp, guess1Cp, guess1UsedMs, timedOut1, timedOut2, analysingIndex } = raw;
  if (!isPvpPhase(phase)) return undefined;
  if (position !== undefined && !isRecipePosition(position)) return undefined;
  if (!isRoundIndex(roundIndex)) return undefined;
  if (!Array.isArray(results) || !results.every(isPvpRoundResult)) return undefined;
  if (endAt !== undefined && !isFiniteNumber(endAt)) return undefined;
  if (analysis !== undefined && !isAnalysis(analysis)) return undefined;
  if (turnPlayer !== 1 && turnPlayer !== 2) return undefined;
  if (!isSliderCp(sliderCp) || !isSliderCp(guess1Cp) || !isFiniteNumber(guess1UsedMs)) return undefined;
  if (!isBoolean(timedOut1) || !isBoolean(timedOut2)) return undefined;
  if (analysingIndex !== undefined && !(isFiniteNumber(analysingIndex) && Number.isInteger(analysingIndex) && analysingIndex >= 0)) return undefined;
  if (phase !== 'generating' && phase !== 'results' && !position) return undefined;
  if (phase === 'reveal' && !analysis) return undefined;
  // Guards the same stale-analysis case as Solo: an analysis whose fen does not match the
  // position currently on screen cannot be this round's reveal.
  if (analysis && position && analysis.fen !== position.fen) return undefined;
  if (!isPvpResultsConsistent(phase, roundIndex, results.length)) return undefined;
  return {
    position: position as RecipePosition | undefined,
    phase,
    roundIndex,
    results,
    endAt,
    analysis: analysis as Analysis | undefined,
    turnPlayer,
    sliderCp,
    guess1Cp,
    guess1UsedMs,
    timedOut1,
    timedOut2,
    analysingIndex,
  };
}

// ---------- AnalysisBoard.tsx: shared by SoloRound's reveal and PvpRound's results screen ----------

export interface AnalysisHistoryEntry {
  fen: string;
  lastMove?: [SquareName, SquareName];
}

export interface AnalysisBoardSnapshot {
  seedFen: string;
  history: AnalysisHistoryEntry[];
}

export const GTE_ANALYSIS_BOARD_KEY = 'human-chess.guessTheEval.analysisBoard.v1';

function isAnalysisHistoryEntry(v: unknown): v is AnalysisHistoryEntry {
  return isRecord(v) && isString(v.fen) && isLegalFen(v.fen) && (v.lastMove === undefined || isSquareTuple(v.lastMove));
}

export function parseAnalysisBoardSnapshot(raw: unknown): AnalysisBoardSnapshot | undefined {
  if (!isRecord(raw) || !isString(raw.seedFen) || !isLegalFen(raw.seedFen) || !Array.isArray(raw.history) || raw.history.length === 0) return undefined;
  if (!raw.history.every(isAnalysisHistoryEntry)) return undefined;
  return { seedFen: raw.seedFen, history: raw.history };
}
