// Top-level visualization-trainer route: a mode switch over the two modes described in
// memory/subprojects/visualization-trainer.md ("Lines", the original exercise-and-question
// trainer now in LinesTrainer.tsx, and "Memorize", the timed position-memorizer in
// MemorizeTrainer.tsx). The switch's own state is the only thing owned here; each mode owns
// everything about how it looks and behaves. Last mode is remembered per browser (mode.ts).
import { useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { SegmentedControl } from '@human-chess/ui';
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

export function VisualizationTrainer({ engine }: VisualizationTrainerProps): React.JSX.Element {
  const [mode, setMode] = useState<TrainerMode>(loadTrainerMode);

  const changeMode = (next: TrainerMode): void => {
    setMode(next);
    saveTrainerMode(next);
  };

  return (
    <div className="viz-page">
      <div className="viz-mode-bar">
        <SegmentedControl ariaLabel="Visualization trainer mode" options={MODE_OPTIONS} value={mode} onChange={changeMode} />
      </div>
      <div className="viz-mode-content">{mode === 'lines' ? <LinesTrainer engine={engine} /> : <MemorizeTrainer />}</div>
    </div>
  );
}
