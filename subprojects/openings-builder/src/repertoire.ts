// The repertoire model: a position-graph per opening, keyed by EPD (repetitionKey) so that
// transpositions merge into one node, per the user's spec (memory/subprojects/openings-builder-trainer.md,
// "Structure"). This file is pure and has no React or engine dependency; everything here is a
// plain function over plain data, unit-tested in repertoire.test.ts.
import { fenOf, playUci, positionFromFen, repetitionKey, turn, type Color } from '@human-chess/rules';

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

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

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

function isOpeningShape(value: unknown): value is Opening {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return typeof o['id'] === 'string' && typeof o['name'] === 'string' && (o['color'] === 'white' || o['color'] === 'black')
    && typeof o['root'] === 'string' && typeof o['nodes'] === 'object' && o['nodes'] !== null;
}

export function deserialize(json: string): Opening {
  const parsed: unknown = JSON.parse(json);
  if (!isOpeningShape(parsed)) throw new Error('not a valid opening');
  return parsed;
}
