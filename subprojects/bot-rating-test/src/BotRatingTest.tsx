// Bot rating test: play a Stockfish opponent clamped to a chosen UCI_Elo, record every
// finished attempt with provenance (source of truth: the play package's own Game/result), and
// suggest — never claim — the next level. Every move, evaluation-adjacent number and result
// shown here traces to useEngineGame/the play package; nothing is generated free-form (A1, V3).
// Design record: memory/subprojects/bot-rating-test.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board } from '@human-chess/board';
import type { UciEngine } from '@human-chess/engine';
import {
  describeEnd,
  isInCheck,
  isPlayersTurn,
  lastMove,
  limitedStrength,
  playerDests,
  result as gameResult,
  sideToMove,
  uciMoves,
  type Opponent,
} from '@human-chess/play';
import { useEngineGame } from '@human-chess/play/react';
import { positionFromFen, type Color } from '@human-chess/rules';
import { appendRecord, clearRecords, loadRecords, type BotRatingRecord, type GameOutcome } from './records';
import { ELO_LEVELS, suggestNextElo, suggestedStartingElo } from './suggest';
import { highestWin, summarize } from './summary';
import './bot-rating-test.css';

export interface BotRatingTestProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

type ColorChoice = 'white' | 'black' | 'random';

interface ActiveGame {
  elo: number;
  playerColor: Color;
  startFen: string;
}

function pickColor(choice: ColorChoice): Color {
  if (choice === 'random') return Math.random() < 0.5 ? 'white' : 'black';
  return choice;
}

/** Numbered SAN move list, e.g. "1. e4 e5 2. Nf3 Nc6" — every SAN here is the played game's own. */
function formatSanLine(sans: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    const moveNo = i / 2 + 1;
    const white = sans[i];
    const black = sans[i + 1];
    parts.push(black ? `${moveNo}. ${white} ${black}` : `${moveNo}. ${white}`);
  }
  return parts.join(' ');
}

