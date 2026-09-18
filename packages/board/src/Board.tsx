// The board UI: chessground (GPL-3.0-or-later, lichess) wrapped as a React component.
// This is the only package that imports chessground. It never decides legality: the
// caller passes the legal destinations it got from @human-chess/rules.
// Lives in its own module (not index.tsx) so MoveLine.tsx can import it without a cycle through
// index.tsx, which re-exports both.
import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import { isPromotionMove, positionFromFen, type Color, type Role, type SquareName } from '@human-chess/rules';
import { promotionSquareLayout } from './promotionPicker';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './coords.css';
import './board.css';

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
  /** Called once a move is decided. When the move is a pawn reaching the last rank, Board first
   * shows a lichess-style picker (queen/knight/rook/bishop) over the destination square and only
   * calls this once a piece is chosen, with `promotion` set; cancelling the picker (a click
   * elsewhere, or Escape) calls nothing and the pawn snaps back. Never called with `promotion`
   * for a non-promoting move. */
  onMove: (from: SquareName, to: SquareName, promotion?: Role) => void;
  /** CSS size of the square board; defaults to 100% of the parent's width. */
  size?: string;
  /** Right-click to circle a square, right-drag to draw an arrow (chessground's built-in
   * `drawable`); right-click again on a shape removes it. Default true — lichess allows drawing
   * on every board, not just ones the viewer can move on. */
  drawable?: boolean;
}

/** A promotion move awaiting the picker's answer: chessground has already moved the pawn
 * visually (see events.after below), but the real, ruled move is not played until a piece is
 * picked, so nothing outside this component knows this move happened yet. */
interface PendingPromotion {
  from: SquareName;
  to: SquareName;
  /** The props the half-played move was made under. If any of them change while the picker is
   * up (the caller loaded another position, flipped the board, ended the game...) the pending
   * move no longer belongs to what the caller is showing, so the picker is cancelled. */
  fen: string;
  orientation: Color;
  movableColor: Color | undefined;
}

export function Board(props: BoardProps): React.JSX.Element {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMove = useRef(props.onMove);
  onMove.current = props.onMove;
  const [pending, setPending] = useState<PendingPromotion | null>(null);
  // Read inside the "after" handler below, which chessground closes over at construction/config
  // time — a ref so the handler always sees the fen actually on the board right now rather than
  // a stale one from whenever that particular config() call happened to run.
  const fenRef = useRef(props.fen);
  fenRef.current = props.fen;
  // Same reason: the pending record snapshots the props the move was made under (see
  // PendingPromotion), so it has to read the current ones, not those of the config() call
  // that installed the handler.
  const propsRef = useRef(props);
  propsRef.current = props;

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
      events: {
        after: (from, to) => {
          const f = from as SquareName;
          const t = to as SquareName;
          // isPromotionMove reads the piece on `from` in the position *before* this move, so it
          // needs the fen chessground was just shown, not the one this move is about to produce.
          if (isPromotionMove(positionFromFen(fenRef.current), f, t)) {
            const { fen, orientation, movableColor } = propsRef.current;
            setPending({ from: f, to: t, fen, orientation, movableColor });
          } else {
            onMove.current(f, t);
          }
        },
      },
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
    // While a picker is up, the caller hasn't been told the move happened yet, so nothing about
    // its props has legitimately changed (fen is still the pre-move position); skip pushing
    // config so an unrelated parent re-render (a new `dests` map with the same content, say)
    // can't re-arm moving out of the picker's half-played position. choosePromotion/cancelPromotion
    // handle the two ways the picker actually closes.
    if (pending) {
      const same = pending.fen === props.fen && pending.orientation === props.orientation && pending.movableColor === props.movableColor;
      if (same) return;
      // The caller moved on while a picker was up: drop the pending move and fall through so
      // the new props reach chessground.
      setPending(null);
    }
    const cfg = config();
    const keep = shownFen.current === props.fen ? api.current.state.drawable.shapes : [];
    shownFen.current = props.fen;
    api.current.set({ ...cfg, drawable: { ...cfg.drawable, shapes: keep } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.fen, props.orientation, props.turnColor, props.check, props.lastMove, props.dests, props.movableColor, props.drawable]);

  // Cancel the picker: snap the pawn back by re-applying the current (unchanged) props, and
  // forget the pending move. Nothing outside this component is told anything happened. The fen
  // is unchanged, so (as in the update effect above) shapes have to be preserved by hand or
  // chessground's own configure() would clear them (config.d.ts: any config carrying `fen`
  // resets `drawable.shapes` unless the call supplies its own).
  const cancelPromotion = (): void => {
    const shapes = api.current?.state.drawable.shapes ?? [];
    setPending(null);
    const cfg = config();
    api.current?.set({ ...cfg, drawable: { ...cfg.drawable, shapes } });
  };

  // The listener is bound once per picker but cancelPromotion is recreated every render (it
  // closes over config()/props), so it is read through a ref rather than captured.
  const cancelRef = useRef(cancelPromotion);
  cancelRef.current = cancelPromotion;
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancelRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const choosePromotion = (role: Role): void => {
    if (!pending) return;
    const { from, to } = pending;
    setPending(null);
    onMove.current(from, to, role);
  };

  const size = props.size ?? '100%';
  return (
    <div className="hc-board-wrap" style={{ width: size, aspectRatio: '1 / 1', position: 'relative' }}>
      {/* chessground already suppresses the browser context menu on its own board element whenever
          drawable is enabled at construction time (events.js: `disableContextMenu || drawable.enabled`
          gates the listener) or `disableContextMenu` is set; this handler is a defensive fallback
          for the wrapper div itself, e.g. if a board is ever constructed with drawing off and later
          switched on (chessground only binds that listener once, at construction). */}
      <div ref={el} style={{ width: '100%', height: '100%' }} onContextMenu={props.drawable === false ? undefined : e => e.preventDefault()} />
      {pending && (
        <PromotionPicker to={pending.to} color={props.turnColor} orientation={props.orientation} onPick={choosePromotion} onCancel={cancelPromotion} />
      )}
    </div>
  );
}

/**
 * The lichess-style picker: a transparent backdrop covering the whole board (click anywhere on
 * it to cancel) plus four squares stacked over the destination file, drawn with chessground's
 * own piece sprites the same way BoardEditor.tsx's palette does — a `<piece class="color role">`
 * element inside its own `.cg-wrap`, so chessground.cburnett.css (already imported by Board.tsx)
 * supplies the artwork rather than a hand-drawn icon.
 */
function PromotionPicker({
  to,
  color,
  orientation,
  onPick,
  onCancel,
}: {
  to: SquareName;
  color: Color;
  orientation: Color;
  onPick: (role: Role) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const squares = promotionSquareLayout(to, orientation);
  return (
    <div className="hc-promotion-backdrop" onClick={onCancel}>
      {squares.map(({ role, leftPct, topPct }) => (
        <button
          key={role}
          type="button"
          className="hc-promotion-square"
          style={{ left: `${leftPct}%`, top: `${topPct}%`, width: '12.5%', height: '12.5%' }}
          aria-label={`Promote to ${role}`}
          // Stops the backdrop's onClick (a plain click bubbles) from also firing as a cancel.
          onClick={e => {
            e.stopPropagation();
            onPick(role);
          }}
        >
          <span className="cg-wrap" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<piece class="${color} ${role}"></piece>` }} />
        </button>
      ))}
    </div>
  );
}
