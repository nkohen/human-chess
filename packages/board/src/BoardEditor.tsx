// A free-form board editor: chessground in "editor mode" (lichess's own /editor is the model),
// plus a palette to place/erase pieces by click. This is the second (and only other) chessground
// wrapper in this package; like Board.tsx it never judges legality — it hands back a piece
// placement, and the caller decides whether the result is even a legal position.
//
// Chessground keys used here were checked against packages/board/node_modules/chessground/dist/
// (the .d.ts files chessground itself publishes; the package's own "types" field points at them,
// not at any root-level .d.ts):
//   - config.d.ts: movable.free/color/showDests, draggable.enabled/deleteOnDropOff,
//     selectable.enabled, highlight.lastMove/check, premovable.enabled, drawable.enabled,
//     animation.enabled, events.change, events.select (top-level, not under movable).
//   - api.d.ts: Api.set/getFen/setPieces/state; Api.getKeyAtDomPos exists but turned out to be
//     unnecessary (see below).
//   - state.d.ts: HeadlessState shape confirming events.select fires independently of
//     draggable/selectable.enabled.
//   - board.d.ts (dist/board.js, read alongside it): `selectSquare` calls
//     `callUserFunction(state.events.select, key)` as its very first line, unconditionally, and
//     `drag.start` calls `selectSquare` on every pointerdown regardless of draggable/selectable
//     being enabled. So `events.select` is chessground's own square-clicked notification and
//     needs no DOM math — `getKeyAtDomPos`/`state.dom.bounds()` are what `events.select` is built
//     on internally (dist/board.js: `getKeyAtDomPos(pos, whitePov(s), s.dom.bounds())`), not
//     something this component has to redo.
//   - types.d.ts: Key, Piece, PiecesDiff.
//   - fen.d.ts / dist/fen.js `read()`: stops at the first space, so `Config.fen` accepts a
//     placement-only string or a full FEN interchangeably — confirming the `fen` prop doc below.
//   - dist/api.js: `setPieces()` calls `board.setPieces` directly and does NOT fire
//     `events.change` (only drag-driven moves/new-pieces do, per dist/board.js `baseMove` /
//     `baseNewPiece` / the deleteOnDropOff branch of dist/drag.js). So palette placements call
//     `onChange` explicitly; `events.change` alone would miss them.
import { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key as CgKey } from 'chessground/types';
import type { Color, Role } from '@human-chess/rules';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './coords.css';
import './board.css';

// chessground renders each piece as a bare custom `<piece>` element (dist/render.js), styled by
// its own CSS (`.cg-wrap piece.<role>.<color>` in chessground.cburnett.css) rather than any React
// component. The palette swatches reuse those glyphs by injecting the same element as static
// markup: rendering `<piece>` through React would make it warn in development that the tag is
// unrecognized (seen in the browser smoke run, 2026-09-16). The markup is built only from the
// typed colour and role unions, never from user input.

/** A palette selection: a piece to place, or the eraser. Exported so a caller can host the
 * palette itself (via `PiecePalette`) and drive BoardEditor's tool as a controlled value. */
export type EditorTool = { color: Color; role: Role } | 'erase';

export interface BoardEditorProps {
  /** Piece placement, or a full FEN (chessground's own fen reader stops at the first space either way). */
  fen: string;
  orientation: Color;
  /** Called with `api.getFen()` — piece placement only — after every edit (drag, drop-off delete, or palette click). */
  onChange: (placementFen: string) => void;
  /** CSS size of the square board; defaults to 100% of the parent's width. */
  size?: string;
  /** Controlled active tool. When provided (with `onToolChange`), BoardEditor stops owning the
   * tool state, so the caller can render the palette elsewhere — see `PiecePalette`. The board
   * slot then holds only the square board, which is what the fit-to-square Workbench layout
   * expects (a palette below the board inflates that square and clips its top rank on a phone). */
  tool?: EditorTool | null;
  /** Notified whenever the active tool changes (palette click, or a place/erase deselect). */
  onToolChange?: (tool: EditorTool | null) => void;
  /** Whether BoardEditor draws its own palette below the board. Default true (self-contained);
   * pass false when the caller renders `PiecePalette` itself. */
  renderPalette?: boolean;
}

type Tool = EditorTool;

const PALETTE_ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const PALETTE: Tool[] = [
  ...PALETTE_ROLES.map((role): Tool => ({ color: 'white', role })),
  ...PALETTE_ROLES.map((role): Tool => ({ color: 'black', role })),
  'erase',
];

function toolId(tool: Tool): string {
  return tool === 'erase' ? 'erase' : `${tool.color}-${tool.role}`;
}

