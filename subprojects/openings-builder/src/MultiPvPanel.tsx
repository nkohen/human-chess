// The MultiPV engine panel: up to 3 lines for the current position, each traceable to a real
// Analysis (A1) — engine name and depth shown as provenance, nothing invented. Re-queries on
// every FEN or depth change and never shows a line from a stale search: a `cancelled` flag
// stops a late response from a superseded query from ever being applied, and because the
// effect's `setAnalysis(undefined)` only runs after the render that follows a change, the
// render itself re-checks the fen and depth each payload was computed for against the current
// `fen`/`depth` — the guard the intermediate progress lines share with the final analysis.
import { useEffect, useState } from 'react';
import { MoveLine } from '@human-chess/board';
import { whitePerspective, type Analysis, type PvLine, type Score, type UciEngine } from '@human-chess/engine';
import { positionFromFen, turn, type Color } from '@human-chess/rules';
import { loadDepth, MAX_DEPTH, MIN_DEPTH, saveDepth } from './storage';

export interface MultiPvPanelProps {
  engine: UciEngine | undefined;
  fen: string;
  /** Plays the clicked line's first move (both on the board and into the tree). */
  onPlayMove: (uci: string) => void;
  /** The learner's colour, used to orient each line's hover preview board. Defaults to white. */
  orientation?: Color;
  /** When given (the builder passes it on the opponent's turn), a button offers to add every
   * line's first move to the tree at once as candidate opponent replies — the interactive
   * "what if" loop from the interview, with the engine as the source of "likely" for now (the
   * lichess explorer needs a login as of 2026-09-16; see memory/reuse-library.md). Receives the
   * first moves that are not yet in the tree. */
  onAddReplies?: (ucis: string[]) => void;
  /** UCIs already recorded at this position, so the button only counts new replies. */
  inTree?: string[];
}

const MULTIPV = 3;
const PV_SAN_MOVES = 6;

/** Lines paired with the FEN they were computed for — for both the final `Analysis` and the
 * in-progress payloads from `onProgress`, so both can be checked against the current `fen`
 * before being rendered. */
interface Positioned {
  fen: string;
  depth: number;
  lines: PvLine[];
}

function formatScore(score: Score): string {
  if (score.type === 'mate') return `mate in ${Math.abs(score.value)}${score.value >= 0 ? '' : ' (against)'}`;
  const pawns = score.value / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(2)}`;
}

/** Parses a depth field's text and clamps it into [MIN_DEPTH, MAX_DEPTH]; undefined while the
 * field is empty or not a number (mid-edit), so the caller can leave depth alone until then. */
function parseAndClampDepth(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.round(n)));
}

function LineButtons({ fen, lines, orientation, onPlayMove, onAddReplies, inTree }: {
  fen: string;
  lines: PvLine[];
  orientation: Color | undefined;
  onPlayMove: (uci: string) => void;
  onAddReplies: ((ucis: string[]) => void) | undefined;
  inTree: string[];
}): React.JSX.Element {
  const pos = positionFromFen(fen);
  const firsts = lines.flatMap(line => (line.pv[0] ? [line.pv[0]] : []));
  const newReplies = firsts.filter(uci => !inTree.includes(uci));
  return (
    <>
      <ol className="ob-multipv-lines">
        {lines.map(line => {
          const first = line.pv[0];
          return (
            <li key={line.multipv}>
              <button disabled={!first} onClick={() => first && onPlayMove(first)}>
                <strong>{formatScore(whitePerspective(line.score, turn(pos)))}</strong>{' '}
                <MoveLine startFen={fen} ucis={line.pv.slice(0, PV_SAN_MOVES)} {...(orientation ? { orientation } : {})} />
              </button>
              {first && inTree.includes(first) && <span className="ob-multipv-intree"> in tree</span>}
            </li>
          );
        })}
      </ol>
      {onAddReplies && firsts.length > 0 && (
        <button className="ob-add-replies" disabled={newReplies.length === 0} onClick={() => onAddReplies(newReplies)}>
          {newReplies.length === 0
            ? 'All of these opponent replies are in the tree'
            : `Add ${newReplies.length === 1 ? 'this opponent reply' : `these ${newReplies.length} opponent replies`} to the tree`}
        </button>
      )}
    </>
  );
}

export function MultiPvPanel({ engine, fen, onPlayMove, orientation, onAddReplies, inTree = [] }: MultiPvPanelProps): React.JSX.Element {
  const [depth, setDepth] = useState<number>(() => loadDepth());
  const [depthText, setDepthText] = useState<string>(() => String(depth));
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
      .analyse(fen, [], { depth }, MULTIPV, undefined, lines => {
        if (cancelled) return;
        setProgress({ fen, depth, lines });
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
  }, [engine, fen, depth]);

  // The field is free text while focused and only committed on blur or Enter: committing on
  // every keystroke made typing "20" briefly run a depth-6 search.
  function finalizeDepth(raw: string): void {
    const clamped = parseAndClampDepth(raw) ?? depth;
    setDepth(clamped);
    saveDepth(clamped);
    setDepthText(String(clamped));
  }

  // Above 30, the wasm engine's own internal limits (and the 60s hard timeout `analyse`
  // enforces regardless of engine) can be hit before the requested depth is ever reached, so
  // the input is capped there; 6 is a floor below which the lines are too shallow to be worth
  // showing at all.
  const depthControl = (
    <label className="ob-depth">
      Depth{' '}
      <input
        type="number"
        min={MIN_DEPTH}
        max={MAX_DEPTH}
        value={depthText}
        onChange={e => setDepthText(e.target.value)}
        onBlur={e => finalizeDepth(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') finalizeDepth(e.currentTarget.value);
        }}
      />
    </label>
  );

  if (!engine) {
    return (
      <div className="ob-multipv">
        {depthControl}
        <p className="ob-multipv-status">The engine is not loaded.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="ob-multipv">
        {depthControl}
        <p className="ob-multipv-status">The engine failed: {error}</p>
      </div>
    );
  }

  if (analysis && analysis.fen === fen && analysis.limit.depth === depth) {
    return (
      <div className="ob-multipv">
        {depthControl}
        <p className="ob-multipv-provenance">
          {analysis.engine}, depth {analysis.lines[0]?.depth ?? depth}, multipv {analysis.multipv} — scores from White's perspective
        </p>
        {analysis.lines.length === 0 && <p className="ob-multipv-status">No lines returned.</p>}
        <LineButtons fen={fen} lines={analysis.lines} orientation={orientation} onPlayMove={onPlayMove} onAddReplies={onAddReplies} inTree={inTree} />
      </div>
    );
  }

  if (progress && progress.fen === fen && progress.depth === depth && progress.lines.length > 0) {
    const reachedDepth = Math.max(...progress.lines.map(l => l.depth));
    return (
      <div className="ob-multipv">
        {depthControl}
        <p className="ob-multipv-provenance">
          {engine.name}, depth {reachedDepth} of {depth}, multipv {MULTIPV} — analysing… — scores from White's perspective
        </p>
        <LineButtons fen={fen} lines={progress.lines} orientation={orientation} onPlayMove={onPlayMove} onAddReplies={onAddReplies} inTree={inTree} />
      </div>
    );
  }

  return (
    <div className="ob-multipv">
      {depthControl}
      <p className="ob-multipv-status">Analysing…</p>
    </div>
  );
}
