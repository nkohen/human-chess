// One attempt at one lesson: pure state, no React, no engine. Testable on its own.
import type { EndgameLesson } from '@human-chess/positions';
import {
  fenOf, inCheck, legalDests, mirrorColors, playMove, playUci, positionEnd, positionFromFen, repetitionKey, turn,
  type Color, type GameEnd, type Played, type Position, type Role, type SquareName,
} from '@human-chess/rules';

export interface PlayedMove {
  uci: string;
  san: string;
  fen: string;
}

export interface LessonGame {
  lesson: EndgameLesson;
  playerColor: Color;
  pos: Position;
  moves: PlayedMove[];
  /** repetitionKey → times seen, including the start position. */
  seen: Map<string, number>;
  end: GameEnd | undefined;
}

export function startGame(lesson: EndgameLesson, playerColor: Color): LessonGame {
  const base = positionFromFen(lesson.fen);
  const pos = playerColor === 'white' ? base : mirrorColors(base);
  return { lesson, playerColor, pos, moves: [], seen: new Map([[repetitionKey(pos), 1]]), end: positionEnd(pos) };
}

export function applyMove(game: LessonGame, uci: string): LessonGame {
  return applyPlayed(game, playUci(game.pos, uci));
}

export function playPlayerMove(game: LessonGame, from: SquareName, to: SquareName, promotion?: Role): LessonGame {
  return applyPlayed(game, playMove(game.pos, from, to, promotion));
}

function applyPlayed(game: LessonGame, { pos, san, uci }: Played): LessonGame {
  if (game.end) throw new Error('the game is over');
  const key = repetitionKey(pos);
  const seen = new Map(game.seen);
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);
  const end = positionEnd(pos) ?? (count >= 3 ? ({ kind: 'threefold-repetition' } as const) : undefined);
  return { ...game, pos, seen, end, moves: [...game.moves, { uci, san, fen: fenOf(pos) }] };
}

export const startFen = (game: LessonGame): string => (game.playerColor === 'white' ? game.lesson.fen : fenOf(mirrorColors(positionFromFen(game.lesson.fen))));
export const currentFen = (game: LessonGame): string => fenOf(game.pos);
export const sideToMove = (game: LessonGame): Color => turn(game.pos);
export const isPlayersTurn = (game: LessonGame): boolean => !game.end && turn(game.pos) === game.playerColor;
export const playerDests = (game: LessonGame): Map<SquareName, SquareName[]> => (isPlayersTurn(game) ? legalDests(game.pos) : new Map());
export const isInCheck = (game: LessonGame): boolean => inCheck(game.pos);
export const lastMove = (game: LessonGame): [SquareName, SquareName] | undefined => {
  const m = game.moves[game.moves.length - 1];
  return m ? [m.uci.slice(0, 2) as SquareName, m.uci.slice(2, 4) as SquareName] : undefined;
};
export const uciMoves = (game: LessonGame): string[] => game.moves.map(m => m.uci);

export type Result = 'won' | 'not-won' | undefined;
export function result(game: LessonGame): Result {
  if (!game.end) return undefined;
  return game.end.kind === 'checkmate' && game.end.winner === game.playerColor ? 'won' : 'not-won';
}

/** Plain words for how the attempt ended, for the learner. */
export function describeEnd(game: LessonGame): string {
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
