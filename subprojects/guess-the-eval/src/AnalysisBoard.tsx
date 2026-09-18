// Free play from a revealed guess-the-eval position: legal moves for whichever side is to move
// come from @human-chess/rules (never hand-rolled, per CLAUDE.md), with an undo stack and
// AnalysisPanel's live top-3 engine lines beside the board. This is single-device free play —
// there is no shared/multiplayer analysis board, since packages/rooms (reserved for a future
// multiplayer layer) does not exist yet — so PvP's "analyse any position at the end" reuses this
// same component on whichever one device the match was played on, same as PvE.
import { useMemo, useState } from 'react';
import { Board } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import { fenOf, inCheck, legalDests, playMove, positionFromFen, turn, type Role, type SquareName } from '@human-chess/rules';
import { Button, Panel, Toolbar, Workbench } from '@human-chess/ui';
import { AnalysisPanel } from './AnalysisPanel';

interface HistoryEntry {
  fen: string;
  lastMove?: [SquareName, SquareName];
}

export interface AnalysisBoardProps {
  engine: UciEngine | undefined;
  /** The position analysis starts from — the just-revealed position, untouched until a move is
   * played here. */
  initialFen: string;
  title: string;
  onBack: () => void;
}

export function AnalysisBoard({ engine, initialFen, title, onBack }: AnalysisBoardProps): React.JSX.Element {
  // Re-seeds the history whenever the caller hands over a different starting position (PvP's
  // results screen reuses one AnalysisBoard instance across several "Analyse" buttons).
  const [seedFen, setSeedFen] = useState(initialFen);
  const [history, setHistory] = useState<HistoryEntry[]>([{ fen: initialFen }]);
  if (seedFen !== initialFen) {
    setSeedFen(initialFen);
    setHistory([{ fen: initialFen }]);
  }

  const current = history[history.length - 1]!;
  const pos = useMemo(() => positionFromFen(current.fen), [current.fen]);
  const dests = useMemo(() => legalDests(pos), [pos]);

  // `promotion` comes from the board's own picker (Board.tsx) on a promoting move; undefined otherwise.
  const onBoardMove = (from: SquareName, to: SquareName, promotion?: Role): void => {
    const played = playMove(pos, from, to, promotion);
    setHistory(h => [...h, { fen: fenOf(played.pos), lastMove: [from, to] }]);
  };

  const undo = (): void => {
    setHistory(h => (h.length > 1 ? h.slice(0, -1) : h));
  };

  const board = (sizePx: number): React.JSX.Element => (
    <Board
      fen={current.fen}
      orientation="white"
      turnColor={turn(pos)}
      dests={dests}
      movableColor={turn(pos)}
      {...(current.lastMove ? { lastMove: current.lastMove } : {})}
      check={inCheck(pos)}
      onMove={onBoardMove}
      size={`${sizePx}px`}
    />
  );

  return (
    <Workbench
      title={title}
      board={board}
      primary={
        <Toolbar>
          <Button variant="secondary" onClick={undo} disabled={history.length <= 1}>
            Undo
          </Button>
          <Button variant="primary" onClick={onBack}>
            Back to the round
          </Button>
        </Toolbar>
      }
    >
      <Panel title="Engine's top lines">
        <AnalysisPanel engine={engine} fen={current.fen} />
      </Panel>
    </Workbench>
  );
}
