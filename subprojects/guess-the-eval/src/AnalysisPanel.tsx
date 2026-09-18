// A compact top-3-lines panel for the "analyse this position" feature: same MultiPV
// streaming/cancellation shape as openings-builder's MultiPvPanel
// (subprojects/openings-builder/src/MultiPvPanel.tsx) — a `cancelled` flag so a late response
// from a superseded search is never applied, and the render itself re-checks the fen each
// payload was computed for — but fixed at 3 lines and one depth (no depth field, no "add to
// tree") since this subproject has no repertoire to add lines to, just a fixed vantage point on
// whatever position free play has reached. Not lifted into packages/board or packages/ui: A2/R1
// says decompose the shared layer before parallelizing work, not before there's a second real
// consumer to learn the right shape from, and MultiPvPanel is the only other one so far. Every
// line shown is a real Analysis or in-progress PvLine from the engine (A1) — nothing here
// invents a score.
import { useEffect, useState } from 'react';
import { MoveLine } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type PvLine, type UciEngine } from '@human-chess/engine';
import { positionFromFen, turn } from '@human-chess/rules';
import { Status } from '@human-chess/ui';

const MULTIPV = 3;
// First guess: one notch past the reveal's depth-14 single line (GuessTheEval.tsx's
// ANALYSE_DEPTH), since three lines together take a little longer than one but should still
// return in a few seconds against the in-browser wasm engine.
const ANALYSIS_DEPTH = 16;
const PV_SAN_MOVES = 6;

interface Positioned {
  fen: string;
  lines: PvLine[];
}

export interface AnalysisPanelProps {
  engine: UciEngine | undefined;
  fen: string;
}

function LineList({ fen, lines }: { fen: string; lines: PvLine[] }): React.JSX.Element {
  const sideToMove = turn(positionFromFen(fen));
  return (
    <ol className="gte-analysis-lines">
      {lines.map(line => (
        <li key={line.multipv}>
          <strong>{formatScore(whitePerspective(line.score, sideToMove))}</strong>{' '}
          <MoveLine startFen={fen} ucis={line.pv.slice(0, PV_SAN_MOVES)} />
        </li>
      ))}
    </ol>
  );
}

export function AnalysisPanel({ engine, fen }: AnalysisPanelProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<Analysis | undefined>(undefined);
  const [progress, setProgress] = useState<Positioned | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAnalysis(undefined);
    setProgress(undefined);
    setError(undefined);
    if (!engine) return;
    let cancelled = false;
    engine
      .analyse(fen, [], { depth: ANALYSIS_DEPTH }, MULTIPV, undefined, lines => {
        if (cancelled) return;
        setProgress({ fen, lines });
      })
      .then(a => {
        if (cancelled) return;
        setAnalysis(a);
        setProgress(undefined);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      engine.stop();
    };
  }, [engine, fen]);

  if (!engine) return <Status kind="info">The engine is not loaded.</Status>;
  if (error) return <Status kind="error">The engine failed: {error}</Status>;

  if (analysis && analysis.fen === fen) {
    return (
      <div className="gte-analysis">
        {analysis.lines[0] === undefined ? (
          // No depth is printed here: none was reached, and the requested ANALYSIS_DEPTH is not
          // an engine result (A1).
          <Status kind="info">{analysis.engine} returned no lines.</Status>
        ) : (
          <>
            <p className="gte-provenance">
              {analysis.engine}, depth {analysis.lines[0].depth}, top {analysis.lines.length} line
              {analysis.lines.length === 1 ? '' : 's'} — scores from White's perspective
            </p>
            <LineList fen={fen} lines={analysis.lines} />
          </>
        )}
      </div>
    );
  }

  if (progress && progress.fen === fen && progress.lines.length > 0) {
    const reachedDepth = Math.max(...progress.lines.map(l => l.depth));
    return (
      <div className="gte-analysis">
        <p className="gte-provenance">
          {engine.name}, depth {reachedDepth} of {ANALYSIS_DEPTH} — analysing…
        </p>
        <LineList fen={fen} lines={progress.lines} />
      </div>
    );
  }

  return <Status kind="busy">Analysing…</Status>;
}
