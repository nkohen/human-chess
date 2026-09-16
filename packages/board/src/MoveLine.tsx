// A line of moves rendered as SAN with move numbers; hovering (or tapping) a move shows the
// position reached after it on a small board. Notation and positions come from
// @human-chess/rules' annotateLine, never derived here.
// The preview is position: fixed and pointer-events: none (user feedback, 2026-09-16): it is
// placed from the hovered move's own viewport rect rather than flowing in the document, so it
// can never push layout around (no scrollbar/reflow feedback loop) and can never itself receive
// the pointer (so it cannot trigger a mouseenter/mouseleave loop with the move it is anchored to).
import { useEffect, useMemo, useState } from 'react';
import { annotateLine, inCheck, positionFromFen, turn, type Color, type LinePly, type SquareName } from '@human-chess/rules';
import { Board } from './Board';

export interface MoveLineProps {
  startFen: string;
  ucis: string[];
  /** Show the position after the hovered move. Default true; set false when the learner must not see it (visualization exercises before the reveal). */
  preview?: boolean;
  orientation?: Color;
  /** Pixel size of the preview board's own square. Default 224. A px number (not a CSS length)
   * so the fixed-position placement can check exactly whether the preview fits below the
   * hovered move before falling back to placing it above. */
  previewPx?: number;
}

const EMPTY_DESTS = new Map();

/** Extra vertical space the preview panel takes beyond the board square itself: the panel's own
 * padding (0.25rem top and bottom) plus the caption line below the board. An estimate — not a
 * measurement — used only to decide, before rendering, whether the preview fits below the move. */
const PREVIEW_CHROME_PX = 40;
/** Gap kept between the hovered move and the preview, and the minimum margin from viewport edges. */
const PREVIEW_GAP_PX = 4;

interface HoverRect {
  top: number;
  bottom: number;
  left: number;
}

export function MoveLine({ startFen, ucis, preview = true, orientation = 'white', previewPx = 224 }: MoveLineProps): React.JSX.Element {
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  const [rect, setRect] = useState<HoverRect | undefined>(undefined);
  // A stale hovered index from the previous line would otherwise point at the wrong ply (or an
  // out-of-range one) once startFen/ucis change under the same mounted component.
  useEffect(() => setHovered(undefined), [startFen, ucis]);

  // The preview is anchored to a viewport rect captured at hover time; it does not track the
  // page, so a scroll while it is shown would leave it drifting away from its move. Clearing it
  // (rather than repositioning it) is simplest and matches the request. Capture phase so a
  // scroll on any ancestor scroll container, not just the window, clears it too.
  // A resize moves the anchor too. A tap anywhere outside a move dismisses a preview opened by
  // tapping (touch devices get no mouseleave).
  useEffect(() => {
    if (hovered === undefined) return;
    const clear = () => setHovered(undefined);
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.hc-moveline-move')) clear();
    };
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [hovered]);

  const plies = useMemo((): LinePly[] | { error: string } => {
    try {
      return annotateLine(startFen, ucis);
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [startFen, ucis]);

  if ('error' in plies) {
    return <span className="hc-moveline">{ucis.join(' ')} (SAN unavailable: {plies.error})</span>;
  }

  const shown = preview && hovered !== undefined ? plies[hovered] : undefined;
  const shownPos = shown ? positionFromFen(shown.fenAfter) : undefined;
  const shownLastMove: [SquareName, SquareName] | undefined = shown
    ? [shown.uci.slice(0, 2) as SquareName, shown.uci.slice(2, 4) as SquareName]
    : undefined;

  const hover = (i: number, target: Element): void => {
    setHovered(i);
    setRect(target.getBoundingClientRect());
  };

  return (
    <span className="hc-moveline" style={{ position: 'relative', display: 'inline-block' }} onMouseLeave={() => setHovered(undefined)}>
      {plies.map((p, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          {p.label ? `${p.label} ` : ''}
          <span
            className={`hc-moveline-move${hovered === i ? ' hovered' : ''}`}
            style={{ cursor: preview ? 'pointer' : undefined, textDecoration: hovered === i ? 'underline' : undefined }}
            onMouseEnter={e => hover(i, e.currentTarget)}
            onClick={e => hover(i, e.currentTarget)}
          >
            {p.san}
          </span>
        </span>
      ))}
      {shown && shownPos && rect && (
        <span className="hc-moveline-preview" style={previewStyle(rect, previewPx)}>
          <Board fen={shown.fenAfter} orientation={orientation} turnColor={turn(shownPos)} dests={EMPTY_DESTS} movableColor={undefined} lastMove={shownLastMove} check={inCheck(shownPos)} onMove={() => undefined} />
          <span style={{ fontSize: '0.8rem', color: '#333' }}>after {plyLabel(shown)}</span>
        </span>
      )}
    </span>
  );
}

/** Fixed placement anchored to the hovered move's rect: below by default (top = rect.bottom +
 * gap), or above (bottom = viewport height - rect.top + gap) when the preview would not fit
 * below the viewport's bottom edge. `left` is clamped so the preview stays inside the viewport
 * width. Never affects document layout and never accepts pointer events. */
function previewStyle(rect: HoverRect, previewPx: number): React.CSSProperties {
  const previewHeight = previewPx + PREVIEW_CHROME_PX;
  const left = Math.min(Math.max(rect.left, PREVIEW_GAP_PX), window.innerWidth - previewPx - PREVIEW_GAP_PX);
  const base: React.CSSProperties = {
    position: 'fixed',
    left,
    width: previewPx,
    zIndex: 1000,
    pointerEvents: 'none',
    background: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    padding: '0.25rem',
    borderRadius: 4,
  };
  if (rect.bottom + previewHeight > window.innerHeight) {
    return { ...base, bottom: window.innerHeight - rect.top + PREVIEW_GAP_PX };
  }
  return { ...base, top: rect.bottom + PREVIEW_GAP_PX };
}

/** Always numbered, e.g. "12. e4" or "12… e5", so the caption stands on its own. */
function plyLabel(p: LinePly): string {
  return `${p.moveNumber}${p.color === 'white' ? '.' : '…'} ${p.san}`;
}
