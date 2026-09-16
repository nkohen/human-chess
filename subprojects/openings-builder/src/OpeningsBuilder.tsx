// Top level: pick/create/delete an opening, persisted to localStorage, and switch between the
// Build tab (interactive building with the multi-line engine) and the Drill tab (practice
// against the tree). Priorities per memory/subprojects/openings-builder-trainer.md: interactive
// building first, drilling third.
import { useEffect, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import type { Color } from '@human-chess/rules';
import { BuilderView } from './BuilderView';
import { DrillView } from './DrillView';
import { createOpening, type Opening } from './repertoire';
import { loadRepertoire, saveRepertoire } from './storage';
import './openings-builder.css';

export interface OpeningsBuilderProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Mode = 'build' | 'drill';

export function OpeningsBuilder({ engine }: OpeningsBuilderProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [openings, setOpenings] = useState<Opening[]>(() => loadRepertoire());
  const [selectedId, setSelectedId] = useState<string | undefined>(() => openings[0]?.id);
  const [mode, setMode] = useState<Mode>('build');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<Color>('white');

  useEffect(() => saveRepertoire(openings), [openings]);

  const selected = openings.find(o => o.id === selectedId);

  const updateOpening = (updated: Opening): void => {
    setOpenings(prev => prev.map(o => (o.id === updated.id ? updated : o)));
  };

  const create = (): void => {
    const name = newName.trim();
    if (!name) return;
    const opening = createOpening(name, newColor);
    setOpenings(prev => [...prev, opening]);
    setSelectedId(opening.id);
    setNewName('');
    setMode('build');
  };

  const remove = (): void => {
    if (!selected) return;
    const ok = typeof confirm === 'function' ? confirm(`Delete "${selected.name}"? This cannot be undone.`) : true;
    if (!ok) return;
    setOpenings(prev => prev.filter(o => o.id !== selected.id));
    setSelectedId(undefined);
  };

  return (
    <div className="ob">
      <header className="ob-header">
        <h2>Openings builder</h2>
        <div className="ob-picker">
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value || undefined)}
            aria-label="Choose an opening"
          >
            <option value="">Choose an opening…</option>
            {openings.map(o => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.color})
              </option>
            ))}
          </select>
          {selected && <button onClick={remove}>Delete</button>}
        </div>
        <div className="ob-new">
          <input
            type="text"
            placeholder="New opening name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <select value={newColor} onChange={e => setNewColor(e.target.value as Color)}>
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
          <button onClick={create} disabled={!newName.trim()}>
            Create
          </button>
        </div>
        {selected && (
          <div className="ob-mode" role="tablist">
            <button role="tab" aria-selected={mode === 'build'} className={mode === 'build' ? 'current' : ''} onClick={() => setMode('build')}>
              Build
            </button>
            <button role="tab" aria-selected={mode === 'drill'} className={mode === 'drill' ? 'current' : ''} onClick={() => setMode('drill')}>
              Drill
            </button>
          </div>
        )}
      </header>

      {engine instanceof Error && <p className="ob-multipv-status">The engine could not be loaded: {engine.message}</p>}
      {!selected && <p className="ob-multipv-status">Pick or create an opening to get started.</p>}
      {selected && mode === 'build' && <BuilderView opening={selected} onOpeningChange={updateOpening} engine={readyEngine} />}
      {selected && mode === 'drill' && <DrillView opening={selected} />}
    </div>
  );
}
