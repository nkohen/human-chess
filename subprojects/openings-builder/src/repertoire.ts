// The repertoire model: a position-graph per opening, keyed by EPD (repetitionKey) so that
// transpositions merge into one node, per the user's spec (memory/subprojects/openings-builder-trainer.md,
// "Structure"). This file is pure and has no React or engine dependency; everything here is a
// plain function over plain data, unit-tested in repertoire.test.ts.
import { fenOf, playUci, positionFromFen, repetitionKey, START_FEN, turn, type Color } from '@human-chess/rules';

export { START_FEN };

/** One edge out of a node: the move played, its SAN, and the EPD it lands on. */
export interface OpeningMove {
  uci: string;
  san: string;
  /** EPD (repetitionKey) of the resulting position. */
  to: string;
}

export interface OpeningNode {
  moves: OpeningMove[];
}

export interface Opening {
  id: string;
  name: string;
  color: Color;
  /** EPD (repetitionKey) of the starting position. */
  root: string;
  /** Keyed by EPD; transpositions within one opening land on the same key. */
  nodes: Record<string, OpeningNode>;
}

function genId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** A fresh opening rooted at the standard starting position. */
export function createOpening(name: string, color: Color): Opening {
  const root = repetitionKey(positionFromFen(START_FEN));
  return { id: genId(), name, color, root, nodes: { [root]: { moves: [] } } };
}

/**
 * The full position for a node's EPD. `repetitionKey` drops the halfmove/fullmove counters
 * (that's the point — it merges transpositions), and chessops' FEN parser defaults those two
 * fields when absent, so feeding an EPD straight back into `positionFromFen` round-trips to a
 * legal position with the counters simply reset. Nothing here re-derives legality by hand.
 */
function positionAt(epd: string): ReturnType<typeof positionFromFen> {
  return positionFromFen(epd);
}

export function fenAt(epd: string): string {
  return fenOf(positionAt(epd));
}

/**
 * Adds a move from `fromEpd`, playing it through the rules library to get its SAN and the EPD
 * it lands on. Idempotent: adding the same UCI at the same node twice is a no-op. Throws if the
 * move is illegal at that position (via `playUci`) or the node doesn't exist yet.
 */
export function addMove(opening: Opening, fromEpd: string, uci: string): Opening {
  const node = opening.nodes[fromEpd] ?? { moves: [] };
  if (node.moves.some(m => m.uci === uci)) return opening;
  const played = playUci(positionAt(fromEpd), uci);
  const to = repetitionKey(played.pos);
  const nodes = { ...opening.nodes };
  nodes[fromEpd] = { moves: [...node.moves, { uci, san: played.san, to }] };
  if (!nodes[to]) nodes[to] = { moves: [] };
  return { ...opening, nodes };
}

/** Removes one edge from `fromEpd`. Leaves any now-unreachable nodes in place (harmless: they're
 * only ever reached by following edges from the root, and nothing follows a removed one). */
export function removeMove(opening: Opening, fromEpd: string, uci: string): Opening {
  const node = opening.nodes[fromEpd];
  if (!node) return opening;
  const nodes = { ...opening.nodes, [fromEpd]: { moves: node.moves.filter(m => m.uci !== uci) } };
  return { ...opening, nodes };
}

/** How many moves are recorded at and beyond `epd` (each edge once, transpositions merged), so the
 * UI can say what a removal takes with it. */
export function movesBeyond(opening: Opening, epd: string): number {
  const seen = new Set<string>();
  const stack = [epd];
  let count = 0;
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const m of childrenOf(opening, cur)) {
      count++;
      stack.push(m.to);
    }
  }
  return count;
}

export function childrenOf(opening: Opening, epd: string): OpeningMove[] {
  return opening.nodes[epd]?.moves ?? [];
}

/** The user's own moves at `epd` — only non-empty when it is the opening's colour to move there. */
export function repertoireMoves(opening: Opening, epd: string): OpeningMove[] {
  if (turn(positionAt(epd)) !== opening.color) return [];
  return childrenOf(opening, epd);
}

export function serialize(opening: Opening): string {
  return JSON.stringify(opening);
}

/**
 * Full structural validation, not just a shallow field check: every node key must parse as a
 * position (via `positionFromFen`, never hand-checked) and every move needs string uci/san/to
 * fields whose `to` names an actual node — otherwise a corrupt opening would pass this gate and
 * only blow up later, inside render (`BuilderView`/`DrillView` walking the tree). One invalid
 * node or move invalidates the whole opening; the caller (loadRepertoire) drops it and keeps
 * the rest.
 */
function isOpeningShape(value: unknown): value is Opening {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (typeof o['id'] !== 'string' || typeof o['name'] !== 'string') return false;
  if (o['color'] !== 'white' && o['color'] !== 'black') return false;
  if (typeof o['root'] !== 'string') return false;
  if (typeof o['nodes'] !== 'object' || o['nodes'] === null) return false;

  const nodes = o['nodes'] as Record<string, unknown>;
  const nodeKeys = new Set(Object.keys(nodes));
  for (const [epd, node] of Object.entries(nodes)) {
    try {
      positionFromFen(epd);
    } catch {
      return false;
    }
    if (!node || typeof node !== 'object') return false;
    const moves = (node as Record<string, unknown>)['moves'];
    if (!Array.isArray(moves)) return false;
    for (const m of moves) {
      if (!m || typeof m !== 'object') return false;
      const mv = m as Record<string, unknown>;
      if (typeof mv['uci'] !== 'string' || typeof mv['san'] !== 'string' || typeof mv['to'] !== 'string') return false;
      if (!nodeKeys.has(mv['to'])) return false;
    }
  }
  return true;
}

export function deserialize(json: string): Opening {
  const parsed: unknown = JSON.parse(json);
  if (!isOpeningShape(parsed)) throw new Error('not a valid opening');
  return parsed;
}
