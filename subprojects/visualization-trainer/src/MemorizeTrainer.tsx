// The "Memorize" mode (memory/subprojects/visualization-trainer.md, "Extra modes": a timed
// position-memorizer). Five positions per session: settings (study time, source), then per
// position a view-only Board with a countdown, then an empty BoardEditor with a count-up clock
// to rebuild it, then a side-by-side comparison with the differing squares listed, then a
// session summary. No engine call anywhere in this mode — scoring is a pure board-state
// comparison (memorize.ts), never an evaluation, so A1/V3 do not apply here the way they do to
// the engine-backed Lines mode.
//
// Layout: docs/design/2026-09-17-ui.md. Settings and the summary have no board, so they are a
// `Page` (rule 1: a setup/import screen is a Page, not a Workbench); studying/rebuilding/
// reviewing each show a board, so they are a `Workbench`.
//
// Reload survival (docs/design/2026-09-18-reload-survival.md): every field of session progress
// lives in one snapshot object (snapshot.ts's MemorizeSnapshot), seeded synchronously in the
// usePersistedState initialiser. `phase` already carries its own absolute `endAt`/`startAt`
// (Phase, below), so it is persisted exactly as it is — no extra clock bookkeeping needed. The
// study-clock-expired effect a few lines down compares `now` (read fresh at mount) against the
// restored phase's `endAt` on the very first render after a reload the same way it does on every
// other 100ms tick, so a clock that ran out while the tab was away moves straight on to
// rebuilding, honestly, the same as it would have live — never silently extended. `now` itself
// stays a plain `useState`: it is a display tick, not progress.
import { useEffect, useState } from 'react';
import { Board, BoardEditor } from '@human-chess/board';
import { EMPTY_PLACEMENT_FEN, inCheck, positionFromFen, turn, type SquareName } from '@human-chess/rules';
import { Button, clearPersisted, Field, Page, readPersisted, SegmentedControl, Status, usePersistedState, Workbench } from '@human-chess/ui';
import {
  DEFAULT_MEMORIZE_SOURCE,
  DEFAULT_STUDY_SECONDS,
  describeDiff,
  MEMORIZE_ROUNDS,
  pickMemorizePositions,
  scoreRebuild,
  STUDY_SECONDS_OPTIONS,
  type MemorizeScore,
  type MemorizeSource,
  type StudySeconds,
} from './memorize';
import { freshMemorizeSnapshot, parseMemorizeSnapshot, VT_MEMORIZE_KEY, type MemorizePhaseSnapshot } from './snapshot';
import './visualization-trainer.css';

const EMPTY_DESTS = new Map<SquareName, SquareName[]>();
const ORIENTATION = 'white'; // both boards always face the same way; not built: orienting by side to move.

// BoardEditor draws a palette row below the board (packages/board/BoardEditor.tsx); this reserve
// keeps that combination from overflowing the board slot's allotted height, same constant and
// reasoning as subprojects/bot-rating-test/src/BotRatingTest.tsx's EDITOR_PALETTE_RESERVE_PX.
const EDITOR_PALETTE_RESERVE_PX = 64;

const STUDY_OPTIONS = STUDY_SECONDS_OPTIONS.map(s => ({ value: s, label: `${s}s` }));
const SOURCE_OPTIONS: { value: MemorizeSource; label: string }[] = [
  { value: 'random', label: 'Random' },
  { value: 'curated', label: 'Curated (your games)' },
];

interface MemorizeResult {
  studySeconds: StudySeconds;
  rebuildMs: number;
  score: MemorizeScore;
}

type Phase = MemorizePhaseSnapshot;

