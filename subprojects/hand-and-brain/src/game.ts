// Hot-seat Hand and Brain, humans only, one device, no engine, no clocks. Pure game state;
// React lives in HandAndBrain.tsx. Each side's turn has two phases: the brain calls a piece
// type (only types with a legal move are offered), then the hand must move a piece of that
// type. Legality — both "does this role have a legal move" and "is this move legal" — comes
// from chessops through @human-chess/rules; nothing here generates or judges moves itself.
import {
  fenOf, inCheck, isPromotionMove, legalDestsByRole, playMove, positionEnd, positionFromFen,
  repetitionKey, roleAt, START_FEN, turn, uciSquares,
  type Color, type GameEnd, type Position, type Role, type SquareName,
} from '@human-chess/rules';

export interface MoveRecord {
  color: Color;
  role: Role;
  san: string;
  uci: string;
}

export interface HandAndBrainGame {
  pos: Position;
  /** The role the brain called for the side to move's current turn; undefined until called. */
  calledRole: Role | undefined;
  moves: MoveRecord[];
  /** repetitionKey → times seen, including the start position. */
  seen: Map<string, number>;
  end: GameEnd | undefined;
}

export function startGame(): HandAndBrainGame {
  const pos = positionFromFen(START_FEN);
  return { pos, calledRole: undefined, moves: [], seen: new Map([[repetitionKey(pos), 1]]), end: positionEnd(pos) };
}

const ROLE_ORDER: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** Piece types with at least one legal move for the side to move: what the brain may call. */
export function callableRoles(game: HandAndBrainGame): Role[] {
  if (game.end) return [];
  const has = legalDestsByRole(game.pos);
  return ROLE_ORDER.filter(r => has.has(r));
}

export function call(game: HandAndBrainGame, role: Role): HandAndBrainGame {
  if (game.end) throw new Error('the game is over');
  if (game.calledRole !== undefined) throw new Error('already called a piece this turn');
  if (!callableRoles(game).includes(role)) throw new Error(`no legal move for ${role}`);
  return { ...game, calledRole: role };
}

/** Legal destinations restricted to the called role; empty until the brain has called. */
export function handDests(game: HandAndBrainGame): Map<SquareName, SquareName[]> {
  if (game.end || game.calledRole === undefined) return new Map();
  return legalDestsByRole(game.pos).get(game.calledRole) ?? new Map();
}

export function move(game: HandAndBrainGame, from: SquareName, to: SquareName): HandAndBrainGame {
  if (game.end) throw new Error('the game is over');
  const role = game.calledRole;
  if (role === undefined) throw new Error('the brain has not called a piece yet');
  if (roleAt(game.pos, from) !== role) throw new Error(`that piece is not the called ${role}`);
  // No promotion picker in this variant: every promotion auto-queens.
  const promotion = isPromotionMove(game.pos, from, to) ? 'queen' : undefined;
  const color = turn(game.pos);
  const played = playMove(game.pos, from, to, promotion);
  const key = repetitionKey(played.pos);
  const seen = new Map(game.seen);
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);
  const end = positionEnd(played.pos) ?? (count >= 3 ? ({ kind: 'threefold-repetition' } as const) : undefined);
  return {
    pos: played.pos,
    calledRole: undefined,
    moves: [...game.moves, { color, role, san: played.san, uci: played.uci }],
    seen,
    end,
  };
}

export const sideToMove = (game: HandAndBrainGame): Color => turn(game.pos);
export const isInCheck = (game: HandAndBrainGame): boolean => inCheck(game.pos);
export const currentFen = (game: HandAndBrainGame): string => fenOf(game.pos);
export const lastMove = (game: HandAndBrainGame): [SquareName, SquareName] | undefined => {
  const m = game.moves[game.moves.length - 1];
  return m ? uciSquares(m.uci) : undefined;
};

const ROLE_LETTER: Record<Role, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

/** "1. N: Nf3   P: e5" style lines for the visible move list. */
export function moveLines(game: HandAndBrainGame): string[] {
  const lines: string[] = [];
  const part = (m: MoveRecord | undefined): string => (m ? `${ROLE_LETTER[m.role]}: ${m.san}` : '');
  for (let i = 0; i < game.moves.length; i += 2) {
    const white = game.moves[i];
    const black = game.moves[i + 1];
    lines.push(black ? `${i / 2 + 1}. ${part(white)}   ${part(black)}` : `${i / 2 + 1}. ${part(white)}`);
  }
  return lines;
}

/** Plain words for how the game ended, grounded in positionEnd/repetition tracking above. */
export function describeEnd(game: HandAndBrainGame): string {
  const e = game.end;
  if (!e) return '';
  switch (e.kind) {
    case 'checkmate':
      return `Checkmate. ${e.winner === 'white' ? 'White' : 'Black'} wins.`;
    case 'stalemate':
      return 'Stalemate: the side to move has no legal move but is not in check, so it is a draw.';
    case 'insufficient-material':
      return 'Neither side has enough pieces left to checkmate, so it is a draw.';
    case 'fifty-moves':
      return 'Fifty moves passed without a capture or a pawn move, so it is a draw.';
    case 'threefold-repetition':
      return 'The same position came up three times, so it is a draw.';
  }
}
