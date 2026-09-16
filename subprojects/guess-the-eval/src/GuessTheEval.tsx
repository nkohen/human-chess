// Guess the eval, endless mode: generate a self-play position, guess White's eval on a
// centipawn slider, lock in, reveal the real engine evaluation and top line. Every number
// shown comes from an Analysis returned by the engine, never invented (A1); every engine
// failure is shown as text, never swallowed.
// Design record: memory/subprojects/guess-the-eval.md. Minimal slice: memory/minimal-slices.md row 2.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type UciEngine } from '@human-chess/engine';
import { generateSelfPlayPosition, type SelfPlayPosition } from '@human-chess/positions';
import { inCheck, positionFromFen, sanLine, turn } from '@human-chess/rules';
import { band, describeBand, grade } from './scoring';
import './guess-the-eval.css';

export interface GuessTheEvalProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Phase = 'generating' | 'guessing' | 'evaluating' | 'revealed';

const RANDOM_PLIES = 6;
const ANALYSE_DEPTH = 14;

function formatPawns(cp: number): string {
  const pawns = cp / 100;
  const sign = pawns > 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

export function GuessTheEval({ engine }: GuessTheEvalProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [position, setPosition] = useState<SelfPlayPosition | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('generating');
  const [error, setError] = useState<string | undefined>(undefined);
  const [guessCp, setGuessCp] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | undefined>(undefined);
  const [tally, setTally] = useState({ sameBand: 0, total: 0 });
  const [generation, setGeneration] = useState(0);

  const next = useCallback(() => {
    setGeneration(g => g + 1);
    setPosition(undefined);
    setAnalysis(undefined);
    setError(undefined);
    setGuessCp(0);
    setPhase('generating');
  }, []);

  useEffect(() => {
    if (!readyEngine || phase !== 'generating') return;
    let cancelled = false;
    generateSelfPlayPosition(readyEngine, { randomPlies: RANDOM_PLIES })
      .then(pos => {
        if (cancelled) return;
        setPosition(pos);
        setPhase('guessing');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyEngine, phase, generation]);

  const lockIn = useCallback(() => {
    if (!readyEngine || !position) return;
    setPhase('evaluating');
  }, [readyEngine, position]);

  // The actual engine call for a locked-in guess, as an effect (not inline in `lockIn`) so that
  // leaving this phase early — the component unmounting, or a future revision that lets the
  // player back out — has a cleanup that stops the superseded search rather than leaving it to
  // finish unobserved.
  useEffect(() => {
    if (!readyEngine || !position || phase !== 'evaluating') return;
    let cancelled = false;
    readyEngine
      .analyse(position.fen, [], { depth: ANALYSE_DEPTH })
      .then(a => {
        if (cancelled) return;
        const line = a.lines[0];
        if (!line) {
          setError(`${a.engine} returned no evaluation line for this position`);
          setPhase('guessing');
          return;
        }
        setAnalysis(a);
        setPhase('revealed');
        const sideToMove = turn(positionFromFen(position.fen));
        const truth = whitePerspective(line.score, sideToMove);
        const { sameBand } = grade(guessCp, truth);
        setTally(t => ({ sameBand: t.sameBand + (sameBand ? 1 : 0), total: t.total + 1 }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase('guessing');
      });
    return () => {
      cancelled = true;
      readyEngine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyEngine, position, phase]);

  const pos = useMemo(() => (position ? positionFromFen(position.fen) : undefined), [position]);
  const line = analysis?.lines[0];
  const truth = line && pos ? whitePerspective(line.score, turn(pos)) : undefined;
  const gradeResult = truth ? grade(guessCp, truth) : undefined;
  const topLineSan = useMemo((): { san: string } | { error: string } | undefined => {
    if (!pos || !line) return undefined;
    try {
      return { san: sanLine(pos, line.pv).join(' ') };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, [pos, line]);

  if (engine instanceof Error) {
    return (
      <div className="gte">
        <p className="gte-status">The engine could not be loaded: {engine.message}</p>
      </div>
    );
  }
  if (!engine) {
    return (
      <div className="gte">
        <p className="gte-status">Loading the engine…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="gte">
        <p className="gte-status">The engine failed: {error}</p>
        <button onClick={next}>Try again</button>
      </div>
    );
  }
  if (!position || !pos) {
    return (
      <div className="gte">
        <p className="gte-status">Generating a position…</p>
      </div>
    );
  }

  return (
    <div className="gte">
      <h2>Guess the eval</h2>
      <Board
        fen={position.fen}
        orientation="white"
        turnColor={turn(pos)}
        dests={new Map()}
        movableColor={undefined}
        check={inCheck(pos)}
        onMove={() => undefined}
      />
      <p className="gte-source">Position source: engine self-play, {RANDOM_PLIES} random opening plies.</p>

      {phase !== 'revealed' && (
        <div className="gte-guess">
          <label htmlFor="gte-slider">
            Your guess, White's perspective: <strong>{formatPawns(guessCp)}</strong>
          </label>
          <input
            id="gte-slider"
            type="range"
            min={-1000}
            max={1000}
            step={10}
            value={guessCp}
            disabled={phase === 'evaluating'}
            onChange={e => setGuessCp(Number(e.target.value))}
          />
          <button onClick={lockIn} disabled={phase === 'evaluating'}>
            {phase === 'evaluating' ? 'Evaluating…' : 'Lock in'}
          </button>
        </div>
      )}

      {phase === 'revealed' && truth && gradeResult && (
        <div className="gte-reveal">
          <p>
            Engine evaluation, White's perspective: <strong>{formatScore(truth)}</strong>{' '}
            <span className="gte-provenance">({analysis?.engine}, depth {line?.depth})</span>
          </p>
          <p>{describeBand(band(truth))}.</p>
          <p>
            Your guess of {formatPawns(guessCp)} was {gradeResult.sameBand ? 'in the same band.' : 'in a different band.'}
          </p>
          {gradeResult.distanceCp !== undefined && <p>Distance from the truth: {(gradeResult.distanceCp / 100).toFixed(2)} pawns.</p>}
          <p>
            Top line:{' '}
            {topLineSan && 'san' in topLineSan ? topLineSan.san : `${line?.pv.join(' ')} (SAN unavailable: ${topLineSan?.error ?? 'no line'})`}
          </p>
          <p className="gte-tally">
            Same band: {tally.sameBand} of {tally.total}
          </p>
          <button onClick={next}>Next position</button>
        </div>
      )}
    </div>
  );
}
