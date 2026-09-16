import { useEffect, useState } from 'react';
import type { UciEngine } from '@human-chess/engine';
import { EndgamesIntro } from '@human-chess/endgames-intro';
import { loadBrowserEngine } from './engine';

const routes: { hash: string; title: string; blurb: string }[] = [
  { hash: '#/endgames', title: 'Endgames first', blurb: 'Learn chess by winning already-won endgames.' },
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
