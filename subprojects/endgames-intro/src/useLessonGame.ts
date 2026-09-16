import { useCallback, useEffect, useRef, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { maximalResistance, type Opponent } from '@human-chess/play';
import type { EndgameLesson } from '@human-chess/positions';
import { isPromotionMove, type Color, type SquareName } from '@human-chess/rules';
import { applyMove, currentFen, isPlayersTurn, playPlayerMove, startFen, startGame, uciMoves, type LessonGame } from './game';

export type EngineState = { kind: 'idle' } | { kind: 'thinking' } | { kind: 'failed'; message: string };

const randomColor = (): Color => (Math.random() < 0.5 ? 'white' : 'black');

// Module-level so the engine effect's dependency is a stable reference (a fresh default object
// per render would re-run the effect, cancel the search and queue another, without end).
const DEFAULT_OPPONENT = maximalResistance();

/**
 * Drives one attempt: the learner moves through the board, the opponent answers through the
 * engine. Any engine failure is shown as such; the app never plays a move the engine did not
 * return (A1).
 */
export function useLessonGame(lesson: EndgameLesson, engine: UciEngine | undefined, opponent: Opponent = DEFAULT_OPPONENT) {
  const [game, setGame] = useState<LessonGame>(() => startGame(lesson, randomColor()));
  const [engineState, setEngineState] = useState<EngineState>({ kind: 'idle' });
  const attempt = useRef(0);
  const latest = useRef(game);
  latest.current = game;

  const restart = useCallback(
    (l: EndgameLesson = lesson) => {
      attempt.current += 1;
      setEngineState({ kind: 'idle' });
      setGame(startGame(l, randomColor()));
    },
    [lesson],
  );

  useEffect(() => {
    if (game.lesson.id !== lesson.id) restart(lesson);
  }, [lesson, game.lesson.id, restart]);

  const onPlayerMove = useCallback((from: SquareName, to: SquareName) => {
    const g = latest.current;
    if (!isPlayersTurn(g)) return;
    const promotion = isPromotionMove(g.pos, from, to) ? 'queen' : undefined;
    setGame(playPlayerMove(g, from, to, promotion));
  }, []);

  useEffect(() => {
    if (!engine || game.end || isPlayersTurn(game)) return;
    const myAttempt = attempt.current;
    const ply = game.moves.length;
    let cancelled = false;
    setEngineState({ kind: 'thinking' });
    opponent
      .chooseMove(engine, startFen(game), uciMoves(game))
      .then(({ move }) => {
        if (cancelled || myAttempt !== attempt.current) return;
        const g = latest.current;
        if (g.moves.length !== ply || g.end) return;
        setGame(applyMove(g, move));
        setEngineState({ kind: 'idle' });
      })
      .catch((err: unknown) => {
        if (cancelled || myAttempt !== attempt.current) return;
        setEngineState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [engine, game, opponent]);

  return { game, engineState, onPlayerMove, restart, fen: currentFen(game) };
}
