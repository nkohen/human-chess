// Opening training game: play a fixed number N of moves each side from the start position
// against a rating-limited engine opponent, then let the engine's own evaluation of the final
// position say who stood better (A1: the verdict is a real engine Analysis, never invented).
// Design record: memory/subprojects/opening-training-game.md.
// UI: docs/design/2026-09-17-ui.md. Setup is a Page (Fields + SegmentedControls + one primary
// Start Button); once a game is underway the screen is a Workbench, board left, with the
// current status line and (once the game ends) the engine's verdict as `primary` throughout —
// that content is unchanged from before this restyle, only its container is.
import { useEffect, useMemo, useState } from 'react';
import { Board } from '@human-chess/board';
import { formatScore, whitePerspective, type Analysis, type PvLine, type Score, type UciEngine } from '@human-chess/engine';
import {
  describeEnd,
  isInCheck,
  isPlayersTurn,
  lastMove,
  limitedStrength,
  MAX_UCI_ELO,
  MIN_UCI_ELO,
  playerDests,
  result as gameResult,
  sideToMove,
  type PlayedMove,
} from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import { START_FEN, type Color } from '@human-chess/rules';
import { Button, Field, Page, SegmentedControl, Status, Toolbar, Workbench, type StatusKind } from '@human-chess/ui';
import { verdict as computeVerdict, type Verdict } from './verdict';
import './opening-training-game.css';

export interface OpeningTrainingGameProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

const MOVE_PRESETS = [12, 20];
const ELO_STEP = 100;
// Stepped from MIN_UCI_ELO by ELO_STEP, always ending exactly at MAX_UCI_ELO (3190) so the true
// ceiling is reachable even though the last step is shorter than ELO_STEP — otherwise a loop
// bound by `e <= MAX_UCI_ELO` would stop at 3120 and never offer 3190 itself.
const ELO_OPTIONS: number[] = [];
for (let e = MIN_UCI_ELO; e < MAX_UCI_ELO; e += ELO_STEP) ELO_OPTIONS.push(e);
ELO_OPTIONS.push(MAX_UCI_ELO);
const DEFAULT_ELO = MIN_UCI_ELO;
const VERDICT_DEPTH = 18;

interface Settings {
  movesN: number;
  playerColor: Color;
  elo: number;
}

type ColorChoice = Color | 'random';
const COLOR_CHOICES: ColorChoice[] = ['white', 'black', 'random'];

type VerdictState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; analysis: Analysis; line: PvLine; whiteScore: Score; verdict: Verdict }
  | { kind: 'failed'; message: string };

const outcomeWord = (v: Verdict): string => (v === 'won' ? 'You win' : v === 'lost' ? 'You lose' : 'Draw');

