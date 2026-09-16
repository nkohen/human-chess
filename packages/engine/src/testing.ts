import { existsSync } from 'node:fs';
import { NodeWasmTransport, ProcessTransport } from './node';
import { UciEngine } from './uci';

/**
 * Engines available to tests on this machine. The wasm build is always there after install;
 * a native Stockfish is added when STOCKFISH_PATH points at one or a homebrew install exists.
 */
export function testEngines(): { label: string; open: () => UciEngine }[] {
  const engines = [{ label: 'stockfish wasm (lite-single)', open: () => new UciEngine(new NodeWasmTransport()) }];
  const native = process.env['STOCKFISH_PATH'] ?? '/opt/homebrew/bin/stockfish';
  if (existsSync(native)) engines.push({ label: `native ${native}`, open: () => new UciEngine(new ProcessTransport(native)) });
  return engines;
}
