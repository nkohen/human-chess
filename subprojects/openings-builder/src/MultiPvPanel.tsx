// The MultiPV engine panel: up to 3 lines for the current position, each traceable to a real
// Analysis (A1) — engine name and depth shown as provenance, nothing invented. Re-queries on
// every FEN change and never shows a line from a stale position: `analysis` is cleared
// synchronously when `fen` changes, a `cancelled` flag stops a late response from a superseded
// query from ever being applied, and the render itself re-checks `analysis.fen === fen` as a
// second guard.
import { useEffect, useState } from 'react';
import type { Analysis, Score, UciEngine } from '@human-chess/engine';
import { positionFromFen, sanLine } from '@human-chess/rules';

export interface MultiPvPanelProps {
  engine: UciEngine | undefined;
  fen: string;
  /** Plays the clicked line's first move (both on the board and into the tree). */
  onPlayMove: (uci: string) => void;
}

const DEPTH = 14;
const MULTIPV = 3;
const PV_SAN_MOVES = 6;

function formatScore(score: Score): string {
  if (score.type === 'mate') return `mate in ${Math.abs(score.value)}${score.value >= 0 ? '' : ' (against)'}`;
  const pawns = score.value / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}

export function MultiPvPanel({ engine, fen, onPlayMove }: MultiPvPanelProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<Analysis | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAnalysis(undefined);
    setError(undefined);
    if (!engine) return;
    let cancelled = false;
    engine
      .analyse(fen, [], { depth: DEPTH }, MULTIPV)
      .then(a => {
        if (cancelled) return;
        setAnalysis(a);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [engine, fen]);

  if (!engine) {
    return (
      <div className="ob-multipv">
        <p className="ob-multipv-status">The engine is not loaded.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="ob-multipv">
        <p className="ob-multipv-status">The engine failed: {error}</p>
      </div>
    );
  }
  if (!analysis || analysis.fen !== fen) {
    return (
      <div className="ob-multipv">
        <p className="ob-multipv-status">Analysing…</p>
      </div>
    );
  }

  return (
    <div className="ob-multipv">
      <p className="ob-multipv-provenance">
        {analysis.engine}, depth {analysis.lines[0]?.depth ?? DEPTH}, multipv {analysis.multipv}
      </p>
      {analysis.lines.length === 0 && <p className="ob-multipv-status">No lines returned.</p>}
      <ol className="ob-multipv-lines">
        {analysis.lines.map(line => {
          const first = line.pv[0];
          const san = (() => {
            try {
              return sanLine(positionFromFen(fen), line.pv.slice(0, PV_SAN_MOVES)).join(' ');
            } catch {
              return line.pv.slice(0, PV_SAN_MOVES).join(' ') + ' (SAN unavailable)';
            }
          })();
          return (
            <li key={line.multipv}>
              <button disabled={!first} onClick={() => first && onPlayMove(first)}>
                <strong>{formatScore(line.score)}</strong> {san}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