function PaletteButton({ tool, selected, onSelect }: { tool: Tool; selected: boolean; onSelect: () => void }): React.JSX.Element {
  const label = tool === 'erase' ? 'Erase' : `${tool.color} ${tool.role}`;
  return (
    <button
      type="button"
      className={`hc-editor-palette-item${selected ? ' hc-editor-palette-item-selected' : ''}`}
      aria-pressed={selected}
      title={label}
      onClick={onSelect}
    >
      {tool === 'erase'
        ? <span className="hc-editor-erase-glyph" aria-hidden="true">✕</span>
        : (
          <span className="cg-wrap" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<piece class="${tool.color} ${tool.role}"></piece>` }} />
        )}
    </button>
  );
}

export interface PiecePaletteProps {
  /** The currently selected tool, or null for none. */
  value: Tool | null;
  /** Called with the next tool: the clicked one, or null when the clicked tool was already active
   * (clicking the active swatch toggles it off, back to free drag/select). */
  onChange: (tool: Tool | null) => void;
}

/** The place/erase palette on its own. BoardEditor renders this below the board by default; a
 * caller that needs the palette outside the board's square (e.g. the lesson builder, whose
 * Workbench sizes the board to a fit-to-square slot) can render it wherever it likes and feed
 * the selection back through BoardEditor's `tool`/`onToolChange`. */
export function PiecePalette({ value, onChange }: PiecePaletteProps): React.JSX.Element {
  return (
    <div className="hc-editor-palette">
      {PALETTE.map(t => (
        <PaletteButton
          key={toolId(t)}
          tool={t}
          selected={value !== null && toolId(value) === toolId(t)}
          onSelect={() => onChange(value !== null && toolId(value) === toolId(t) ? null : t)}
        />
      ))}
    </div>
  );
}

export function BoardEditor(props: BoardEditorProps): React.JSX.Element {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onChange = useRef(props.onChange);
  onChange.current = props.onChange;
  // Uncontrolled by default (own the tool state); controlled when the caller passes `tool`, so it
  // can host the palette itself. `onToolChange` fires either way.
  const [internalTool, setInternalTool] = useState<Tool | null>(null);
  const controlled = props.tool !== undefined;
  const tool = controlled ? props.tool ?? null : internalTool;
  const setTool = (next: Tool | null): void => {
    if (!controlled) setInternalTool(next);
    props.onToolChange?.(next);
  };
  const toolRef = useRef<Tool | null>(null);
  toolRef.current = tool;

  const place = (key: CgKey) => {
    const t = toolRef.current;
    const a = api.current;
    if (!t || !a) return;
    if (t === 'erase') a.setPieces(new Map([[key, undefined]]));
    else a.setPieces(new Map([[key, { color: t.color, role: t.role }]]));
    onChange.current(a.getFen());
  };

  useEffect(() => {
    if (!el.current) return;
    const config: Config = {
      fen: props.fen,
      orientation: props.orientation,
      coordinates: true,
      animation: { enabled: false },
      highlight: { lastMove: false, check: false },
      movable: { free: true, color: 'both', showDests: false },
      draggable: { enabled: toolRef.current === null, deleteOnDropOff: true },
      selectable: { enabled: toolRef.current === null },
      premovable: { enabled: false },
      predroppable: { enabled: false },
      drawable: { enabled: false },
      events: {
        change: () => api.current && onChange.current(api.current.getFen()),
        select: key => place(key),
      },
    };
    api.current = Chessground(el.current, config);
    return () => {
      api.current?.destroy();
      api.current = null;
    };
    // Constructed once; every later change (fen from outside, orientation, tool) is pushed
    // through the targeted effects below rather than tearing the board down and rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tool being selected disables both dragging and click-selection so that a click on the
  // board can only mean "place/erase at this square" (via events.select above), never "start a
  // free-move drag" or "select then click-move" (both of which free:true otherwise allows
  // regardless of tool state — see board.d.ts's `canMove`, which ignores `dests` when free).
  useEffect(() => {
    api.current?.set({ draggable: { enabled: tool === null }, selectable: { enabled: tool === null } });
    // A square selected before the tool was picked would otherwise keep its highlight (and feed
    // chessground's next pointerdown through `canMove` with the stale selection).
    api.current?.selectSquare(null);
  }, [tool]);

  useEffect(() => {
    api.current?.set({ orientation: props.orientation });
  }, [props.orientation]);

  // Only pushed when the prop actually changed from outside (e.g. a "Reset" button), so this
  // never fights the board's own edits: those flow the other way, through onChange.
  const shownFen = useRef(props.fen);
  useEffect(() => {
    if (shownFen.current === props.fen) return;
    shownFen.current = props.fen;
    api.current?.set({ fen: props.fen });
  }, [props.fen]);

  const size = props.size ?? '100%';
  return (
    <div className="hc-board-editor">
      <div ref={el} style={{ width: size, aspectRatio: '1 / 1' }} onContextMenu={e => e.preventDefault()} />
      {props.renderPalette !== false && <PiecePalette value={tool} onChange={setTool} />}
    </div>
  );
}
