// A line of moves rendered as SAN with move numbers; hovering (or tapping) a move shows the
// position reached after it on a small board. Notation and positions come from
// @human-chess/rules' annotateLine, never derived here.
// The preview holds a block-level board, so place a MoveLine inside a <div>, never a <p>.
import { useEffect, useMemo, useState } from 'react';
import { annotateLine, inCheck, positionFromFen, turn, type Color, type LinePly } from '@human-chess/rules';
import { Board } from './Board';

export interface MoveLineProps {
  startFen: string;
  ucis: string[];
  /** Show the position after the hovered move. Default true; set false when the learner must not see it (visualization exercises before the reveal). */
  preview?: boolean;
  orientation?: Color;
  /** CSS size of the preview board. Default 14rem. */
  previewSize?: string;
}

const EMPTY_DESTS = new Map();

export function MoveLine({ startFen, ucis, preview = true, orientation = 'white', previewSize = '14rem' }: MoveLineProps): React.JSX.Element {
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  // A stale hovered index from the previous line would otherwise point at the wrong ply (or an
  // out-of-range one) once startFen/ucis change under the same mounted component.
  useEffect(() => setHovered(undefined), [startFen, ucis]);
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

  return (
    <span className="hc-moveline" style={{ position: 'relative', display: 'inline-block' }} onMouseLeave={() => setHovered(undefined)}>
      {plies.map((p, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          {p.label ? `${p.label} ` : ''}
          <span
            className={`hc-moveline-move${hovered === i ? ' hovered' : ''}`}
            style={{ cursor: preview ? 'pointer' : undefined, textDecoration: hovered === i ? 'underline' : undefined }}
            onMouseEnter={() => setHovered(i)}
            onClick={() => setHovered(h => (h === i ? undefined : i))}
          >
            {p.san}
          </span>
        </span>
      ))}
      {shown && shownPos && (
        <span
          className="hc-moveline-preview"
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 10, width: previewSize,
            background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: 4,
          }}
        >
          <Board fen={shown.fenAfter} orientation={orientation} turnColor={turn(shownPos)} dests={EMPTY_DESTS} movableColor={undefined} check={inCheck(shownPos)} onMove={() => undefined} />
          <span style={{ fontSize: '0.8rem', color: '#333' }}>after {plyLabel(shown)}</span>
        </span>
      )}
    </span>
  );
}

/** Always numbered, e.g. "12. e4" or "12… e5", so the caption stands on its own. */
function plyLabel(p: LinePly): string {
  return `${p.moveNumber}${p.color === 'white' ? '.' : '…'} ${p.san}`;
}
