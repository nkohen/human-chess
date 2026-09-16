import { useEffect, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { EndgamesIntro } from '@human-chess/endgames-intro';
import { GuessTheEval } from '@human-chess/guess-the-eval';
import { VisualizationTrainer } from '@human-chess/visualization-trainer';
import { HandAndBrain } from '@human-chess/hand-and-brain';
import { OpeningsBuilder } from '@human-chess/openings-builder';
import { loadBrowserEngine } from './engine';

const routes: { hash: string; title: string; blurb: string }[] = [
  { hash: '#/endgames', title: 'Endgames first', blurb: 'Learn chess by winning already-won endgames.' },
  { hash: '#/guess-the-eval', title: 'Guess the eval', blurb: 'Guess how good a position is, then see what the engine says.' },
  { hash: '#/visualization', title: 'Visualization trainer', blurb: 'Read a short line in your head, then answer questions about where it ends.' },
  { hash: '#/hand-and-brain', title: 'Hand and Brain', blurb: 'Two teams on one screen: the brain names a piece type, the hand moves it.' },
  { hash: '#/openings', title: 'Openings builder', blurb: 'Build an opening tree with a multi-line engine beside you, then drill it.' },
];

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
  const engine = useEngine();
  const engineLine = engine instanceof Error ? `engine: failed to load (${engine.message})` : engine ? `engine: ${engine.name}` : 'engine: loading…';
  return (
    <div className="app">
      <header className="app-header">
        <a href="#/">human-chess</a>
        <span className="app-engine">{engineLine}</span>
      </header>
      {hash === '#/endgames' ? (
        <EndgamesIntro engine={engine} />
      ) : hash === '#/guess-the-eval' ? (
        <GuessTheEval engine={engine} />
      ) : hash === '#/visualization' ? (
        <VisualizationTrainer engine={engine} />
      ) : hash === '#/hand-and-brain' ? (
        <HandAndBrain />
      ) : hash === '#/openings' ? (
        <OpeningsBuilder engine={engine instanceof Error ? undefined : engine} />
      ) : (
        <main className="home">
          <h1>human-chess</h1>
          <ul>
            {routes.map(r => (
              <li key={r.hash}>
                <a href={r.hash}>{r.title}</a> — {r.blurb}
              </li>
            ))}
          </ul>
        </main>
      )}
    </div>
  );
}