function SummaryTable({ records }: { records: BotRatingRecord[] }): React.JSX.Element {
  const rows = summarize(records);
  const best = highestWin(records);
  return (
    <div className="brt-summary">
      <p className="brt-highest">{best ? `Highest bot you have beaten: ${best.elo} (${best.wins} win${best.wins === 1 ? '' : 's'})` : 'No wins recorded yet.'}</p>
      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Elo</th>
              <th>Wins</th>
              <th>Draws</th>
              <th>Losses</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.elo}>
                <td>{r.elo}</td>
                <td>{r.wins}</td>
                <td>{r.draws}</td>
                <td>{r.losses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function BotRatingTest({ engine }: BotRatingTestProps): React.JSX.Element {
  const readyEngine = engine instanceof Error ? undefined : engine;
  const [records, setRecords] = useState<BotRatingRecord[]>(() => loadRecords());
  const [elo, setElo] = useState(() => suggestedStartingElo(loadRecords()));
  const [colorChoice, setColorChoice] = useState<ColorChoice>('white');
  const [fenText, setFenText] = useState(STANDARD_START_FEN);
  const [fenError, setFenError] = useState<string | undefined>(undefined);
  const [active, setActive] = useState<ActiveGame | undefined>(undefined);
  const [resigned, setResigned] = useState(false);
  const recordedRef = useRef(false);

  const opponent: Opponent | undefined = useMemo(() => (active ? limitedStrength(active.elo) : undefined), [active?.elo]);

  const { game, engineState, onPlayerMove, restart, fen, finished } = useEngineGame({
    startFen: active?.startFen ?? STANDARD_START_FEN,
    playerColor: active?.playerColor ?? 'white',
    engine: active ? readyEngine : undefined,
    ...(opponent ? { opponent } : {}),
  });

  // useEngineGame only reads its startFen/playerColor options on mount; when a new attempt
  // begins (Start, or "Play suggested level") this explicitly resets the underlying game,
  // mirroring subprojects/endgames-intro/src/useLessonGame.ts.
  useEffect(() => {
    if (active) restart({ startFen: active.startFen, playerColor: active.playerColor });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const outcome: GameOutcome | undefined = resigned ? 'lost' : gameResult(game);
  const ended = finished || resigned;

  useEffect(() => {
    if (!active || !ended || !outcome || recordedRef.current) return;
    recordedRef.current = true;
    const updated = appendRecord({
      opponentId: opponent?.id ?? `limited-strength-${active.elo}`,
      elo: active.elo,
      startFen: active.startFen,
      playerColor: active.playerColor,
      result: outcome,
      moves: uciMoves(game),
    });
    setRecords(updated);
  }, [active, ended, outcome, opponent, game]);

  const beginGame = useCallback((nextElo: number, choice: ColorChoice, startFenValue: string) => {
    recordedRef.current = false;
    setResigned(false);
    setActive({ elo: nextElo, playerColor: pickColor(choice), startFen: startFenValue });
  }, []);

  const handleStart = useCallback(() => {
    try {
      positionFromFen(fenText);
    } catch (err) {
      setFenError(err instanceof Error ? err.message : String(err));
      return;
    }
    setFenError(undefined);
    beginGame(elo, colorChoice, fenText);
  }, [fenText, elo, colorChoice, beginGame]);

  const dests = useMemo(() => playerDests(game), [game]);
  const sanLine = useMemo(() => formatSanLine(game.moves.map(m => m.san)), [game.moves]);

  if (engine instanceof Error) {
    return (
      <div className="brt">
        <p className="brt-status">The engine could not be loaded: {engine.message}</p>
      </div>
    );
  }
  if (!engine) {
    return (
      <div className="brt">
        <p className="brt-status">Loading the engine…</p>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="brt">
        <h2>Bot rating test</h2>
        <div className="brt-setup">
          <label>
            Bot level (UCI_Elo)
            <select value={elo} onChange={e => setElo(Number(e.target.value))}>
              {ELO_LEVELS.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Your colour
            <select value={colorChoice} onChange={e => setColorChoice(e.target.value as ColorChoice)}>
              <option value="white">White</option>
              <option value="black">Black</option>
              <option value="random">Random</option>
            </select>
          </label>
          <label>
            Start position (FEN)
            <input type="text" value={fenText} onChange={e => setFenText(e.target.value)} />
          </label>
          {fenError && <p className="brt-error">{fenError}</p>}
          <button onClick={handleStart}>Start</button>
        </div>
        <SummaryTable records={records} />
      </div>
    );
  }

  const statusText = (): string => {
    if (resigned) return 'You resigned.';
    if (engineState.kind === 'failed') return `The engine failed: ${engineState.message}`;
    if (game.end) return describeEnd(game);
    if (engineState.kind === 'thinking') return 'The bot is thinking…';
    if (isPlayersTurn(game)) return isInCheck(game) ? 'You are in check. Your move.' : 'Your move.';
    return 'Waiting for the bot.';
  };

  const suggested = outcome !== undefined ? suggestNextElo(active.elo, outcome) : active.elo;

  return (
    <div className="brt">
      <h2>Bot rating test</h2>
      <p>
        Playing {active.playerColor} against Stockfish, UCI_Elo {active.elo}.
      </p>
      <Board
        fen={fen}
        orientation={active.playerColor}
        turnColor={sideToMove(game)}
        dests={dests}
        movableColor={!ended && isPlayersTurn(game) ? active.playerColor : undefined}
        lastMove={lastMove(game)}
        check={isInCheck(game)}
        onMove={onPlayerMove}
      />
      <p className="brt-status" aria-live="polite">
        {statusText()}
      </p>
      <p className="brt-moves">{sanLine || '(no moves yet)'}</p>

      {!ended && (
        <div className="brt-actions">
          <button onClick={() => setResigned(true)}>Resign</button>
        </div>
      )}

      {ended && (
        <div className="brt-postgame">
          <p>Suggested next level: <strong>{suggested}</strong></p>
          <div className="brt-actions">
            <button onClick={() => beginGame(suggested, colorChoice, fenText)}>Play suggested level</button>
            <button onClick={() => setActive(undefined)}>Change settings</button>
            <button
              onClick={() => {
                const ok = typeof confirm === 'function' ? confirm('Clear all recorded bot-rating-test games? This cannot be undone.') : false;
                if (!ok) return;
                clearRecords();
                setRecords([]);
              }}
            >
              Clear my records
            </button>
          </div>
          <SummaryTable records={records} />
        </div>
      )}
    </div>
  );
}
