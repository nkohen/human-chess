// Top-level visualization-trainer route: a mode switch over the two modes described in
// memory/subprojects/visualization-trainer.md ("Lines", the original exercise-and-question
// trainer now in LinesTrainer.tsx, and "Memorize", the timed position-memorizer in
// MemorizeTrainer.tsx). The switch's own state is the only thing owned here; each mode owns
// everything about how it looks and behaves. Last mode is remembered per browser (mode.ts).
import { useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { positionFromFen } from '@human-chess/rules';
import { consumeHandoffParams, SegmentedControl } from '@human-chess/ui';
import { LinesTrainer } from './LinesTrainer';
import { MemorizeTrainer } from './MemorizeTrainer';
import { loadTrainerMode, saveTrainerMode, type TrainerMode } from './mode';
import './visualization-trainer.css';

export interface VisualizationTrainerProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

const MODE_OPTIONS: { value: TrainerMode; label: string }[] = [
  { value: 'lines', label: 'Lines' },
  { value: 'memorize', label: 'Memorize' },
];

/** A position handed over by another tool (puzzles' "Memorize this position" sends
 * #/visualization?fen=...), or undefined. Validated through the rules library so a garbage hash
 * never reaches the memorizer; an invalid one is simply ignored (first guess: nothing to tell the
 * user, they just get the ordinary trainer). Read once, from the hash this route was entered on
 * (App.tsx keys the trainer on the full hash, so a new hand-off remounts it).
 *
 * Reload survival (docs/design/2026-09-18-reload-survival.md): `consumeHandoffParams`, not
 * `readHandoffParams` — it strips the hand-off's query string from the address bar as it reads
 * it, so a fresh hand-off wins over MemorizeTrainer's persisted session (below), and a reload
 * right after lands back on that persisted session instead of replaying the same hand-off. */
function handoffFen(): string | undefined {
  const fen = consumeHandoffParams(window.location.hash).get('fen');
  if (!fen) return undefined;
  try {
    positionFromFen(fen);
    return fen;
  } catch {
    return undefined;
  }
}

export function VisualizationTrainer({ engine }: VisualizationTrainerProps): React.JSX.Element {
  const [firstFen] = useState(handoffFen);
  // A handed-over position is only meaningful to Memorize, so it wins over the remembered mode.
  const [mode, setMode] = useState<TrainerMode>(() => (firstFen ? 'memorize' : loadTrainerMode()));

  const changeMode = (next: TrainerMode): void => {
    setMode(next);
    saveTrainerMode(next);
  };

  return (
    <div className="viz-page">
      <div className="viz-mode-bar">
        <SegmentedControl ariaLabel="Visualization trainer mode" options={MODE_OPTIONS} value={mode} onChange={changeMode} />
      </div>
      <div className="viz-mode-content">{mode === 'lines' ? <LinesTrainer engine={engine} /> : <MemorizeTrainer firstFen={firstFen} />}</div>
    </div>
  );
}
