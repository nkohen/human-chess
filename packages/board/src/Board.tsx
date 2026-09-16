// The board UI: chessground (GPL-3.0-or-later, lichess) wrapped as a React component.
// This is the only package that imports chessground. It never decides legality: the
// caller passes the legal destinations it got from @human-chess/rules.
// Lives in its own module (not index.tsx) so MoveLine.tsx can import it without a cycle through
// index.tsx, which re-exports both.
import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Color, SquareName } from '@human-chess/rules';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export interface BoardProps {
  fen: string;
  orientation: Color;
  turnColor: Color;
  /** Legal moves from @human-chess/rules. An empty map makes the board view-only. */
  dests: Map<SquareName, SquareName[]>;
  /** Which colour the person at this board may move; undefined disables moving. */
  movableColor: Color | undefined;
  lastMove?: [SquareName, SquareName] | undefined;
  check: boolean;
  onMove: (from: SquareName, to: SquareName) => void;
  /** CSS size of the square board; defaults to 100% of the parent's width. */
  size?: string;
}

export function Board(props: BoardProps): React.JSX.Element {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;

  const config = (): Config => ({
    fen: props.fen,
    orientation: props.orientation,
    turnColor: props.turnColor,
    check: props.check,
    lastMove: props.lastMove ? [...props.lastMove] : [],
    coordinates: true,
    animation: { enabled: true, duration: 200 },
    highlight: { lastMove: true, check: true },
    movable: {
      free: false,
      // chessground merges configs, so an absent key would keep the old colour; empty dests plus
      // disabled dragging and selecting is what actually makes the board inert.
      color: props.movableColor ?? props.turnColor,
      dests: props.movableColor ? props.dests : new Map(),
      showDests: true,
      events: { after: (from, to) => onMove.current(from as SquareName, to as SquareName) },
    },
    draggable: { enabled: props.movableColor !== undefined },
    selectable: { enabled: props.movableColor !== undefined },
    premovable: { enabled: false },
    drawable: { enabled: false },
  });

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, config());
    return () => {
      api.current?.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.set(config());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.orientation, props.turnColor, props.check, props.lastMove, props.dests, props.movableColor]);

  const size = props.size ?? '100%';
  return <div ref={el} style={{ width: size, aspectRatio: '1 / 1' }} />;
}
