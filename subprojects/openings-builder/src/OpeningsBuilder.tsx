// Top level: pick/create/delete an opening, persisted to localStorage, and switch between the
// Build tab (interactive building with the multi-line engine) and the Drill tab (practice
// against the tree). Priorities per memory/subprojects/openings-builder-trainer.md: interactive
// building first, drilling third.
import { useEffect, useMemo, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import type { Color, SquareName } from '@human-chess/rules';
import { Board } from '@human-chess/board';
import { Button, Field, SegmentedControl, Status, usePersistedState, Workbench } from '@human-chess/ui';
import { BuilderView } from './BuilderView';
import { DrillView } from './DrillView';
import { GamesTreeView } from './GamesTreeView';
import { BUILDER_STATE_KEY, parseBuilderState, type BuilderStateSnapshot, type Mode } from './persistence';
import { addMove, childrenOf, createOpening, START_FEN, type Opening } from './repertoire';
import { loadDrillScope, loadRepertoire, saveDrillScope, saveRepertoire, type DrillScope } from './storage';
import './openings-builder.css';

export interface OpeningsBuilderProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

const NO_DESTS = new Map<SquareName, SquareName[]>();

export function OpeningsBuilder({ engine }: OpeningsBuilderProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [openings, setOpenings] = useState<Opening[]>(() => loadRepertoire());
  // Picked opening, mode, the "several" drill-scope checkboxes, and the new-opening draft — one
  // snapshot so a reload restores the whole picker at once rather than pieces that could
  // disagree with each other (e.g. a 'several' selection surviving without the opening it was
  // seeded from). `selectedId` is re-validated against `openings` below (an id can outlive the
  // opening it named, e.g. deleted in another tab); `severalIds` used to be a fresh decision
  // each session, but the reload rule (docs/design/2026-09-18-reload-survival.md) now covers it
  // too.
  const [builderState, setBuilderState] = usePersistedState<BuilderStateSnapshot>(
    BUILDER_STATE_KEY,
    () => ({ selectedId: openings[0]?.id ?? null, mode: 'build', severalIds: [], newName: '', newColor: 'white' }),
    { parse: parseBuilderState },
  );
  const [drillScope, setDrillScope] = useState<DrillScope>(() => loadDrillScope());

  useEffect(() => saveRepertoire(openings), [openings]);
  useEffect(() => saveDrillScope(drillScope), [drillScope]);

  // A selectedId that no longer names a loaded opening (deleted since the snapshot was saved)
  // falls back to the first opening, same as a fresh session always has — "compare during
  // render, reset if changed", so the very next render already has a valid id instead of one
  // extra render showing nothing selected. severalIds gets the same treatment (an id it named
  // can be just as stale as selectedId), and the picker's own colour invariant — 'several'
  // always has at least one checked id of the current opening's colour, same as the select's
  // onChange keeps below — is restored the same way the picker restores it: reseed to just the
  // fallback opening when nothing of its colour survived.
  if (builderState.selectedId !== null && !openings.some(o => o.id === builderState.selectedId)) {
    setBuilderState(prev => {
      const fallback = openings[0];
      const survivingSeveralIds = prev.severalIds.filter(id => openings.some(o => o.id === id));
      const severalIds =
        fallback && drillScope === 'several' && !survivingSeveralIds.some(id => openings.find(o => o.id === id)?.color === fallback.color)
          ? [fallback.id]
          : survivingSeveralIds;
      return { ...prev, selectedId: fallback?.id ?? null, severalIds };
    });
  }

  const selectedId = builderState.selectedId ?? undefined;
  const mode = builderState.mode;
  const newName = builderState.newName;
  const newColor = builderState.newColor;
  const severalIds = useMemo(() => new Set(builderState.severalIds), [builderState.severalIds]);

  const setSelectedId = (id: string | undefined): void => setBuilderState(prev => ({ ...prev, selectedId: id ?? null }));
  const setMode = (next: Mode): void => setBuilderState(prev => ({ ...prev, mode: next }));
  const setNewName = (next: string): void => setBuilderState(prev => ({ ...prev, newName: next }));
  const setNewColor = (next: Color): void => setBuilderState(prev => ({ ...prev, newColor: next }));
  const setSeveralIds = (next: Set<string> | ((prev: Set<string>) => Set<string>)): void =>
    setBuilderState(prev => {
      const nextSet = typeof next === 'function' ? next(new Set(prev.severalIds)) : next;
      return { ...prev, severalIds: [...nextSet] };
    });

  const selected = openings.find(o => o.id === selectedId);

  // The same-colour siblings the 'several'/'all' drill scopes offer, and the openings actually
  // drilled for the current scope choice — recomputed only when its real inputs change, so
  // DrillView's opponent-move effect (keyed on this array) doesn't see a "new" list every render
  // (see DrillView.tsx's `live` comment).
  const sameColorOpenings = useMemo(() => (selected ? openings.filter(o => o.color === selected.color) : []), [openings, selected]);
  const drillOpenings = useMemo(() => {
    if (!selected) return [];
    if (drillScope === 'all') return sameColorOpenings;
    if (drillScope === 'several') {
      const picked = sameColorOpenings.filter(o => severalIds.has(o.id));
      // An empty checkbox list would drill nothing; fall back to just the picker's current
      // opening rather than showing an empty drill (a first guess — not spec'd either way).
      return picked.length > 0 ? picked : [selected];
    }
    return [selected];
  }, [selected, drillScope, sameColorOpenings, severalIds]);

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
        <select
          id="ob-opening-select"
          value={selectedId ?? ''}
          onChange={e => {
            const id = e.target.value || undefined;
            // The 'several' checkbox list is filtered to the picker's colour, so switching to an
            // opening of the other colour can leave it with nothing checked while the drill falls
            // back to `[selected]`; reseed with the new opening so the list and the drill agree.
            const next = openings.find(o => o.id === id);
            if (next && drillScope === 'several' && !openings.some(o => o.color === next.color && severalIds.has(o.id))) {
              setSeveralIds(new Set([next.id]));
            }
            setSelectedId(id);
          }}
        >
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
      {/* Not gated on `selected`: "Your games" (diagnosis over played games) is useful before
       * any opening exists yet, unlike Build/Drill which need one to act on. Ideally Build and
       * Drill would be disabled (not hidden) when no opening is selected, but `SegmentedControl`
       * / `SegmentedControlOption` (packages/ui/src/components.tsx) has no per-option `disabled`
       * field today — only a whole-control one — so that's left for a follow-up to the shared
       * primitive rather than a one-off workaround here (reviewer, M6). Build/Drill already
       * render their own "select or create an opening" prompt when clicked with none selected. */}
      <Field label="Mode">
        <SegmentedControl
          ariaLabel="Build, drill, or your games"
          options={[
            { value: 'build', label: 'Build' },
            { value: 'drill', label: 'Drill' },
            { value: 'games', label: 'Your games' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </Field>
      {selected && mode === 'drill' && (
        <Field label="Drill scope">
          <SegmentedControl
            ariaLabel="Drill scope"
            options={[
              { value: 'one', label: 'This opening' },
              { value: 'several', label: 'Several' },
              { value: 'all', label: `All (${selected.color})` },
            ]}
            value={drillScope}
            onChange={scope => {
              // Seed the checkbox list with the current opening when 'several' is picked and
              // nothing of this colour is checked yet, so it never starts empty; the user can
              // uncheck it afterwards.
              if (scope === 'several' && !sameColorOpenings.some(o => severalIds.has(o.id))) setSeveralIds(new Set([selected.id]));
              setDrillScope(scope);
            }}
          />
        </Field>
      )}
      {selected && mode === 'drill' && drillScope === 'several' && (
        <fieldset className="ob-drill-several">
          <legend>Openings to drill ({selected.color})</legend>
          {sameColorOpenings.map(o => (
            <label key={o.id}>
              <input
                type="checkbox"
                checked={severalIds.has(o.id)}
                onChange={e =>
                  setSeveralIds(prev => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(o.id);
                    else next.delete(o.id);
                    return next;
                  })
                }
              />
              {o.name}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );

  const engineStatus = engine instanceof Error ? <Status kind="error">The engine could not be loaded: {engine.message}</Status> : undefined;

  if (selected && mode === 'build') {
    return <BuilderView opening={selected} onOpeningChange={updateOpening} engine={readyEngine} controls={controls} status={engineStatus} />;
  }
  if (selected && mode === 'drill') {
    return <DrillView openings={drillOpenings} controls={controls} status={engineStatus} />;
  }
  if (mode === 'games') {
    // "Add to <opening>" only when the selected opening's own colour matches the tree being
    // viewed — GamesTreeView itself checks that (it owns the colour picker). GamesTreeView
    // hands back a whole line of ucis (from the opening's own root), not a single (epd, uci)
    // pair: its EPDs live in the games tree, not necessarily a node `selected` has ever reached,
    // and addMove now throws on an unknown fromEpd (repertoire.ts, B2) rather than silently
    // creating an orphan node. So this walks `selected`'s own tree from its root, adding each
    // move of the line in turn — each addMove call is idempotent, and each one's own `to` EPD
    // (read back via childrenOf, not re-derived) is guaranteed to exist by the time the next
    // move needs it as its fromEpd.
    const targetOpening = selected
      ? {
          name: selected.name,
          color: selected.color,
          addLine: (ucis: string[]): void => {
            let opening = selected;
            let fromEpd = selected.root;
            for (const uci of ucis) {
              opening = addMove(opening, fromEpd, uci);
              const edge = childrenOf(opening, fromEpd).find(m => m.uci === uci);
              if (!edge) break; // addMove always adds (or already has) this exact edge
              fromEpd = edge.to;
            }
            updateOpening(opening);
          },
        }
      : undefined;
    return <GamesTreeView controls={controls} status={engineStatus} targetOpening={targetOpening} />;
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