export function OpeningTrainingGame({ engine }: OpeningTrainingGameProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;

  const [settings, setSettings] = useState<Settings | undefined>(undefined);
  const [movesN, setMovesN] = useState<number>(MOVE_PRESETS[0]!);
  const [colorChoice, setColorChoice] = useState<ColorChoice>('random');
  const [elo, setElo] = useState<number>(DEFAULT_ELO);

  // Stable per elo, so useEngineGame's engine-move effect (keyed on this reference) doesn't
  // re-run on every render — see @human-chess/play's react.ts for why that matters.
  const opponent = useMemo(() => limitedStrength(settings?.elo ?? DEFAULT_ELO), [settings?.elo]);

  const { game, engineState, onPlayerMove, restart, fen, finished } = useEngineGame({
    startFen: START_FEN,
    playerColor: settings?.playerColor ?? 'white',
    engine: readyEngine,
    opponent,
    // exactOptionalPropertyTypes: omit the key entirely pre-Start rather than passing undefined.
    ...(settings ? { maxPlies: 2 * settings.movesN } : {}),
  });

  // Reached the N-move cap without the position itself ending (checkmate etc. is handled by
  // game.end directly, via describeEnd, per the spec: that natural result stands).
  const plyLimitReached = finished && !game.end;

  const [verdictState, setVerdictState] = useState<VerdictState>({ kind: 'idle' });

  useEffect(() => {
    if (!plyLimitReached || !settings) {
      setVerdictState({ kind: 'idle' });
      return;
    }
    if (!readyEngine) return;
    let cancelled = false;
    setVerdictState({ kind: 'loading' });
    readyEngine
      .analyse(fen, [], { depth: VERDICT_DEPTH })
      .then(analysis => {
        if (cancelled) return;
        const line = analysis.lines[0];
        if (!line) {
          setVerdictState({ kind: 'failed', message: `${analysis.engine} returned no evaluation line for this position` });
          return;
        }
        const whiteScore = whitePerspective(line.score, sideToMove(game));
        setVerdictState({ kind: 'ready', analysis, line, whiteScore, verdict: computeVerdict(whiteScore, settings.playerColor) });
      })
      .catch((err: unknown) => {
        if (!cancelled) setVerdictState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plyLimitReached, fen, readyEngine]);

  const start = (): void => {
    const resolvedColor: Color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice;
    setSettings({ movesN, playerColor: resolvedColor, elo });
    restart({ startFen: START_FEN, playerColor: resolvedColor });
  };

  const rematch = (): void => {
    if (!settings) return;
    restart({ startFen: START_FEN, playerColor: settings.playerColor });
  };

  const newGame = (): void => setSettings(undefined);

  if (!settings) {
    const engineStatus: { kind: StatusKind; text: string } =
      engine instanceof Error
        ? { kind: 'error', text: `The engine could not be loaded: ${engine.message}` }
        : !readyEngine
          ? { kind: 'busy', text: 'Waiting for the engine to load…' }
          : { kind: 'info', text: `Engine ready: ${readyEngine.name}.` };

    return (
      <Page
        title="Opening training game"
        intro="Play a fixed number of moves each side from the start, then the engine's own evaluation of the final position says who stood better. Untimed for now."
      >
        <Field label="Moves each side">
          <SegmentedControl
            options={MOVE_PRESETS.map(n => ({ value: n, label: String(n) }))}
            value={movesN}
            onChange={setMovesN}
            ariaLabel="Moves each side"
          />
        </Field>
        <Field label="Your colour">
          <SegmentedControl
            options={COLOR_CHOICES.map(c => ({ value: c, label: c }))}
            value={colorChoice}
            onChange={setColorChoice}
            ariaLabel="Your colour"
          />
        </Field>
        <Field label="Opponent Elo" htmlFor="otg-elo">
          <select id="otg-elo" value={elo} onChange={e => setElo(Number(e.target.value))}>
            {ELO_OPTIONS.map(o => (
              <option key={o} value={o}>
                {o} — {limitedStrength(o).description}
              </option>
            ))}
          </select>
        </Field>
        <Status kind={engineStatus.kind}>{engineStatus.text}</Status>
        <Button variant="primary" onClick={start} disabled={!readyEngine}>
          Start
        </Button>
      </Page>
    );
  }

  const dests = playerDests(game);
  const natural = gameResult(game);

  const status = (): string => {
    if (engine instanceof Error) return `The engine could not be loaded: ${engine.message}`;
    if (!readyEngine) return 'Loading the engine…';
    if (engineState.kind === 'failed') return `The engine failed: ${engineState.message}`;
    if (game.end) return describeEnd(game);
    if (plyLimitReached) return `Reached ${settings.movesN} moves each.`;
    if (engineState.kind === 'thinking') return 'The opponent is thinking…';
    if (isPlayersTurn(game)) return isInCheck(game) ? 'You are in check. Your move.' : 'Your move.';
    return 'Waiting for the opponent.';
  };

  const statusKind: StatusKind =
    engine instanceof Error || engineState.kind === 'failed'
      ? 'error'
      : !readyEngine || engineState.kind === 'thinking'
        ? 'busy'
        : 'info';

  // The status/verdict line: this is the thing the player must see next, so it is Workbench's
  // `primary` throughout, not just once the game ends (docs/design/2026-09-17-ui.md screen note).
  const primary = !finished ? (
    <Status kind={statusKind}>{status()}</Status>
  ) : game.end ? (
    <>
      <Status kind="info">{describeEnd(game)}</Status>
      {natural && (
        <p className="otg-outcome">
          <strong>{outcomeWord(natural)}</strong>
        </p>
      )}
    </>
  ) : verdictState.kind === 'loading' || verdictState.kind === 'idle' ? (
    <Status kind="busy">Evaluating the final position…</Status>
  ) : verdictState.kind === 'failed' ? (
    <Status kind="error">The engine failed: {verdictState.message}</Status>
  ) : (
    <>
      <p>
        Final evaluation, White's perspective: <strong>{formatScore(verdictState.whiteScore)}</strong>{' '}
        <span className="otg-provenance">
          ({verdictState.analysis.engine}, depth {verdictState.line.depth})
        </span>
      </p>
      <p className="otg-outcome">
        <strong>{outcomeWord(verdictState.verdict)}</strong>
      </p>
    </>
  );

  // Once the move cap is reached the status line ("Reached N moves each.") still shows, above
  // the verdict, exactly as before the design pass.
  const primaryWithCap = plyLimitReached ? (
    <>
      <Status kind="info">{status()}</Status>
      {primary}
    </>
  ) : (
    primary
  );

  return (
    <Workbench
      title="Opening training game"
      primary={primaryWithCap}
      board={(sizePx: number) => (
        <Board
          fen={fen}
          orientation={settings.playerColor}
          turnColor={sideToMove(game)}
          dests={dests}
          movableColor={isPlayersTurn(game) && readyEngine && !finished ? settings.playerColor : undefined}
          lastMove={lastMove(game)}
          check={isInCheck(game)}
          onMove={onPlayerMove}
          size={`${sizePx}px`}
        />
      )}
      footer={
        finished ? (
          <Toolbar>
            <Button onClick={newGame}>New game</Button>
            <Button onClick={rematch}>Rematch</Button>
          </Toolbar>
        ) : undefined
      }
    >
      <p className="otg-note">
        {settings.movesN} moves each side, untimed for now. You play {settings.playerColor}.
      </p>
      <MoveList moves={game.moves} />
    </Workbench>
  );
}

function MoveList({ moves }: { moves: PlayedMove[] }): React.JSX.Element {
  const pairs: [PlayedMove, PlayedMove | undefined][] = [];
  for (let i = 0; i < moves.length; i += 2) pairs.push([moves[i]!, moves[i + 1]]);
  return (
    <ol className="otg-moves">
      {pairs.map(([white, black], i) => (
        <li key={i}>
          {white.san}
          {black ? ` ${black.san}` : ''}
        </li>
      ))}
    </ol>
  );
}
