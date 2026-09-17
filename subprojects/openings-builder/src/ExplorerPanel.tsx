// The lichess opening explorer, shown below the MultiPV panel on the opponent's turn: "what do
// real opponents at this rating actually play" alongside the engine's "what's objectively best"
// (memory/subprojects/openings-builder-trainer.md). Every number here comes straight from
// ExplorerResult (A1/V3) — nothing here computes or guesses a frequency itself.
import { useEffect, useState } from 'react';
import { LichessLoginRequired, LichessRateLimited, EXPLORER_RATING_BUCKETS, explorerMoves, ratingBucketsBetween, type ExplorerResult } from '@human-chess/lichess';
import { LichessLogin, useLichessSession } from '@human-chess/lichess/react';
import { Button, Field, Status } from '@human-chess/ui';
import { loadExplorerBand, saveExplorerBand, type ExplorerBand } from './storage';

export interface ExplorerPanelProps {
  fen: string;
  /** Adds the given UCIs to the tree at this position, same shape as MultiPvPanel's
   * onAddReplies — BuilderView passes its existing addReplies callback here. */
  onAddMoves: (ucis: string[]) => void;
}

const EXPLORER_SPEEDS = ['blitz', 'rapid', 'classical'];
// First guess at a "worth adding by default" threshold — not derived from any study; the
// button's own label says so.
const ADD_THRESHOLD_SHARE = 0.05;

function wdlPercents(m: { white: number; draws: number; black: number; total: number }): { white: number; draws: number; black: number } {
  if (m.total <= 0) return { white: 0, draws: 0, black: 0 };
  return {
    white: (m.white / m.total) * 100,
    draws: (m.draws / m.total) * 100,
    black: (m.black / m.total) * 100,
  };
}

/** The bar's hover text: the three percentages, and how many games they come from. */
function wdlTitle(pct: { white: number; draws: number; black: number }, total: number): string {
  return `White wins ${pct.white.toFixed(1)}% · Draw ${pct.draws.toFixed(1)}% · Black wins ${pct.black.toFixed(1)}% (${total.toLocaleString()} games)`;
}

export function ExplorerPanel({ fen, onAddMoves }: ExplorerPanelProps): React.JSX.Element {
  const { session } = useLichessSession();
  // The effect keys on the token string: currentLichessSession() builds a fresh object on every
  // read, so depending on `session` itself would abort and refetch on every auth notification.
  const token = session?.accessToken;
  const [band, setBand] = useState<ExplorerBand>(() => loadExplorerBand());
  const [result, setResult] = useState<ExplorerResult | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    saveExplorerBand(band);
  }, [band]);

  useEffect(() => {
    setResult(undefined);
    setError(undefined);
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    explorerMoves(fen, { ratings: ratingBucketsBetween(band.min, band.max), speeds: EXPLORER_SPEEDS, signal: controller.signal })
      .then(r => {
        setResult(r);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        setError(err instanceof LichessRateLimited || err instanceof LichessLoginRequired || err instanceof Error ? err.message : String(err));
      });
    return () => controller.abort();
  }, [fen, band.min, band.max, token]);

  if (!session) {
    return (
      <div className="ob-explorer">
        <Status kind="info">Log in with lichess to see what opponents at your rating actually play</Status>
        <LichessLogin />
      </div>
    );
  }

  const aboveThreshold = result ? result.moves.filter(m => m.share >= ADD_THRESHOLD_SHARE).map(m => m.uci) : [];

  return (
    <div className="ob-explorer">
      <div className="ob-explorer-band">
        <Field label="Rating from" htmlFor="ob-explorer-min">
          <select id="ob-explorer-min" value={band.min} onChange={e => setBand(b => ({ ...b, min: Number(e.target.value) }))}>
            {EXPLORER_RATING_BUCKETS.filter(r => r <= band.max).map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="to" htmlFor="ob-explorer-max">
          <select id="ob-explorer-max" value={band.max} onChange={e => setBand(b => ({ ...b, max: Number(e.target.value) }))}>
            {EXPLORER_RATING_BUCKETS.filter(r => r >= band.min).map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {loading && <Status kind="busy">Looking up opponent replies…</Status>}
      {error && <Status kind="error">{error}</Status>}

      {result && (
        <>
          <p className="ob-explorer-provenance">{result.provenance}</p>
          {result.moves.length === 0 ? (
            <Status kind="info">No games found at this rating band.</Status>
          ) : (
            <ul className="ob-explorer-moves">
              {result.moves.map(m => {
                const pct = wdlPercents(m);
                return (
                  <li key={m.uci}>
                    <Button variant="secondary" className="ob-explorer-move-button" onClick={() => onAddMoves([m.uci])}>
                      {m.san} — {(m.share * 100).toFixed(1)}%
                    </Button>
                    <span className="ob-explorer-wdl" title={wdlTitle(pct, m.total)}>
                      <span className="ob-explorer-wdl-white" style={{ width: `${pct.white}%` }} title={`White wins ${pct.white.toFixed(1)}%`} />
                      <span className="ob-explorer-wdl-draw" style={{ width: `${pct.draws}%` }} title={`Draw ${pct.draws.toFixed(1)}%`} />
                      <span className="ob-explorer-wdl-black" style={{ width: `${pct.black}%` }} title={`Black wins ${pct.black.toFixed(1)}%`} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {aboveThreshold.length > 0 && (
            <Button variant="secondary" size="sm" className="ob-explorer-add-threshold" onClick={() => onAddMoves(aboveThreshold)}>
              Add replies played ≥ {ADD_THRESHOLD_SHARE * 100}% (first guess) to the tree
            </Button>
          )}
        </>
      )}
    </div>
  );
}
