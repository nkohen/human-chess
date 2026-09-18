import { UciEngine, WorkerTransport } from '@human-chess/engine';

/**
 * The browser engine: the lite single-threaded Stockfish build copied by scripts/copy-engine.mjs.
 * Single-threaded so the page needs no cross-origin isolation headers. The file name must match
 * what that script copies; a mismatch surfaces as an engine load error, never as a silent fallback.
 */
// Resolved against the document, not the origin: on the GitHub Pages deployment the app lives
// under /human-chess/, and hash routing keeps document.baseURI at the app's own index.html.
export const ENGINE_SCRIPT_URL = new URL('engine/stockfish-19-lite-single.js', document.baseURI).href;

export async function loadBrowserEngine(): Promise<UciEngine> {
  const engine = new UciEngine(new WorkerTransport(ENGINE_SCRIPT_URL));
  await engine.init();
  return engine;
}
