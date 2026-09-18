// One attempt at one game against an engine opponent: pure state, no React, no engine.
// Generic over any start position and player colour; a subproject decides the FEN (e.g.
// mirrored for a lesson written from White's point of view) and never duplicates this.
import {
  fenOf, inCheck, legalDests, playMove, playUci, positionEnd, positionFromFen, repetitionKey, turn, uciSquares,
  type Color, type GameEnd, type Played, type Position, type Role, type SquareName,
} from '@human-chess/rules';

export interface PlayedMove {
  uci: string;
  san: string;
  fen: string;
}

export interface Game {
  startFen: string;
  playerColor: Color;
  pos: Position;
  moves: PlayedMove[];
  /** repetitionKey → times seen, including the start position. */
  seen: Map<string, number>;
  end: GameEnd | undefined;
}

export function startGame(startFen: string, playerColor: Color): Game {
  const pos = positionFromFen(startFen);
  return { startFen, playerColor, pos, moves: [], seen: new Map([[repetitionKey(pos), 1]]), end: positionEnd(pos) };
}

/**
 * Rebuild a game in progress from what a page reload keeps: the start FEN, the player's colour
 * and the UCI moves played so far (`uciMoves(game)`). Throws on an illegal or malformed move,
 * or on a move after the game ended, so a stale or corrupt snapshot is rejected as a whole
 * rather than restored half-way; callers fall back to a fresh game.
 */
export function resumeGame(startFen: string, playerColor: Color, ucis: readonly string[]): Game {
  let game = startGame(startFen, playerColor);
  for (const uci of ucis) game = applyMove(game, uci);
  return game;
}

export function applyMove(game: Game, uci: string): Game {
  return applyPlayed(game, playUci(game.pos, uci));
}

export function playPlayerMove(game: Game, from: SquareName, to: SquareName, promotion?: Role): Game {
  return applyPlayed(game, playMove(game.pos, from, to, promotion));
}

function applyPlayed(game: Game, { pos, san, uci }: Played): Game {
  if (game.end) throw new Error('the game is over');
  const key = repetitionKey(pos);
  const seen = new Map(game.seen);
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);
  const end = positionEnd(pos) ?? (count >= 3 ? ({ kind: 'threefold-repetition' } as const) : undefined);
  return { ...game, pos, seen, end, moves: [...game.moves, { uci, san, fen: fenOf(pos) }] };
}

export const currentFen = (game: Game): string => fenOf(game.pos);
export const sideToMove = (game: Game): Color => turn(game.pos);
export const isPlayersTurn = (game: Game): boolean => !game.end && turn(game.pos) === game.playerColor;
export const playerDests = (game: Game): Map<SquareName, SquareName[]> => (isPlayersTurn(game) ? legalDests(game.pos) : new Map());
export const isInCheck = (game: Game): boolean => inCheck(game.pos);
export const lastMove = (game: Game): [SquareName, SquareName] | undefined => {
  const m = game.moves[game.moves.length - 1];
  return m ? uciSquares(m.uci) : undefined;
};
export const uciMoves = (game: Game): string[] => game.moves.map(m => m.uci);

export type Result = 'won' | 'lost' | 'draw' | undefined;
export function result(game: Game): Result {
  if (!game.end) return undefined;
  if (game.end.kind === 'checkmate') return game.end.winner === game.playerColor ? 'won' : 'lost';
  return 'draw';
}

/** Plain words for how the attempt ended, for the learner. */
export function describeEnd(game: Game): string {
  const e = game.end;
  if (!e) return '';
  switch (e.kind) {
    case 'checkmate':
      return e.winner === game.playerColor ? 'Checkmate. You won!' : 'You got checkmated.';
    case 'stalemate':
      return turn(game.pos) === game.playerColor
        ? 'Stalemate: you have no legal move but are not in check, so it is a draw.'
        : 'Stalemate: the other king has no legal move but is not in check, so it is a draw.';
    case 'insufficient-material':
      return 'Neither side has enough pieces left to checkmate, so it is a draw.';
    case 'fifty-moves':
      return 'Fifty moves passed without a capture or a pawn move, so it is a draw.';
    case 'threefold-repetition':
      return 'The same position came up three times, so it is a draw.';
  }
}
