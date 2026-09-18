// The visible half of a timed guess: a plain-text "Ns left" plus a thin bar, both tokens-only
// (no new colour literals beyond the "running low" warning, which reuses --hc-danger). Purely
// presentational — useCountdown.ts is the one source of `remainingMs`, a real wall-clock
// measurement.
import { cx } from '@human-chess/ui';
import { secondsLeft } from './timing';

export interface CountdownProps {
  remainingMs: number;
  limitMs: number;
  className?: string;
}

// Below this many seconds the bar and text switch to the danger colour, same threshold either
// player's clock uses.
const LOW_SECONDS = 5;

export function Countdown({ remainingMs, limitMs, className }: CountdownProps): React.JSX.Element {
  const seconds = secondsLeft(remainingMs, limitMs);
  const pct = limitMs > 0 ? (Math.max(0, Math.min(limitMs, remainingMs)) / limitMs) * 100 : 0;
  const low = seconds <= LOW_SECONDS;
  return (
    <div className={cx('gte-countdown', low && 'gte-countdown--low', className)} role="status">
      <span className="gte-countdown-text">{seconds}s left</span>
      <div className="gte-countdown-bar">
        <div className="gte-countdown-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
