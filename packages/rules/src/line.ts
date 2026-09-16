// A line of moves annotated for display: SAN, move-number label, and the position after each
// ply. Built on `sanLine` and `playUci`; nothing here judges legality or derives notation itself.
import { fenOf, playUci, positionFromFen, sanLine, type Color } from './index';

export interface LinePly {
  uci: string;
  san: string;
  /** "12." before a white move, "12…" before a black move that opens the line, "" otherwise. */
  label: string;
  /** The side that played this ply. */
  color: Color;
  /** The fullmove number this ply belongs to. */
  moveNumber: number;
  /** FEN after this ply. */
  fenAfter: string;
}

/**
 * Annotates `ucis` played from `startFen` with SAN, standard move-list numbering ("1… Nf6 2. e5
 * Nd5") and the FEN reached after each ply. Throws RulesError on an illegal or unparseable move.
 */
export function annotateLine(startFen: string, ucis: string[]): LinePly[] {
  let pos = positionFromFen(startFen);
  const sans = sanLine(pos, ucis);
  return ucis.map((uci, i) => {
    const color = pos.turn;
    const moveNo = pos.fullmoves;
    const label = color === 'white' ? `${moveNo}.` : i === 0 ? `${moveNo}…` : '';
    pos = playUci(pos, uci).pos;
    return { uci, san: sans[i]!, label, color, moveNumber: moveNo, fenAfter: fenOf(pos) };
  });
}

/** The annotated line as one string, e.g. "1… Nf6 2. e5 Nd5". */
export function formatLine(startFen: string, ucis: string[]): string {
  return annotateLine(startFen, ucis)
    .map(p => (p.label ? `${p.label} ${p.san}` : p.san))
    .join(' ');
}
