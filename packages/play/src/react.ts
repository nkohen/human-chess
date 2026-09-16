// React glue for driving one attempt at a game against an engine opponent. Kept out of the
// package's main entry ("./react" subpath) so non-React consumers never pull in React.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { isPromotionMove, type Color, type SquareName } from '@human-chess/rules';
import { applyMove, currentFen, isPlayersTurn, playPlayerMove, startGame, uciMoves, type Game } from './game';
import { maximalResistance, type Opponent } from './opponent';

export type EngineState = { kind: 'idle' } | { kind: 'thinking' } | { kind: 'failed'; message: string };

export interface RestartTo {
  startFen: string;
  playerColor: Color;
}

export interface UseEngineGameOptions {
  startFen: string;
  playerColor: Color;
  /** A ready engine, or undefined while it loads. */
  engine: UciEngine | undefined;
  opponent?: Opponent;
  /** When the attempt reaches this many played plies, it is treated as finished for play
   * purposes (no further engine move requested, the player can no longer move) even though
   * the position itself has not ended; `end` is left undefined in that case. */
  maxPlies?: number;
}

// Module-level so the engine effect's dependency is a stable reference (a fresh default object
// per render would re-run the effect, cancel the search and queue another, without end).
const DEFAULT_OPPONENT = maximalResistance();

/**
 * Drives one attempt: the player moves through the board, the opponent answers through the
 * engine. Any engine failure is shown as such; the app never plays a move the engine did not
 * return (A1).
 */
export function useEngineGame(options: UseEngineGameOptions) {
  const { startFen, playerColor, engine, opponent = DEFAULT_OPPONENT, maxPlies } = options;
  const [game, setGame] = useState<Game>(() => startGame(startFen, playerColor));
  const [engineState, setEngineState] = useState<EngineState>({ kind: 'idle' });
  const attempt = useRef(0);
  const latest = useRef(game);
  latest.current = game;

  const restart = useCallback(
    (next?: RestartTo) => {
      attempt.current += 1;
      setEngineState({ kind: 'idle' });
      setGame(startGame(next?.startFen ?? startFen, next?.playerColor ?? playerColor));
    },
    [startFen, playerColor],
  );

  const plyLimitReached = maxPlies !== undefined && game.moves.length >= maxPlies;
  const finished = Boolean(game.end) || plyLimitReached;

  const onPlayerMove = useCallback(
    (from: SquareName, to: SquareName) => {
      const g = latest.current;
      const limited = maxPlies !== undefined && g.moves.length >= maxPlies;
      if (!isPlayersTurn(g) || limited) return;
      const promotion = isPromotionMove(g.pos, from, to) ? 'queen' : undefined;
      setGame(playPlayerMove(g, from, to, promotion));
    },
    [maxPlies],
  );

  useEffect(() => {
    if (!engine || game.end || plyLimitReached || isPlayersTurn(game)) return;
    const myAttempt = attempt.current;
    const ply = game.moves.length;
    let cancelled = false;
    setEngineState({ kind: 'thinking' });
    opponent
      .chooseMove(engine, game.startFen, uciMoves(game))
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
      engine?.stop();
    };
  }, [engine, game, opponent, plyLimitReached]);

  return { game, engineState, onPlayerMove, restart, fen: currentFen(game), finished };
}
