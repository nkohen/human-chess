// Guess the eval's entry point: a settings screen (mode, time limit, PvP player names) before
// every round, then hands off to SoloRound or PvpRound for the round itself. Splitting the
// settings screen out like this (rather than folding the choice into SoloRound as it was before
// the 2026-09-17 PvP/timer slice) is what lets "a setting before a round" (item 1 of that slice)
// be a real `Page`, not another state bolted onto the board-screen `Workbench` — the two layouts
// have different rules (docs/design/2026-09-17-ui.md) and a setup screen belongs in the one that
// is allowed to scroll.
// Design record: memory/subprojects/guess-the-eval.md.
//
// Reload survival (docs/design/2026-09-18-reload-survival.md): `screen` and `mode` are the one
// piece of top-level progress (limits and PvP names were already persisted, in storage.ts, kept
// as they were). A reload while `screen` is 'solo'/'pvp' lands straight back on the round in
// progress — SoloRound/PvpRound each restore the rest of it from their own persisted key. A
// deliberate "Start round" click, though, always begins a *fresh* round (its pre-persistence
// behaviour, since the target screen used to fully unmount/remount on every visit): it clears
// that mode's leftover snapshot before switching, so reload-resume never leaks into an explicit
// restart.
import { useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { Button, clearPersisted, Field, Page, SegmentedControl, usePersistedState } from '@human-chess/ui';
import { PvpRound } from './PvpRound';
import { SoloRound } from './SoloRound';
import { freshTopSnapshot, GTE_PVP_KEY, GTE_SOLO_KEY, GTE_TOP_KEY, parseTopSnapshot, type GteMode } from './snapshot';
import { DEFAULT_PLAYER1_NAME, DEFAULT_PLAYER2_NAME, loadPlayerNames, loadPveTimeLimit, loadPvpTimeLimit, savePlayerNames, savePveTimeLimit, savePvpTimeLimit, type PlayerNames } from './storage';
import { PVE_TIME_LIMITS, PVP_TIME_LIMITS, type PveTimeLimit, type TimeLimitSec } from './timing';

export interface GuessTheEvalProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

function pveTimeLimitLabel(limit: PveTimeLimit): string {
  return limit === 'none' ? 'None' : `${limit}s`;
}

export function GuessTheEval({ engine }: GuessTheEvalProps): React.JSX.Element {
  const [top, setTop] = usePersistedState(GTE_TOP_KEY, freshTopSnapshot, { parse: parseTopSnapshot });
  const { screen, mode } = top;
  const setMode = (next: GteMode): void => setTop(t => ({ ...t, mode: next }));
  const [pveLimit, setPveLimit] = useState<PveTimeLimit>(() => loadPveTimeLimit());
  const [pvpLimit, setPvpLimit] = useState<TimeLimitSec>(() => loadPvpTimeLimit());
  const [names, setNames] = useState<PlayerNames>(() => loadPlayerNames());

  const onExit = (): void => setTop(t => ({ ...t, screen: 'settings' }));

  const startRound = (): void => {
    // A fresh round, never a resumed one — see the reload-survival note above.
    clearPersisted(mode === 'solo' ? GTE_SOLO_KEY : GTE_PVP_KEY);
    setTop(t => ({ ...t, screen: mode }));
  };

  if (screen === 'solo') {
    return <SoloRound engine={engine} timeLimitSec={pveLimit === 'none' ? undefined : pveLimit} onExit={onExit} />;
  }
  if (screen === 'pvp') {
    return <PvpRound engine={engine} player1={names.player1.trim() || DEFAULT_PLAYER1_NAME} player2={names.player2.trim() || DEFAULT_PLAYER2_NAME} limitSec={pvpLimit} onExit={onExit} />;
  }

  const setPlayer1 = (value: string): void => {
    const next = { ...names, player1: value };
    setNames(next);
    savePlayerNames(next);
  };
  const setPlayer2 = (value: string): void => {
    const next = { ...names, player2: value };
    setNames(next);
    savePlayerNames(next);
  };

  return (
    <Page
      title="Guess the eval"
      intro="Guess a position's engine evaluation, then see what the engine actually says. Solo, or pass-and-play with a friend."
    >
      <Field label="Mode">
        <SegmentedControl
          options={[
            { value: 'solo', label: 'Solo' },
            { value: 'pvp', label: 'Pass-and-play PvP' },
          ]}
          value={mode}
          onChange={setMode}
          ariaLabel="Mode"
        />
      </Field>

      {mode === 'solo' ? (
        <Field label="Time limit per position" hint="When time runs out, your current slider position is locked in as your guess.">
          <SegmentedControl
            options={PVE_TIME_LIMITS.map(limit => ({ value: limit, label: pveTimeLimitLabel(limit) }))}
            value={pveLimit}
            onChange={limit => {
              setPveLimit(limit);
              savePveTimeLimit(limit);
            }}
            ariaLabel="Time limit per position"
          />
        </Field>
      ) : (
        <>
          <Field label="Player 1 name" htmlFor="gte-player1-name">
            <input id="gte-player1-name" type="text" value={names.player1} onChange={e => setPlayer1(e.target.value)} maxLength={24} />
          </Field>
          <Field label="Player 2 name" htmlFor="gte-player2-name">
            <input id="gte-player2-name" type="text" value={names.player2} onChange={e => setPlayer2(e.target.value)} maxLength={24} />
          </Field>
          <Field
            label="Time limit per position (each player)"
            hint="PvP is always timed. If player 1 finishes early, player 2's limit shrinks to player 1's time plus 10s."
          >
            <SegmentedControl
              options={PVP_TIME_LIMITS.map(limit => ({ value: limit, label: `${limit}s` }))}
              value={pvpLimit}
              onChange={limit => {
                setPvpLimit(limit);
                savePvpTimeLimit(limit);
              }}
              ariaLabel="Time limit per position"
            />
          </Field>
        </>
      )}

      <Button variant="primary" onClick={startRound}>
        Start round
      </Button>
    </Page>
  );
}
