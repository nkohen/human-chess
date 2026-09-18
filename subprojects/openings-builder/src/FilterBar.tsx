// Which of the loaded games feed the tree: @human-chess/opening-tree's own GameFilter (speed,
// rated, opponent rating/name, dates) plus which linked accounts are included at all (a
// different axis GameFilter doesn't cover — see treeHelpers.ts's YourGamesFilterState comment).
// A native <details> (collapsible everywhere, not just phones — docs/design/2026-09-17-ui.md
// section 7 prefers it) so the filter fields don't compete with the tree for vertical space when
// not in use.
import type { GameSpeed } from '@human-chess/import';
import type { GameSource } from '@human-chess/store';
import { Field, SegmentedControl, Status } from '@human-chess/ui';
import { formatSkippedBreakdown, sourceKey, type YourGamesFilterState } from './treeHelpers';

export interface FilterBarProps {
  filter: YourGamesFilterState;
  onChange: (next: YourGamesFilterState) => void;
  sources: GameSource[];
  matched: number;
  total: number;
  skipped: Record<string, number>;
}

const SPEED_OPTIONS: { value: GameSpeed; label: string }[] = [
  { value: 'ultraBullet', label: 'UltraBullet' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'classical', label: 'Classical' },
  { value: 'correspondence', label: 'Correspondence' },
];

const RATED_OPTIONS: { value: YourGamesFilterState['rated']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'rated', label: 'Rated' },
  { value: 'casual', label: 'Casual' },
];

export function FilterBar({ filter, onChange, sources, matched, total, skipped }: FilterBarProps): React.JSX.Element {
  const set = <K extends keyof YourGamesFilterState>(key: K, value: YourGamesFilterState[K]): void => {
    onChange({ ...filter, [key]: value });
  };

  const toggleSpeed = (speed: GameSpeed): void => {
    const has = filter.speeds.includes(speed);
    set('speeds', has ? filter.speeds.filter(s => s !== speed) : [...filter.speeds, speed]);
  };

  const toggleSource = (key: string): void => {
    const has = filter.sourceKeys.includes(key);
    set('sourceKeys', has ? filter.sourceKeys.filter(k => k !== key) : [...filter.sourceKeys, key]);
  };

  const activeCount =
    filter.speeds.length +
    (filter.rated !== 'all' ? 1 : 0) +
    (filter.opponentRatingMin !== undefined ? 1 : 0) +
    (filter.opponentRatingMax !== undefined ? 1 : 0) +
    (filter.opponent.trim() !== '' ? 1 : 0) +
    (filter.since !== '' ? 1 : 0) +
    (filter.until !== '' ? 1 : 0) +
    filter.sourceKeys.length;

  const skippedText = formatSkippedBreakdown(skipped);

  return (
    <div className="ob-filterbar">
      <details className="ob-filterbar-details">
        <summary>Filters{activeCount > 0 ? ` (${activeCount} active)` : ''}</summary>
        <div className="ob-filterbar-fields">
          <fieldset className="ob-filterbar-speeds">
            <legend>Speed (none = all)</legend>
            {SPEED_OPTIONS.map(opt => (
              <label key={opt.value}>
                <input type="checkbox" checked={filter.speeds.includes(opt.value)} onChange={() => toggleSpeed(opt.value)} />
                {opt.label}
              </label>
            ))}
          </fieldset>

          <Field label="Rated">
            <SegmentedControl ariaLabel="Rated filter" options={RATED_OPTIONS} value={filter.rated} onChange={v => set('rated', v)} />
          </Field>

          <Field label="Opponent rating min" htmlFor="ob-filter-rmin">
            <input
              id="ob-filter-rmin"
              type="number"
              value={filter.opponentRatingMin ?? ''}
              onChange={e => set('opponentRatingMin', e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="Opponent rating max" htmlFor="ob-filter-rmax">
            <input
              id="ob-filter-rmax"
              type="number"
              value={filter.opponentRatingMax ?? ''}
              onChange={e => set('opponentRatingMax', e.target.value === '' ? undefined : Number(e.target.value))}
            />
          </Field>
          <Field label="Opponent name" htmlFor="ob-filter-opponent">
            <input id="ob-filter-opponent" value={filter.opponent} onChange={e => set('opponent', e.target.value)} />
          </Field>
          <Field label="Since" htmlFor="ob-filter-since">
            <input id="ob-filter-since" type="date" value={filter.since} onChange={e => set('since', e.target.value)} />
          </Field>
          <Field label="Until" htmlFor="ob-filter-until" hint="End of the selected day, UTC.">
            <input id="ob-filter-until" type="date" value={filter.until} onChange={e => set('until', e.target.value)} />
          </Field>

          {(sources.length > 1 || filter.sourceKeys.length > 0) && (
            <fieldset className="ob-filterbar-sources">
              <legend>Accounts (none = all)</legend>
              {sources.map(s => {
                const key = sourceKey(s);
                return (
                  <label key={key}>
                    <input type="checkbox" checked={filter.sourceKeys.includes(key)} onChange={() => toggleSource(key)} />
                    {s.site} · {s.username}
                  </label>
                );
              })}
            </fieldset>
          )}
        </div>
      </details>
      <Status kind="info">
        {matched} of {total} games match.{skippedText ? ` Skipped: ${skippedText}.` : ''}
      </Status>
    </div>
  );
}
