// Guess the eval's entry point: a settings screen (mode, time limit, PvP player names) before
// every round, then hands off to SoloRound or PvpRound for the round itself. Splitting the
// settings screen out like this (rather than folding the choice into SoloRound as it was before
// the 2026-09-17 PvP/timer slice) is what lets "a setting before a round" (item 1 of that slice)
// be a real `Page`, not another state bolted onto the board-screen `Workbench` — the two layouts
// have different rules (docs/design/2026-09-17-ui.md) and a setup screen belongs in the one that
// is allowed to scroll.
// Design record: memory/subprojects/guess-the-eval.md.
import { useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { Button, Field, Page, SegmentedControl } from '@human-chess/ui';
import { PvpRound } from './PvpRound';
import { SoloRound } from './SoloRound';
import { DEFAULT_PLAYER1_NAME, DEFAULT_PLAYER2_NAME, loadPlayerNames, loadPveTimeLimit, loadPvpTimeLimit, savePlayerNames, savePveTimeLimit, savePvpTimeLimit, type PlayerNames } from './storage';
import { PVE_TIME_LIMITS, PVP_TIME_LIMITS, type PveTimeLimit, type TimeLimitSec } from './timing';

export interface GuessTheEvalProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

type Mode = 'solo' | 'pvp';
type Screen = 'settings' | Mode;

function pveTimeLimitLabel(limit: PveTimeLimit): string {
  return limit === 'none' ? 'None' : `${limit}s`;
}

export function GuessTheEval({ engine }: GuessTheEvalProps): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('settings');
  const [mode, setMode] = useState<Mode>('solo');
  const [pveLimit, setPveLimit] = useState<PveTimeLimit>(() => loadPveTimeLimit());
  const [pvpLimit, setPvpLimit] = useState<TimeLimitSec>(() => loadPvpTimeLimit());
  const [names, setNames] = useState<PlayerNames>(() => loadPlayerNames());

  const onExit = (): void => setScreen('settings');

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

      <Button variant="primary" onClick={() => setScreen(mode)}>
        Start round
      </Button>
    </Page>
  );
}
