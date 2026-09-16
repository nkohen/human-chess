// Standard game review skeleton: per-move engine eval, cp loss, classification, and the
// engine's best move — the "standard review" shape from memory/subprojects/game-reviewer.md,
// minus report text, what-if and findability (later slices). Every eval traces to exactly one
// engine.analyse() call or to a rules-verified game end (A1); nothing here is invented.
import { whitePerspective, type Analysis, type Score, type SearchLimit, type UciEngine } from '@human-chess/engine';
import {
  fenOf, hasLegalMoves, playUci, positionEnd, positionFromFen, turn,
  type Color, type GameEnd, type Position,
} from '@human-chess/rules';
import { classify, terminalEval, type Classification, type EvalOrEnd } from './classify';

/** The slice of UciEngine reviewGame actually calls — enough to fake in tests without a transport. */
export type AnalysingEngine = Pick<UciEngine, 'analyse'>;

export class ReviewError extends Error {}

/** Thrown when `options.signal` is already aborted before a position's analyse() call would
 * have started. Callers (e.g. GameReviewer's unmount/re-run cleanup) treat this as an expected
 * cancellation, not a failure to surface to the user. */
export class ReviewCancelled extends ReviewError {}

export interface ReviewedMove {
  /** 1-based ply number (half-move), matching PGN/SAN move-list convention. */
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** White-perspective Score of fenBefore, at the requested depth. */
  evalBefore: Score;
  /** The engine's top move from fenBefore. */
  bestMove: string;
  bestSan: string;
  /**
   * White-perspective Score assuming the engine's own best move is played. Equal to evalBefore:
   * a searched score already assumes optimal continuation from that position, so it doubles as
   * "the eval after playing the top move" — no second analyse() call is needed for it.
   */
  evalAfterBest: Score;
  /** White-perspective evaluation after the move actually played, from the next ply's
   * evalBefore (or, for the last move, one extra analyse() call — or the rules-verified
   * terminalEval() when the game ended by rule; see EvalOrEnd). */
  evalAfterPlayed: EvalOrEnd;
  lossCp: number | undefined;
  classification: Classification;
  /** depthAfter is 'rules' rather than a number when evalAfterPlayed is a terminal fact from
   * positionEnd(), never attributed to a search depth it did not come from. */
  provenance: { engine: string; depthBefore: number; depthAfter: number | 'rules' };
}

export interface GameReview {
  moves: ReviewedMove[];
  /** Set when the game ends by rule (checkmate or stalemate) on the last recorded move, in
   * which case that position has no legal move to search and was never sent to the engine. */
  end: { ply: number; end: GameEnd } | undefined;
}

export interface ReviewOptions {
  /** Search depth for every position. Defaults to 12. */
  depth?: number;
  /** Checked before each analyse() call; an already-aborted signal throws ReviewCancelled
   * instead of starting another search the caller no longer wants. */
  signal?: AbortSignal;
}

export interface ReviewProgress {
  ply: number;
  total: number;
}

/**
 * Reviews a full game, one ply at a time. Analyses the position BEFORE each move (multipv 1) and
 * reuses each result as both "after the previous move" and "before the next move", plus one
 * extra analyse() after the last move, so every position is searched exactly once.
 */
export async function reviewGame(
  engine: AnalysingEngine,
  game: { startFen: string; ucis: string[] },
  options: ReviewOptions = {},
  onProgress?: (progress: ReviewProgress) => void,
): Promise<GameReview> {
  const depth = options.depth ?? 12;
  const limit: SearchLimit = { depth };
  const total = game.ucis.length;

  const positions: Position[] = [positionFromFen(game.startFen)];
  const fens: string[] = [fenOf(positions[0]!)];
  const sans: string[] = [];
  for (const uci of game.ucis) {
    const played = playUci(positions[positions.length - 1]!, uci);
    positions.push(played.pos);
    fens.push(fenOf(played.pos));
    sans.push(played.san);
  }

  const analyses: Analysis[] = [];
  for (let i = 0; i < total; i++) {
    if (options.signal?.aborted) throw new ReviewCancelled('review cancelled');
    analyses.push(await engine.analyse(fens[i]!, [], limit, 1));
    onProgress?.({ ply: i + 1, total });
  }

  // The position after the last move: search it too, unless it has no legal move to search
  // from (checkmate or stalemate) — that terminal fact is recorded as `end` instead of being
  // sent to the engine (which would have no move to return).
  let end: { ply: number; end: GameEnd } | undefined;
  let finalAnalysis: Analysis | undefined;
  if (total > 0) {
    const finalPos = positions[total]!;
    if (hasLegalMoves(finalPos)) {
      if (options.signal?.aborted) throw new ReviewCancelled('review cancelled');
      finalAnalysis = await engine.analyse(fens[total]!, [], limit, 1);
    } else {
      const howEnded = positionEnd(finalPos);
      if (!howEnded) throw new ReviewError('final position has no legal moves but positionEnd() did not classify it');
      end = { ply: total, end: howEnded };
    }
  }

  const moves: ReviewedMove[] = [];
  for (let i = 0; i < total; i++) {
    const before = positions[i]!;
    const mover: Color = turn(before);
    const rawBefore = analyses[i]!;
    const bestLine = rawBefore.lines[0];
    if (!bestLine) throw new ReviewError(`${rawBefore.engine} returned no evaluation line for ply ${i + 1} (${fens[i]})`);
    if (!rawBefore.bestmove) throw new ReviewError(`${rawBefore.engine} returned no best move for ply ${i + 1} (${fens[i]})`);

    const evalBefore = whitePerspective(bestLine.score, mover);
    const evalAfterBest = evalBefore;

    const nextRaw = i + 1 < total ? analyses[i + 1] : finalAnalysis;
    let evalAfterPlayed: EvalOrEnd;
    let depthAfter: number | 'rules';
    if (nextRaw) {
      const nextLine = nextRaw.lines[0];
      if (!nextLine) throw new ReviewError(`${nextRaw.engine} returned no evaluation line after ply ${i + 1}`);
      evalAfterPlayed = whitePerspective(nextLine.score, turn(positions[i + 1]!));
      depthAfter = nextLine.depth;
    } else {
      // Only reachable for the last move when the game ended by rule (end is set above); the
      // terminal fact comes from positionEnd(), never from a search, so it is never attributed
      // to a depth (finding 3).
      evalAfterPlayed = terminalEval(end!.end);
      depthAfter = 'rules';
    }

    const played = game.ucis[i]!;
    const isBest = played === rawBefore.bestmove;
    const bestSan = playUci(before, rawBefore.bestmove).san;
    const { lossCp, classification } = classify({ mover, isBest, evalAfterBest, evalAfterPlayed });

    moves.push({
      ply: i + 1,
      san: sans[i]!,
      uci: played,
      fenBefore: fens[i]!,
      fenAfter: fens[i + 1]!,
      evalBefore,
      bestMove: rawBefore.bestmove,
      bestSan,
      evalAfterBest,
      evalAfterPlayed,
      lossCp,
      classification,
      provenance: { engine: rawBefore.engine, depthBefore: bestLine.depth, depthAfter },
    });
  }

  return { moves, end };
}
