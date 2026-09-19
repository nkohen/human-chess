import { useEffect, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { completeLichessLogin, installLichessAuth } from '@human-chess/lichess';
import { AppShell, Card, CardGrid, Page, routeOf } from '@human-chess/ui';
import { EndgamesIntro } from '@human-chess/endgames-intro';
import { GuessTheEval } from '@human-chess/guess-the-eval';
import { VisualizationTrainer } from '@human-chess/visualization-trainer';
import { HandAndBrain } from '@human-chess/hand-and-brain';
import { OpeningsBuilder } from '@human-chess/openings-builder';
import { MemoryTrainer } from '@human-chess/memory-trainer';
import { OpeningTrainingGame } from '@human-chess/opening-training-game';
import { BotRatingTest } from '@human-chess/bot-rating-test';
import { Puzzles } from '@human-chess/puzzles';
import { Chessitout } from '@human-chess/chessitout';
import { GameReviewer } from '@human-chess/game-reviewer';
import { LessonBuilder } from '@human-chess/lesson-builder';
import { loadBrowserEngine } from './engine';
import './app.css';

/** Public source repository and the deployed revision, injected at build time by
 * scripts/deploy-web.sh; both undefined in dev. The link points at the exact commit so the source
 * offer matches the build. */
const SOURCE_URL: string | undefined = import.meta.env.VITE_SOURCE_URL || undefined;
const SOURCE_REV: string | undefined = import.meta.env.VITE_SOURCE_REV || undefined;
const SOURCE_LINK = SOURCE_URL && (SOURCE_REV ? `${SOURCE_URL.replace(/\/$/, '')}/tree/${SOURCE_REV}` : SOURCE_URL);

const routes: { hash: string; title: string; blurb: string }[] = [
  { hash: '#/endgames', title: 'Endgames first', blurb: 'Learn chess by winning already-won endgames.' },
  { hash: '#/guess-the-eval', title: 'Guess the eval', blurb: 'Guess how good a position is, then see what the engine says.' },
  { hash: '#/visualization', title: 'Visualization trainer', blurb: 'Read a short line in your head, then answer questions about where it ends.' },
  { hash: '#/hand-and-brain', title: 'Hand and Brain', blurb: 'Two teams on one screen: the brain names a piece type, the hand moves it.' },
  { hash: '#/openings', title: 'Openings builder', blurb: 'Build an opening tree with a multi-line engine beside you, then drill it.' },
  { hash: '#/memory', title: 'Memory trainer', blurb: 'Replay your latest game from memory, then see where it diverged.' },
  { hash: '#/opening-game', title: 'Opening training game', blurb: 'Play N moves against a rated engine; the engine judges who stands better.' },
  { hash: '#/bot-rating', title: 'Bot-rating test', blurb: 'Play engines at set Elo levels and keep the record of what you beat.' },
  { hash: '#/puzzles', title: 'Puzzles', blurb: 'Solve lichess puzzles, one after another.' },
  { hash: '#/chessitout', title: 'Chessitout (solo)', blurb: 'Judge an imbalanced position, then play your side out against a rated engine.' },
  { hash: '#/review', title: 'Game reviewer', blurb: 'Import a game and see every move evaluated, classified, and compared with the best.' },
  { hash: '#/lesson-builder', title: 'Lesson Builder', blurb: 'Author a lesson: a sequence of positions, notes, arrows and move-challenges. No code needed.' },
];

// Module-level (not component state) so React 19 StrictMode's dev-only double-invoke of the
// effect below reuses the same in-flight promise instead of exchanging the same OAuth code
// twice: the second call's completeLichessLogin() would otherwise race the first, since the URL
// isn't cleaned (and the code hasn't been consumed) until the first call's await resolves.
let lichessLoginCompletion: Promise<unknown> | undefined;

function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

function useEngine(): UciEngine | Error | undefined {
  const [engine, setEngine] = useState<UciEngine | Error | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let e: UciEngine | undefined;
    loadBrowserEngine()
      .then(loaded => {
        if (cancelled) {
          loaded.quit();
          return;
        }
        e = loaded;
        setEngine(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) setEngine(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
      e?.quit();
    };
  }, []);
  return engine;
}

export function App(): React.JSX.Element {
  const hash = useHash();
  // Hand-offs (packages/ui/src/handoff.ts) attach "?fen=...&color=..." after the route, so
  // routing compares on the part before '?', never on the raw hash — otherwise every subproject
  // linked to with a hand-off would fall through to the home page.
  const route = routeOf(hash);
  const engine = useEngine();
  const engineLine = engine instanceof Error ? `engine: failed to load (${engine.message})` : engine ? `engine: ${engine.name}` : 'engine: loading…';

  useEffect(() => {
    installLichessAuth();
    lichessLoginCompletion ??= completeLichessLogin().catch((err: unknown) => {
      // A failed login (bad state, lichess-reported error, ...) shouldn't break the rest of the
      // app; the user can just try logging in again from the opening explorer's LichessLogin.
      console.error('lichess login did not complete:', err);
    });
  }, []);

  return (
    <AppShell brand={<a href="#/">human-chess</a>} right={<span className="app-engine">{engineLine}</span>}>
      {/* The three hand-off receivers (packages/ui/src/handoff.ts) read their ?params once on
          mount, so they are keyed on the full hash: a new hand-off to a route already showing
          remounts them instead of leaving the URL and the state to diverge. */}
      {route === '#/endgames' ? (
        <EndgamesIntro engine={engine} />
      ) : route === '#/guess-the-eval' ? (
        <GuessTheEval engine={engine} />
      ) : route === '#/visualization' ? (
        <VisualizationTrainer key={hash} engine={engine} />
      ) : route === '#/hand-and-brain' ? (
        <HandAndBrain />
      ) : route === '#/memory' ? (
        <MemoryTrainer />
      ) : route === '#/opening-game' ? (
        <OpeningTrainingGame engine={engine} />
      ) : route === '#/bot-rating' ? (
        <BotRatingTest key={hash} engine={engine} />
      ) : route === '#/puzzles' ? (
        <Puzzles />
      ) : route === '#/chessitout' ? (
        <Chessitout engine={engine} />
      ) : route === '#/review' ? (
        <GameReviewer key={hash} engine={engine} />
      ) : route === '#/openings' ? (
        <OpeningsBuilder engine={engine} />
      ) : route === '#/lesson-builder' ? (
        <LessonBuilder engine={engine} />
      ) : (
        <Page width="wide">
          <CardGrid>
            {routes.map(r => (
              <Card key={r.hash} title={r.title} blurb={r.blurb} href={r.hash} />
            ))}
          </CardGrid>
          {/* The source offer the licences require once the site is published (AGPL-3.0 §13 for
              the app, GPL-3.0 for the shipped Stockfish wasm — memory/reuse-library.md):
              VITE_SOURCE_URL is set by scripts/deploy-web.sh from HC_SOURCE_URL and left unset in
              dev, where the line simply names the pieces. */}
          <p className="app-colophon">
            {SOURCE_LINK ? (
              <>
                <a href={SOURCE_LINK}>Source code</a>
                {SOURCE_REV ? ` (revision ${SOURCE_REV}, AGPL-3.0-or-later).` : ' (AGPL-3.0-or-later).'}{' '}
              </>
            ) : (
              <>human-chess is AGPL-3.0-or-later. </>
            )}
            Rules by <a href="https://github.com/niklasf/chessops">chessops</a>, board by{' '}
            <a href="https://github.com/lichess-org/chessground">chessground</a>, engine{' '}
            <a href="https://github.com/nmrugg/stockfish.js">Stockfish 19 (stockfish.js 19.0.0)</a>, all GPL-3.0.
          </p>
        </Page>
      )}
    </AppShell>
  );
}