function secondsOf(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export interface MemorizeTrainerProps {
  /** A position handed over from another tool (see VisualizationTrainer.tsx), already validated.
   * It becomes the first of the session's positions; the rest come from the chosen source. */
  firstFen?: string | undefined;
}

export function MemorizeTrainer({ firstFen }: MemorizeTrainerProps = {}): React.JSX.Element {
  // A fresh hand-off (VisualizationTrainer.tsx's `firstFen`, from #/visualization?fen=...) must
  // win over whatever Memorize session this screen had persisted — otherwise a reload or remount
  // right after the hand-off would silently restore the old mid-session snapshot instead of
  // landing on settings with the handed-over position queued up
  // (docs/design/2026-09-18-reload-survival.md). Mirrors bot-rating-test/src/BotRatingTest.tsx's
  // hand-off-wins-over-snapshot pattern: study preferences (studySeconds/source) are the learner's
  // own settings and carry over, but the session itself restarts. This useState must stay
  // textually above the usePersistedState call below so the clear runs, in hook order, before
  // usePersistedState's own initializer ever reads storage.
  const [handoffSettings] = useState(() => {
    if (firstFen === undefined) return undefined;
    const prior = readPersisted(VT_MEMORIZE_KEY, parseMemorizeSnapshot);
    clearPersisted(VT_MEMORIZE_KEY);
    return { studySeconds: prior?.studySeconds ?? DEFAULT_STUDY_SECONDS, source: prior?.source ?? DEFAULT_MEMORIZE_SOURCE };
  });

  // freshMemorizeSnapshot already seeds `phase: { kind: 'settings' }` (a fresh session always
  // starts there), so the hand-off case only needs its own studySeconds/source carried into it.
  const [snap, setSnap] = usePersistedState(
    VT_MEMORIZE_KEY,
    () => (handoffSettings ? freshMemorizeSnapshot(handoffSettings.studySeconds, handoffSettings.source) : freshMemorizeSnapshot(DEFAULT_STUDY_SECONDS, DEFAULT_MEMORIZE_SOURCE)),
    { parse: parseMemorizeSnapshot },
  );
  const { studySeconds, source, sessionFens, results, phase } = snap;

  // Ticks while a clock (study countdown or rebuild count-up) is running, purely so the displayed
  // time updates; the actual timestamps live on the phase object (persisted), never on this
  // counter — a display tick, not progress, so it stays a plain useState.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase.kind !== 'studying' && phase.kind !== 'rebuilding') return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase.kind]);

  // The study clock's own end-of-countdown transition: hides the position and opens the rebuild.
  // `now` is set to the same timestamp as `startAt` here (and below in startSession/goNext)
  // rather than left to the next 100ms tick — otherwise the first rebuilding frame reads
  // `now - startAt` with a stale, smaller `now`, showing a negative "-0.0s" for one tick. This
  // same check, run against a restored `phase.endAt` on the very first render after a reload
  // (docs/design/2026-09-18-reload-survival.md), is what moves a clock that ran out while the tab
  // was away straight on to rebuilding, exactly as it would have live — no separate code path.
  useEffect(() => {
    if (phase.kind !== 'studying' || now < phase.endAt) return;
    const t = Date.now();
    setNow(t);
    setSnap(s =>
      s.phase.kind !== 'studying'
        ? s
        : { ...s, phase: { kind: 'rebuilding', index: s.phase.index, fen: s.phase.fen, studySeconds: s.phase.studySeconds, startAt: t, placement: EMPTY_PLACEMENT_FEN } },
    );
  }, [now, phase, setSnap]);

  const startSession = (): void => {
    const fens = pickMemorizePositions(source, MEMORIZE_ROUNDS);
    if (firstFen) fens[0] = firstFen;
    const t = Date.now();
    setNow(t);
    setSnap(s => ({ ...s, sessionFens: fens, results: [], phase: { kind: 'studying', index: 0, fen: fens[0]!, studySeconds: s.studySeconds, endAt: t + s.studySeconds * 1000 } }));
  };

  const submitRebuild = (): void => {
    if (phase.kind !== 'rebuilding') return;
    const rebuildMs = Date.now() - phase.startAt;
    const score = scoreRebuild(phase.fen, phase.placement);
    setSnap(s => ({
      ...s,
      results: [...s.results, { studySeconds: phase.studySeconds, rebuildMs, score }],
      phase: { kind: 'reviewed', index: phase.index, fen: phase.fen, studySeconds: phase.studySeconds, rebuildMs, placement: phase.placement, score },
    }));
  };

  const goNext = (): void => {
    if (phase.kind !== 'reviewed') return;
    const nextIndex = phase.index + 1;
    if (nextIndex >= sessionFens.length) {
      setSnap(s => ({ ...s, phase: { kind: 'summary' } }));
      return;
    }
    const t = Date.now();
    setNow(t);
    setSnap(s => ({ ...s, phase: { kind: 'studying', index: nextIndex, fen: sessionFens[nextIndex]!, studySeconds: s.studySeconds, endAt: t + s.studySeconds * 1000 } }));
  };

  const playAgain = (): void => setSnap(s => ({ ...s, phase: { kind: 'settings' } }));

  if (phase.kind === 'settings') {
    return (
      <Page title="Visualization trainer — Memorize" intro="Study a position, then rebuild it from memory against the clock." width="medium">
        <Field label="Study time">
          <SegmentedControl ariaLabel="Study time" options={STUDY_OPTIONS} value={studySeconds} onChange={value => setSnap(s => ({ ...s, studySeconds: value }))} />
        </Field>
        <Field label="Positions from">
          <SegmentedControl ariaLabel="Position source" options={SOURCE_OPTIONS} value={source} onChange={value => setSnap(s => ({ ...s, source: value }))} />
        </Field>
        {firstFen && <Status kind="info">The position handed over from the other tool will be the first one to memorize.</Status>}
        <Button variant="primary" onClick={startSession}>
          Start
        </Button>
      </Page>
    );
  }

  if (phase.kind === 'summary') {
    const total = results.reduce((sum, r) => sum + r.score.score, 0);
    const average = results.length > 0 ? total / results.length : 0;
    return (
      <Page title="Visualization trainer — Memorize" width="medium">
        <div className="viz-mem-summary">
          {results.map((r, i) => (
            <div key={i} className="viz-mem-bar-row">
              <span className="viz-mem-bar-label">Position {i + 1}</span>
              <div className="viz-mem-bar-track">
                <div className="viz-mem-bar-fill" style={{ width: `${Math.round(r.score.score * 100)}%` }} />
              </div>
              <span className="viz-mem-bar-pct">{Math.round(r.score.score * 100)}%</span>
            </div>
          ))}
          <p className="viz-summary-score">Average: {Math.round(average * 100)}%</p>
          <Button variant="primary" onClick={playAgain}>
            Play again
          </Button>
        </div>
      </Page>
    );
  }

  // studying, rebuilding, reviewed: all show a board, so all three are a Workbench.
  const roundLabel = (
    <p className="viz-round">
      Position {phase.index + 1} of {sessionFens.length}
    </p>
  );

  if (phase.kind === 'studying') {
    const pos = positionFromFen(phase.fen);
    // Clamped on both ends: never above the studied duration (a stale `now` from the previous
    // phase would otherwise read as momentarily inflated) and never below zero.
    const remainingMs = Math.min(phase.studySeconds * 1000, Math.max(0, phase.endAt - now));
    return (
      <Workbench
        title="Visualization trainer — Memorize"
        board={sizePx => (
          <Board
            fen={phase.fen}
            orientation={ORIENTATION}
            turnColor={turn(pos)}
            dests={EMPTY_DESTS}
            movableColor={undefined}
            check={inCheck(pos)}
            onMove={() => undefined}
            size={`${sizePx}px`}
            drawable={false}
          />
        )}
        primary={<p className="viz-mem-clock">Study it: {Math.ceil(remainingMs / 1000)}s left</p>}
      >
        {roundLabel}
      </Workbench>
    );
  }

  if (phase.kind === 'rebuilding') {
    // Clamped so a stale `now` from the previous phase never reads as a momentary negative time.
    const elapsedMs = Math.max(0, now - phase.startAt);
    return (
      <Workbench
        title="Visualization trainer — Memorize"
        board={sizePx => (
          <BoardEditor
            fen={phase.placement}
            orientation={ORIENTATION}
            onChange={placement => setSnap(s => (s.phase.kind === 'rebuilding' ? { ...s, phase: { ...s.phase, placement } } : s))}
            size={`${Math.max(0, sizePx - EDITOR_PALETTE_RESERVE_PX)}px`}
          />
        )}
        primary={
          <>
            <p className="viz-mem-clock">Rebuilding: {secondsOf(elapsedMs)}s</p>
            <Button variant="primary" onClick={submitRebuild}>
              Done
            </Button>
          </>
        }
      >
        {roundLabel}
      </Workbench>
    );
  }

  // reviewed
  const { score } = phase;
  const originalPos = positionFromFen(phase.fen);
  return (
    <Workbench
      title="Visualization trainer — Memorize"
      board={sizePx => {
        // Two boards share the one square slot Workbench measured for a single board. Above a
        // narrow threshold, each gets half the width (minus a gap) as its own square, side by
        // side; below it (the phone case), each gets the full width instead, so the pair no
        // longer fits one row and flex-wrap actually stacks them — halving would keep "fitting"
        // at any width, never wrapping.
        const pairSize = sizePx < 360 ? sizePx : Math.max(48, Math.floor((sizePx - 12) / 2));
        return (
          <div className="viz-mem-boards">
            <div className="viz-mem-board">
              <p className="viz-mem-board-label">Original</p>
              <Board
                fen={phase.fen}
                orientation={ORIENTATION}
                turnColor={turn(originalPos)}
                dests={EMPTY_DESTS}
                movableColor={undefined}
                check={inCheck(originalPos)}
                onMove={() => undefined}
                size={`${pairSize}px`}
                drawable={false}
              />
            </div>
            <div className="viz-mem-board">
              <p className="viz-mem-board-label">Yours</p>
              {/* The rebuild may not be a legal position (missing/doubled king, ...) while the
               * learner is still working on it, so turnColor/check are fixed rather than read via
               * rules — a decorative flag on a scratch board, not a fabricated evaluation (A1 is
               * about evals, moves and results, not this highlight). */}
              <Board
                fen={phase.placement}
                orientation={ORIENTATION}
                turnColor="white"
                dests={EMPTY_DESTS}
                movableColor={undefined}
                check={false}
                onMove={() => undefined}
                size={`${pairSize}px`}
                drawable={false}
              />
            </div>
          </div>
        );
      }}
      primary={
        <>
          <p className="viz-mem-score">
            {score.correct} / {score.totalOriginalPieces} correct ({Math.round(score.score * 100)}%)
          </p>
          <p className="viz-mem-times">
            Studied {phase.studySeconds}s, rebuilt in {secondsOf(phase.rebuildMs)}s.
          </p>
          <Button variant="primary" onClick={goNext}>
            {phase.index + 1 >= sessionFens.length ? 'See results' : 'Next'}
          </Button>
        </>
      }
    >
      {roundLabel}
      {score.diffs.length > 0 ? (
        <ul className="viz-mem-diffs">
          {score.diffs.map(d => (
            <li key={d.square}>{describeDiff(d)}</li>
          ))}
        </ul>
      ) : (
        <p>Every square correct.</p>
      )}
    </Workbench>
  );
}
