// The eval scale, shown after a reveal in place of the guess slider (same width): a
// -1000..+1000 cp bar coloured by scoring.ts's seven bands, with two markers — the guess and
// the engine's real answer, both White's perspective. A mate truth is pinned to the scale's end
// for its side and labelled with the real mate score via formatScore; the scale never shows a
// mate as a cp number (the ±1000 clamp used elsewhere for GeoGuessr-style points, in scoring.ts,
// is a scoring convention, not an evaluation, and stays out of this display).
import { formatPawns, formatScore, type Score } from '@human-chess/engine';
import { BAND_CLEAR_CP, BAND_DOMINATING_CP, BAND_SLIGHT_CP, BAND_WINNING_CP, clampCp, mateSide, SLIDER_MAX_CP, SLIDER_MIN_CP } from './scoring';

interface Segment {
  from: number;
  to: number;
  className: string;
  label: string;
}

// The scale spans SLIDER_MIN_CP..SLIDER_MAX_CP (±1000); with BAND_DOMINATING_CP at 500 the two
// outer "dominating" segments are the outer 500cp on each side.
export const SEGMENTS: Segment[] = [
  { from: SLIDER_MIN_CP, to: -BAND_DOMINATING_CP, className: 'gte-seg-black-dominating', label: 'Black dominating' },
  { from: -BAND_DOMINATING_CP, to: -BAND_WINNING_CP, className: 'gte-seg-black-winning', label: 'Black winning' },
  { from: -BAND_WINNING_CP, to: -BAND_CLEAR_CP, className: 'gte-seg-black-clear', label: 'Black clearly better' },
  { from: -BAND_CLEAR_CP, to: -BAND_SLIGHT_CP, className: 'gte-seg-black-slight', label: 'Black slightly better' },
  { from: -BAND_SLIGHT_CP, to: BAND_SLIGHT_CP, className: 'gte-seg-equal', label: 'Equal' },
  { from: BAND_SLIGHT_CP, to: BAND_CLEAR_CP, className: 'gte-seg-white-slight', label: 'White slightly better' },
  { from: BAND_CLEAR_CP, to: BAND_WINNING_CP, className: 'gte-seg-white-clear', label: 'White clearly better' },
  { from: BAND_WINNING_CP, to: BAND_DOMINATING_CP, className: 'gte-seg-white-winning', label: 'White winning' },
  { from: BAND_DOMINATING_CP, to: SLIDER_MAX_CP, className: 'gte-seg-white-dominating', label: 'White dominating' },
];

const RANGE_CP = SLIDER_MAX_CP - SLIDER_MIN_CP;

function pct(cp: number): number {
  return ((clampCp(cp) - SLIDER_MIN_CP) / RANGE_CP) * 100;
}

export interface EvalScaleProps {
  /** White's perspective, cp. */
  guessCp: number;
  /** White's perspective. */
  truth: Score;
  /** Short (~10px) with no legend and no marker text labels — just the coloured bands and the
   * marker ticks. Used for the per-round rows on the summary screen (item 5, user feedback
   * 2026-09-16), where the eval/guess values are printed as text alongside the row instead. */
  compact?: boolean;
  /** Prefix for the primary guess marker's label, e.g. a PvP player's name. Defaults to "Guess". */
  guessLabel?: string;
  /** A second marker (PvP's reveal: the other player's guess) in a distinct colour, so the two
   * guesses and the truth are never confused with each other. */
  secondGuess?: { cp: number; label: string };
}

export function EvalScale({ guessCp, truth, compact = false, guessLabel = 'Guess', secondGuess }: EvalScaleProps): React.JSX.Element {
  const truthPct = truth.type === 'mate' ? (mateSide(truth) === 'white' ? 100 : 0) : pct(truth.value);
  const guessPct = pct(guessCp);
  const secondGuessPct = secondGuess ? pct(secondGuess.cp) : undefined;

  return (
    <div className={`gte-scale${compact ? ' gte-scale-compact' : ''}${secondGuess && !compact ? ' gte-scale-dual' : ''}`}>
      <div className="gte-scale-bar">
        {SEGMENTS.map(seg => (
          <div
            key={seg.className}
            className={`gte-scale-seg ${seg.className}`}
            style={{ flexBasis: `${((seg.to - seg.from) / RANGE_CP) * 100}%` }}
            title={seg.label}
          />
        ))}
        <div className="gte-scale-marker gte-scale-marker-guess" style={{ left: `${guessPct}%` }}>
          {!compact && (
            <span className="gte-scale-marker-label">
              {guessLabel} {formatPawns(guessCp)}
            </span>
          )}
        </div>
        {secondGuess && (
          <div className="gte-scale-marker gte-scale-marker-guess2" style={{ left: `${secondGuessPct}%` }}>
            {!compact && (
              <span className="gte-scale-marker-label">
                {secondGuess.label} {formatPawns(secondGuess.cp)}
              </span>
            )}
          </div>
        )}
        <div className="gte-scale-marker gte-scale-marker-truth" style={{ left: `${truthPct}%` }}>
          {!compact && <span className="gte-scale-marker-label">{formatScore(truth)}</span>}
        </div>
      </div>
      {!compact && (
        <div className="gte-scale-legend">
          {SEGMENTS.map(seg => (
            <span key={seg.className} className="gte-scale-legend-item">
              <span className={`gte-scale-swatch ${seg.className}`} /> {seg.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
