// A non-interactive starting-position board, shown while there is nothing real to display yet:
// the engine loading or failed, a position still generating, or a PvP hand-over screen (which
// must not show the position before the next player's guess). Keeps the two-column layout and
// its board sizing stable across those transient states. Shared by SoloRound and PvpRound.
import { Board } from '@human-chess/board';
import { START_FEN, type SquareName } from '@human-chess/rules';

const EMPTY_DESTS = new Map<SquareName, SquareName[]>();

export function idleBoard(sizePx: number): React.JSX.Element {
  return (
    <Board
      fen={START_FEN}
      orientation="white"
      turnColor="white"
      dests={EMPTY_DESTS}
      movableColor={undefined}
      check={false}
      onMove={() => undefined}
      size={`${sizePx}px`}
    />
  );
}
