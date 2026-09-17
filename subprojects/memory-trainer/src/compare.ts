// Compares the learner's reconstruction against the real game. Pure and tested: no React,
// no engine. Comparison is by POSITION, not by move text, so a move-order transposition back
// to the real game's position counts as re-convergence, not as a continued divergence.
import { fenOf, playUci, positionFromFen, repetitionKey } from '@human-chess/rules';

export interface Segment {
  kind: 'match' | 'diverged';
  /** 1-based ply numbers (ply 1 = White's first move), inclusive. */
  fromPly: number;
  toPly: number;
}

/**
 * Walks both move lists ply by ply from the same start position, comparing the position
 * (repetitionKey = EPD) reached after each ply. Only compares as many plies as both lists
 * share; a reconstruction shorter than the real game simply produces segments up to its own
 * length, with nothing said about the plies it never reached.
 */
export function compareReconstruction(startFen: string, realUcis: string[], userUcis: string[]): Segment[] {
  const realEpds = epdsAfterEachPly(startFen, realUcis);
  const userEpds = epdsAfterEachPly(startFen, userUcis);
  const plies = Math.min(realUcis.length, userUcis.length);

  const segments: Segment[] = [];
  let current: Segment | undefined;
  for (let ply = 1; ply <= plies; ply++) {
    const kind: Segment['kind'] = userEpds[ply] === realEpds[ply] ? 'match' : 'diverged';
    if (current && current.kind === kind) {
      current.toPly = ply;
    } else {
      current = { kind, fromPly: ply, toPly: ply };
      segments.push(current);
    }
  }
  return segments;
}

/** FEN after each ply from `startFen`, for a quick non-interactive replay. Index 0 is the start. */
export function fenSequence(startFen: string, ucis: string[]): string[] {
  const fens: string[] = [startFen];
  let pos = positionFromFen(startFen);
  for (const uci of ucis) {
    pos = playUci(pos, uci).pos;
    fens.push(fenOf(pos));
  }
  return fens;
}

function epdsAfterEachPly(startFen: string, ucis: string[]): string[] {
  let pos = positionFromFen(startFen);
  const epds: string[] = [repetitionKey(pos)];
  for (const uci of ucis) {
    pos = playUci(pos, uci).pos;
    epds.push(repetitionKey(pos));
  }
  return epds;
}

/**
 * How a reconstruction the learner has declared *complete* ("that's the whole game", as opposed
 * to "I have no idea") measures up, derived only from `segments` (as `compareReconstruction`
 * produced them) and the two move counts — never free-form text. `diverged` takes priority over
 * a length mismatch: a wrong move ply within the shared prefix is reported before anything is
 * said about how the lengths compare.
 */
export type ReconstructionOutcome =
  | { kind: 'perfect'; moves: number }
  | { kind: 'matched-shorter'; matched: number; remaining: number }
  | { kind: 'matched-longer'; extra: number }
  | { kind: 'diverged'; atPly: number };

/**
 * Classifies a claimed-complete attempt. `segments` must be `compareReconstruction(startFen,
 * realUcis, userUcis)` for the same `realLength`/`userLength` (`realUcis.length`/
 * `userUcis.length`) passed here — this function only reads the segments and the two lengths, so
 * it never has to re-walk the game itself.
 */
export function classifyCompleteAttempt(segments: Segment[], realLength: number, userLength: number): ReconstructionOutcome {
  const firstDiverged = segments.find(s => s.kind === 'diverged');
  if (firstDiverged) return { kind: 'diverged', atPly: firstDiverged.fromPly };
  if (realLength === userLength) return { kind: 'perfect', moves: realLength };
  if (userLength < realLength) return { kind: 'matched-shorter', matched: userLength, remaining: realLength - userLength };
  return { kind: 'matched-longer', extra: userLength - realLength };
}
