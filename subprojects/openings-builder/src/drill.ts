// Multi-opening drill: the union-of-graphs acceptance rule (memory/subprojects/
// openings-builder-trainer.md, "Deviation handling in drill mode"). "Wrong" is evaluated
// against the union of the selected openings' position graphs, and the drill tracks which
// opening(s) the current path still belongs to. Pure and React-free like repertoire.ts — no
// engine, no randomness except an injectable `random`, unit-tested in drill.test.ts.
//
// All of `openings` are assumed to be the same colour; DrillView/OpeningsBuilder enforce that
// in the scope picker (an opponent-turn union across colours would mean two different sides to
// move for the same trail, which can't happen), nothing here re-checks it.
import { childrenOf, repertoireMoves, type Opening, type OpeningMove } from './repertoire';

/** One move recorded at the current position, with every opening (by name) it belongs to.
 * Several selected openings can share the same UCI at the same EPD; they collapse into one
 * entry here rather than showing the same move twice — the "Nf3 (King's Indian Attack), c4
 * (English)" wrong-move message reads off this list directly. */
export interface DrillMoveOption {
  uci: string;
  san: string;
  to: string;
  openingNames: string[];
}

/** Whether `opening`'s own graph still matches every move in `trail`, played from its root.
 * Re-derived from the whole trail each call rather than kept as separately-updated state, so
 * there is exactly one source of truth (the trail) and no way for a tracked "still live" flag
 * to drift from it. Once a played UCI has no matching edge at the node this walk has reached,
 * the opening is off the path for the rest of the drill — the early return means it never
 * rejoins even if a later move happens to match by transposition. */
export function isOnPath(opening: Opening, trail: readonly string[]): boolean {
  let epd = opening.root;
  for (const uci of trail) {
    const match = childrenOf(opening, epd).find(m => m.uci === uci);
    if (!match) return false;
    epd = match.to;
  }
  return true;
}

/** The selected openings whose graph still matches the trail played so far — the "live set" the
 * spec calls for. Order is preserved from `openings`. All live openings share the same current
 * position (the trail is one sequence of real moves), so callers use one EPD for all of them.
 * That only holds if they all start from the same root: the board walks from `openings[0].root`
 * while isOnPath walks each opening from its own, so an opening rooted elsewhere (every opening
 * createOpening makes is rooted at the start position today, but a stored one is not checked)
 * is dropped here rather than judged against a board it never showed. Same-colour is likewise
 * assumed, and guaranteed by OpeningsBuilder's colour filter. */
export function liveOpenings(openings: readonly Opening[], trail: readonly string[]): Opening[] {
  const root = openings[0]?.root;
  return openings.filter(o => o.root === root && isOnPath(o, trail));
}

function dedupeByUci(entries: { move: OpeningMove; openingName: string }[]): DrillMoveOption[] {
  const byUci = new Map<string, DrillMoveOption>();
  for (const { move, openingName } of entries) {
    const existing = byUci.get(move.uci);
    if (existing) {
      existing.openingNames.push(openingName);
    } else {
      byUci.set(move.uci, { uci: move.uci, san: move.san, to: move.to, openingNames: [openingName] });
    }
  }
  return [...byUci.values()];
}

/** The moves accepted from the user at `epd`: the union of each live opening's own repertoire
 * moves there (`repertoireMoves` already gates on whose turn it is, so this is empty when it
 * isn't the drilled colour's move). A user move is "wrong" exactly when its UCI is absent from
 * this list — right for one live opening is enough, per the spec's union rule. */
export function acceptedMoves(liveOpenings: readonly Opening[], epd: string): DrillMoveOption[] {
  return dedupeByUci(liveOpenings.flatMap(o => repertoireMoves(o, epd).map(move => ({ move, openingName: o.name }))));
}

/** Every continuation recorded at `epd` across the live openings, either colour's turn (both
 * colours' edges live in the same per-opening tree). Used two ways by the caller: emptiness
 * means the line has run out (complete, on whichever side's turn), and on the opponent's turn
 * this is the pool `pickReply` draws from — always a move that was actually recorded into a
 * tree, never engine- or model-generated (no fabricated moves, per A1/V3). */
export function nextMoveOptions(liveOpenings: readonly Opening[], epd: string): DrillMoveOption[] {
  return dedupeByUci(liveOpenings.flatMap(o => childrenOf(o, epd).map(move => ({ move, openingName: o.name }))));
}

/** Picks one of `nextMoveOptions` uniformly at random (`random` defaults to `Math.random`,
 * injectable so tests are deterministic). Undefined when nothing is recorded there. */
export function pickReply(liveOpenings: readonly Opening[], epd: string, random: () => number = Math.random): DrillMoveOption | undefined {
  const options = nextMoveOptions(liveOpenings, epd);
  if (options.length === 0) return undefined;
  return options[Math.floor(random() * options.length)];
}
