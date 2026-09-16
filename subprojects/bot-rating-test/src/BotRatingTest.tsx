// Bot rating test: play a Stockfish opponent clamped to a chosen UCI_Elo, record every
// finished attempt with provenance (source of truth: the play package's own Game/result), and
// suggest — never claim — the next level. Every move, evaluation-adjacent number and result
// shown here traces to useEngineGame/the play package; nothing is generated free-form (A1, V3).
// Design record: memory/subprojects/bot-rating-test.md.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Board, BoardEditor, MoveLine } from '@human-chess/board';
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
import {
  castlingRightsFor,
  composeFen,
  EMPTY_PLACEMENT_FEN,
  positionEnd,
  positionFromFen,
  START_FEN,
  type Color,
  type Position,
} from '@human-chess/rules';
import { appendRecord, clearRecords, loadRecords, type BotRatingRecord, type GameOutcome } from './records';
import { ELO_LEVELS, suggestNextElo, suggestedStartingElo } from './suggest';
import { highestWin, summarize } from './summary';
import './bot-rating-test.css';

export interface BotRatingTestProps {
  /** A ready (initialised) engine, or undefined while it loads; or an Error when it could not load. */
  engine: UciEngine | Error | undefined;
}

const STANDARD_START_FEN = START_FEN;

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

