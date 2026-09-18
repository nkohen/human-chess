// Bot rating test: play a Stockfish opponent clamped to a chosen UCI_Elo, record every
// finished attempt with provenance (source of truth: the play package's own Game/result), and
// suggest — never claim — the next level. Every move, evaluation-adjacent number and result
// shown here traces to useEngineGame/the play package; nothing is generated free-form (A1, V3).
// Design record: memory/subprojects/bot-rating-test.md.
// UI: docs/design/2026-09-17-ui.md. One Workbench for the whole screen (board/editor left):
// `primary` is the Elo control + Start button before a game, the live status line (plus, once
// the game ends, the unchanged "suggested next level" line) during and after one; the FEN/side-
// to-move/castling setup controls are `aside`; the record table is `children`; reset/resign are
// `footer`. None of the underlying state, calculations or gating changed — only where each piece
// renders.
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
import { Button, cx, Field, Page, readHandoffParams, SegmentedControl, Status, Toolbar, Workbench, type StatusKind } from '@human-chess/ui';
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
const COLOR_CHOICES: { value: ColorChoice; label: string }[] = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
  { value: 'random', label: 'Random' },
];

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

// The board slot is sized to a bare square (useFitSquare, packages/ui); BoardEditor also draws a
// palette row below the board, so a size reservation keeps that combination from overflowing the
// slot's allotted height (the board column's width in this layout comfortably fits the palette
// on one row, so one row's worth of height is enough of a reserve).
const EDITOR_PALETTE_RESERVE_PX = 64;

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

  // Cross-tool hand-off (packages/ui/src/handoff.ts): the game reviewer's "Play from this
  // position against the engine" and puzzles' "Practice this against the engine" both land here
  // with ?fen=...&color=.... Read once, from the hash this component was routed in on (App.tsx
  // only ever mounts BotRatingTest fresh per route change). `handoffFen` is kept around, not just
  // consumed, so the "handed over" notice below can tell whether the user has since changed it.
  const [handoff] = useState(() => readHandoffParams(window.location.hash));
  const handoffFen = handoff.get('fen') ?? undefined;
  const [colorChoice, setColorChoice] = useState<ColorChoice>(() => {
    const c = handoff.get('color');
    return c === 'black' || c === 'white' ? c : 'white';
  });
  const [fenText, setFenText] = useState(() => handoffFen ?? STANDARD_START_FEN);
  // A handed-over FEN is checked right away, the same check Start runs, so the "handed over"
  // notice never sits next to a position that will only be rejected once the user clicks.
  const [fenError, setFenError] = useState<string | undefined>(() => {
    if (handoffFen === undefined) return undefined;
    try {
      positionFromFen(handoffFen);
      return undefined;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  });
  const [boardMode, setBoardMode] = useState(false);
  const [active, setActive] = useState<ActiveGame | undefined>(undefined);
  const [resigned, setResigned] = useState(false);
  // First guess: "blindfold" only ever hides pieces via CSS on the live board (see
  // bot-rating-test.css's .brt-blindfold) — no Board change, so anything can link here with
  // blindfold=1 (a future visualization-trainer hand-off is the named example) and get the same
  // treatment for free. It's a checkbox, not tied to `active`, so it stays in effect (and stays
  // toggleable) across "Play suggested level" / restarts within the same visit.
  const [blindfold, setBlindfold] = useState(() => handoff.get('blindfold') === '1');
  const recordedRef = useRef(false);

  // The notice clears the moment the user changes the FEN away from what was handed off — a
  // derived boolean rather than its own state/effect, so there is nothing to keep in sync: it is
  // simply "is the field still showing exactly what was handed to it".
  const handoffNoticeVisible = handoffFen !== undefined && fenText === handoffFen;

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
      <Page title="Bot rating test">
        <Status kind="error">The engine could not be loaded: {engine.message}</Status>
      </Page>
    );
  }
  if (!engine) {
    return (
      <Page title="Bot rating test">
        <Status kind="busy">Loading the engine…</Status>
      </Page>
    );
  }

  if (!active) {
    return (
      <Workbench
        title="Bot rating test"
        board={(sizePx: number) =>
          boardMode ? (
            <BoardEditor
              fen={placement}
              orientation={colorChoice === 'black' ? 'black' : 'white'}
              onChange={handleEditorChange}
              size={`${Math.max(0, sizePx - EDITOR_PALETTE_RESERVE_PX)}px`}
            />
          ) : null
        }
        primary={
          <>
            <Field label="Bot level (UCI_Elo)" htmlFor="brt-elo">
              <select id="brt-elo" value={elo} onChange={e => setElo(Number(e.target.value))}>
                {ELO_LEVELS.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Button variant="primary" onClick={handleStart}>
              Start
            </Button>
          </>
        }
        aside={
          <>
            {handoffNoticeVisible && <Status kind="info">Position handed over from another human-chess tool.</Status>}
            <Field label="Your colour">
              <SegmentedControl options={COLOR_CHOICES} value={colorChoice} onChange={setColorChoice} ariaLabel="Your colour" />
            </Field>
            <Field label="Start position (FEN)" htmlFor="brt-fen">
              <input id="brt-fen" type="text" value={fenText} onChange={e => setFenText(e.target.value)} />
            </Field>
            <label className="brt-board-toggle">
              <input type="checkbox" checked={boardMode} onChange={e => setBoardMode(e.target.checked)} />
              Set up on a board
            </label>
            <label className="brt-board-toggle">
              <input type="checkbox" checked={blindfold} onChange={e => setBlindfold(e.target.checked)} />
              Blindfold (pieces hidden)
            </label>
            {boardMode && (
              <div className="brt-board-editor-controls">
                <Field label="Side to move">
                  <SegmentedControl
                    options={[
                      { value: 'white' as Color, label: 'White' },
                      { value: 'black' as Color, label: 'Black' },
                    ]}
                    value={turnField}
                    onChange={handleTurnChange}
                    ariaLabel="Side to move"
                  />
                </Field>
                <Field label="Castling rights">
                  <div className="brt-castling-row">
                    {CASTLING_LETTERS.filter(c => allowedCastling.includes(c)).map(c => (
                      <label key={c}>
                        <input type="checkbox" checked={castlingField.includes(c)} onChange={() => toggleCastling(c)} />
                        {CASTLING_LABEL[c]}
                      </label>
                    ))}
                    {allowedCastling.length === 0 && <p className="brt-castling-none">No castling rights possible from this placement.</p>}
                  </div>
                </Field>
              </div>
            )}
            {fenError && <Status kind="error">{fenError}</Status>}
          </>
        }
        footer={
          boardMode ? (
            <Toolbar>
              <Button onClick={handleClearBoard}>Clear board</Button>
              <Button onClick={handleResetBoard}>Start position</Button>
            </Toolbar>
          ) : undefined
        }
      >
        <SummaryTable records={records} />
      </Workbench>
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

  const statusKind: StatusKind = engineState.kind === 'failed' ? 'error' : engineState.kind === 'thinking' ? 'busy' : 'info';

  const suggested = outcome !== undefined ? suggestNextElo(active.elo, outcome) : active.elo;

  return (
    <Workbench
      title="Bot rating test"
      status={
        <p>
          Playing {active.playerColor} against Stockfish, UCI_Elo {active.elo}.
        </p>
      }
      board={(sizePx: number) => (
        <div className={cx('brt-board-slot', blindfold && 'brt-blindfold')}>
          <Board
            fen={fen}
            orientation={active.playerColor}
            turnColor={sideToMove(game)}
            dests={dests}
            movableColor={!ended && isPlayersTurn(game) ? active.playerColor : undefined}
            lastMove={lastMove(game)}
            check={isInCheck(game)}
            onMove={onPlayerMove}
            size={`${sizePx}px`}
          />
        </div>
      )}
      primary={
        <>
          <Status kind={statusKind}>{statusText()}</Status>
          <label className="brt-board-toggle">
            <input type="checkbox" checked={blindfold} onChange={e => setBlindfold(e.target.checked)} />
            Blindfold (pieces hidden)
          </label>
          {ended && (
            <p>
              Suggested next level: <strong>{suggested}</strong>
            </p>
          )}
        </>
      }
      footer={
        !ended ? (
          <Toolbar>
            <Button onClick={() => setResigned(true)}>Resign</Button>
          </Toolbar>
        ) : (
          <Toolbar>
            <Button onClick={() => beginGame(suggested, colorChoice, fenText)}>Play suggested level</Button>
            <Button onClick={() => setActive(undefined)}>Change settings</Button>
            <Button
              onClick={() => {
                const ok = typeof confirm === 'function' ? confirm('Clear all recorded bot-rating-test games? This cannot be undone.') : false;
                if (!ok) return;
                clearRecords();
                setRecords([]);
              }}
            >
              Clear my records
            </Button>
          </Toolbar>
        )
      }
    >
      <div className="brt-moves">
        {game.moves.length === 0 ? '(no moves yet)' : <MoveLine startFen={game.startFen} ucis={uciMoves(game)} orientation={active.playerColor} />}
      </div>
      {ended && <SummaryTable records={records} />}
    </Workbench>
  );
}
