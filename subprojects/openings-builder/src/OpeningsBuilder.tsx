// Top level: pick/create/delete an opening, persisted to localStorage, and switch between the
// Build tab (interactive building with the multi-line engine) and the Drill tab (practice
// against the tree). Priorities per memory/subprojects/openings-builder-trainer.md: interactive
// building first, drilling third.
import { useEffect, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import type { Color, SquareName } from '@human-chess/rules';
import { Board } from '@human-chess/board';
import { Button, Field, SegmentedControl, Status, Workbench } from '@human-chess/ui';
import { BuilderView } from './BuilderView';
import { DrillView } from './DrillView';
import { createOpening, START_FEN, type Opening } from './repertoire';
import { loadRepertoire, saveRepertoire } from './storage';
import './openings-builder.css';

export interface OpeningsBuilderProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Mode = 'build' | 'drill';

const NO_DESTS = new Map<SquareName, SquareName[]>();

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

  // Shared between build mode (rendered as `primary`, top of the right panel) and drill mode
  // (rendered as `aside`, above the move list — drill's own primary is the drill prompt).
  const controls = (
    <div className="ob-controls">
      <Field label="Opening" htmlFor="ob-opening-select">
        <select id="ob-opening-select" value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value || undefined)}>
          <option value="">Choose an opening…</option>
          {openings.map(o => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.color})
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <Button variant="secondary" onClick={remove}>
          Delete
        </Button>
      )}
      <Field label="New opening name" htmlFor="ob-new-name">
        <input id="ob-new-name" type="text" placeholder="New opening name" value={newName} onChange={e => setNewName(e.target.value)} />
      </Field>
      <Field label="Colour">
        <SegmentedControl
          ariaLabel="New opening colour"
          options={[
            { value: 'white', label: 'White' },
            { value: 'black', label: 'Black' },
          ]}
          value={newColor}
          onChange={setNewColor}
        />
      </Field>
      <Button variant={selected ? 'secondary' : 'primary'} onClick={create} disabled={!newName.trim()}>
        Create
      </Button>
      {selected && (
        <Field label="Mode">
          <SegmentedControl
            ariaLabel="Build or drill"
            options={[
              { value: 'build', label: 'Build' },
              { value: 'drill', label: 'Drill' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </Field>
      )}
    </div>
  );

  const engineStatus = engine instanceof Error ? <Status kind="error">The engine could not be loaded: {engine.message}</Status> : undefined;

  if (selected && mode === 'build') {
    return <BuilderView opening={selected} onOpeningChange={updateOpening} engine={readyEngine} controls={controls} status={engineStatus} />;
  }
  if (selected && mode === 'drill') {
    return <DrillView opening={selected} controls={controls} status={engineStatus} />;
  }

  return (
    <Workbench
      title="Openings builder"
      status={engineStatus}
      primary={controls}
      board={sizePx => (
        <Board
          fen={START_FEN}
          orientation="white"
          turnColor="white"
          dests={NO_DESTS}
          movableColor={undefined}
          check={false}
          onMove={() => {}}
          size={`${sizePx}px`}
        />
      )}
    >
      <Status kind="info">Pick or create an opening to get started.</Status>
    </Workbench>
  );
}
