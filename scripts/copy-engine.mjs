// Copies the browser Stockfish build (npm package `stockfish`, GPL-3.0) into the web app's
// public folder so it can be loaded as a Web Worker from engine/<file> next to index.html
// (apps/web/src/engine.ts resolves it against document.baseURI). The wasm must sit next to
// its loader script under the same name, which is why it is not imported through Vite.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve from the engine package: pnpm links stockfish only where it is declared.
const require = createRequire(new URL('../packages/engine/package.json', import.meta.url));
const pkgDir = dirname(require.resolve('stockfish/package.json'));
const { buildVersion } = require('stockfish/package.json');
const base = `stockfish-${buildVersion}-lite-single`;
const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'apps', 'web', 'public', 'engine');
mkdirSync(outDir, { recursive: true });
for (const ext of ['js', 'wasm']) {
  const src = join(pkgDir, 'bin', `${base}.${ext}`);
  if (!existsSync(src)) throw new Error(`missing ${src}`);
  copyFileSync(src, join(outDir, `${base}.${ext}`));
}
console.log(`engine: copied ${base}.{js,wasm} to apps/web/public/engine/`);
