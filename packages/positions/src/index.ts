// Curated position pools. Today: the hard-coded start of the endgames-introduction ladder
// below, plus curated.ts's positions from the user's own chess.com games (endgames and
// middlegames, screenshots supplied 2026-09-17 — see curated.ts and curatedEval.ts). Later:
// pools mined from the user's pedagogical-positions folder and generated positions, each with
// the criteria that admitted it. Every position here is validated by tests: it parses, White is
// to move, the game is not over, and the engine sees a forced win (the hard-coded ladder below);
// curated.ts's own positions are real game positions and are validated separately in
// curated.test.ts (legal FEN, unique ids/FENs, chicachoo123 on the recorded playAs side).
import type { Role } from '@human-chess/rules';

export * from './selfPlay';

export interface EndgameLesson {
  id: string;
  /** Rung of the ladder; lessons with the same stage are variations of one theme. */
  stage: number;
  title: string;
  /** The winning side is White and to move. The app mirrors it when the learner plays Black. */
  fen: string;
  /** The one piece this lesson adds to the learner's vocabulary, if any (at most one per position). */
  introduces?: Role;
  /** Plain text shown before the first attempt. The first lesson also explains check and checkmate. */
  intro: string;
}

export const endgameLadder: EndgameLesson[] = [
  {
    id: 'two-rooks-open-1',
    stage: 1,
    title: 'Two rooks: the ladder',
    fen: '8/8/8/4k3/8/8/8/R3K2R w - - 0 1',
    introduces: 'rook',
    intro:
      'Your king and two rooks against a lone king. A rook moves any distance along a row or a column. ' +
      'When a rook attacks the enemy king, that is check, and the king must get out of it. ' +
      'When it cannot, that is checkmate: you win. Use your rooks like rungs of a ladder: ' +
      'one rook cuts off a row, the other checks on the next row, and the king is pushed to the edge.',
  },
  {
    id: 'two-rooks-open-2',
    stage: 1,
    title: 'Two rooks: the ladder, again',
    fen: '8/8/8/3k4/8/8/6R1/1R2K3 w - - 0 1',
    intro: 'Same idea, different starting squares. Push the king to an edge, one row at a time.',
  },
  {
    id: 'queen-1',
    stage: 2,
    title: 'Queen and king',
    fen: '8/8/8/4k3/8/8/8/3QK3 w - - 0 1',
    introduces: 'queen',
    intro:
      'The queen moves like a rook and a bishop combined: any distance along rows, columns and diagonals. ' +
      'She cannot checkmate alone; your king must come and help. Careful: if the enemy king has no ' +
      'legal move and is not in check, that is stalemate and the game is a draw.',
  },
  {
    id: 'rook-1',
    stage: 3,
    title: 'Rook and king',
    fen: '8/8/8/4k3/8/8/8/R3K3 w - - 0 1',
    intro:
      'One rook needs your king even more. Keep the kings facing each other with one square between ' +
      'them, then check with the rook to push the enemy king back.',
  },
];
export * from './imbalanced';
export * from './recipes';
export * from './curated';
export * from './curatedEval';
