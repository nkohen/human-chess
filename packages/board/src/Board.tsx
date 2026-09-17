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
import './coords.css';

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
  /** Right-click to circle a square, right-drag to draw an arrow (chessground's built-in
   * `drawable`); right-click again on a shape removes it. Default true — lichess allows drawing
   * on every board, not just ones the viewer can move on. */
  drawable?: boolean;
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
    // visible: true so a drawn circle/arrow actually renders (enabled alone only turns on the
    // right-click/right-drag input handling). Keys checked against chessground's own
    // config.d.ts/draw.d.ts (node_modules/chessground) rather than guessed.
    drawable: { enabled: props.drawable ?? true, visible: true },
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

  // chessground's `configure()` resets user-drawn shapes to `config.drawable.shapes ?? []` on
  // every `set()` that carries a fen. Shapes belong to the position being looked at, so they are
  // cleared when the fen changes; on any other prop change (a caller re-rendering with a fresh
  // `dests` map, a check flag, ...) the current shapes are passed back so a circle or arrow the
  // person drew survives. `setShapes` is the user-shapes API; `setAutoShapes` is for
  // computer-drawn annotations and is not used here.
  const shownFen = useRef(props.fen);
  useEffect(() => {
    if (!api.current) return;
    const cfg = config();
    const keep = shownFen.current === props.fen ? api.current.state.drawable.shapes : [];
    shownFen.current = props.fen;
    api.current.set({ ...cfg, drawable: { ...cfg.drawable, shapes: keep } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.orientation, props.turnColor, props.check, props.lastMove, props.dests, props.movableColor, props.drawable]);

  const size = props.size ?? '100%';
  return (
    // chessground already suppresses the browser context menu on its own board element whenever
    // drawable is enabled at construction time (events.js: `disableContextMenu || drawable.enabled`
    // gates the listener) or `disableContextMenu` is set; this handler is a defensive fallback
    // for the wrapper div itself, e.g. if a board is ever constructed with drawing off and later
    // switched on (chessground only binds that listener once, at construction).
    <div ref={el} style={{ width: size, aspectRatio: '1 / 1' }} onContextMenu={props.drawable === false ? undefined : e => e.preventDefault()} />
  );
}