const CASTLING_LETTERS = ['K', 'Q', 'k', 'q'] as const;
const CASTLING_LABEL: Record<(typeof CASTLING_LETTERS)[number], string> = {
  K: 'White O-O',
  Q: 'White O-O-O',
  k: 'Black O-O',
  q: 'Black O-O-O',
};

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
  const [boardMode, setBoardMode] = useState(false);
  const [active, setActive] = useState<ActiveGame | undefined>(undefined);
  const [resigned, setResigned] = useState(false);
  const recordedRef = useRef(false);

  // The FEN text is the single source of truth for the setup screen; these are just its fields,
  // read defensively since the text can be mid-edit or pasted garbage. The board editor and the
  // side-to-move/castling controls below only ever read from these and write back through
  // composeFen — they never hold their own copy of the position.
  const fenFields = useMemo(() => fenText.trim().split(/\s+/), [fenText]);
  const placement = fenFields[0] ?? '';
  const turnField: Color = fenFields[1] === 'b' ? 'black' : 'white';
  const castlingField = fenFields[2] ?? '';
  const allowedCastling = useMemo(() => {
    try {
      return castlingRightsFor(placement);
    } catch {
      return '';
    }
  }, [placement]);

  const applyFenParts = useCallback((newPlacement: string, newTurn: Color, newCastling: string) => {
    try {
      setFenText(composeFen(newPlacement, newTurn, newCastling));
      setFenError(undefined);
    } catch (err) {
      // A half-typed placement in the FEN field makes the turn/castling controls unable to
      // rebuild the FEN; say so rather than silently doing nothing.
      setFenError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleEditorChange = useCallback(
    (newPlacement: string) => {
      let allowedForNew = '';
      try {
        allowedForNew = castlingRightsFor(newPlacement);
      } catch {
        // leave '' — an unparseable placement can't come from the editor, but stay defensive
      }
      const keptCastling = [...castlingField].filter(c => allowedForNew.includes(c)).join('');
      applyFenParts(newPlacement, turnField, keptCastling);
    },
    [applyFenParts, castlingField, turnField],
  );

  const handleTurnChange = useCallback(
    (newTurn: Color) => applyFenParts(placement, newTurn, castlingField),
    [applyFenParts, placement, castlingField],
  );

  const toggleCastling = useCallback(
    (letter: string) => {
      const next = castlingField.includes(letter) ? castlingField.replace(letter, '') : castlingField + letter;
      applyFenParts(placement, turnField, next);
    },
    [applyFenParts, placement, turnField, castlingField],
  );

  const handleClearBoard = useCallback(() => applyFenParts(EMPTY_PLACEMENT_FEN, 'white', ''), [applyFenParts]);
  const handleResetBoard = useCallback(() => setFenText(STANDARD_START_FEN), []);

  const opponent: Opponent | undefined = useMemo(() => (active ? limitedStrength(active.elo) : undefined), [active?.elo]);

  const { game, engineState, onPlayerMove, restart, fen, finished } = useEngineGame({
    startFen: active?.startFen ?? STANDARD_START_FEN,
    playerColor: active?.playerColor ?? 'white',
    engine: active ? readyEngine : undefined,
    ...(opponent ? { opponent } : {}),
  });

  const outcome: GameOutcome | undefined = resigned ? 'lost' : gameResult(game);
  const ended = finished || resigned;

  // Gated on the played game actually belonging to `active` (not just recordedRef, which alone
  // was found to still race: beginGame's restart and setActive land in the same batch, but this
  // extra check is what actually guards against recording a stale, just-finished game's outcome
  // under the newly chosen elo/colour if that batching assumption ever stops holding).
  useEffect(() => {
    if (!active || !ended || !outcome || recordedRef.current) return;
    if (game.startFen !== active.startFen || game.playerColor !== active.playerColor) return;
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

  // Resets the underlying game synchronously, in the same event-handler batch as setActive —
  // mirroring subprojects/chessitout/src/Chessitout.tsx's onVote/onChooseSide — so the render
  // where `active` first reflects the new attempt never still holds the previous, finished game.
  const beginGame = useCallback(
    (nextElo: number, choice: ColorChoice, startFenValue: string) => {
      recordedRef.current = false;
      setResigned(false);
      const playerColor = pickColor(choice);
      setActive({ elo: nextElo, playerColor, startFen: startFenValue });
      restart({ startFen: startFenValue, playerColor });
    },
    [restart],
  );

  const handleStart = useCallback(() => {
    let pos: Position;
    try {
      pos = positionFromFen(fenText);
    } catch (err) {
      setFenError(err instanceof Error ? err.message : String(err));
      return;
    }
    if (positionEnd(pos)) {
      setFenError('This position is already game over — choose a starting position where a game can still be played.');
      return;
    }
    setFenError(undefined);
    beginGame(elo, colorChoice, fenText);
  }, [fenText, elo, colorChoice, beginGame]);

  const dests = useMemo(() => playerDests(game), [game]);

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
          <label className="brt-board-toggle">
            <input type="checkbox" checked={boardMode} onChange={e => setBoardMode(e.target.checked)} />
            Set up on a board
          </label>
          {boardMode && (
            <div className="brt-board-editor">
              <BoardEditor
                fen={placement}
                orientation={colorChoice === 'black' ? 'black' : 'white'}
                onChange={handleEditorChange}
                size="16rem"
              />
              <div className="brt-board-editor-controls">
                <fieldset>
                  <legend>Side to move</legend>
                  <label>
                    <input type="radio" name="brt-turn" checked={turnField === 'white'} onChange={() => handleTurnChange('white')} />
                    White
                  </label>
                  <label>
                    <input type="radio" name="brt-turn" checked={turnField === 'black'} onChange={() => handleTurnChange('black')} />
                    Black
                  </label>
                </fieldset>
                <fieldset>
                  <legend>Castling rights</legend>
                  {CASTLING_LETTERS.filter(c => allowedCastling.includes(c)).map(c => (
                    <label key={c}>
                      <input type="checkbox" checked={castlingField.includes(c)} onChange={() => toggleCastling(c)} />
                      {CASTLING_LABEL[c]}
                    </label>
                  ))}
                  {allowedCastling.length === 0 && <p className="brt-castling-none">No castling rights possible from this placement.</p>}
                </fieldset>
                <div className="brt-actions">
                  <button type="button" onClick={handleClearBoard}>Clear board</button>
                  <button type="button" onClick={handleResetBoard}>Start position</button>
                </div>
              </div>
            </div>
          )}
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
      <div className="brt-moves">
        {game.moves.length === 0 ? '(no moves yet)' : <MoveLine startFen={game.startFen} ucis={uciMoves(game)} orientation={active.playerColor} />}
      </div>

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
