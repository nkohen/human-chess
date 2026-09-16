import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import type { UciTransport } from './uci';

/** A native UCI engine as a child process, e.g. the Stockfish binary (GPL-3.0, unmodified). */
export class ProcessTransport implements UciTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly callbacks = new Set<(line: string) => void>();
  private readonly errors = new Set<(err: Error) => void>();
  private closing = false;

  constructor(path: string) {
    this.child = spawn(path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: this.child.stdout }).on('line', line => {
      for (const cb of this.callbacks) cb(line);
    });
    this.child.on('error', err => this.emitError(err));
    this.child.on('exit', (code, signal) => {
      if (!this.closing) this.emitError(new Error(`engine process ${path} exited (code ${code}, signal ${signal})`));
    });
    this.child.stdin.on('error', err => this.emitError(err));
  }

  send(line: string): void {
    this.child.stdin.write(line + '\n');
  }

  onLine(cb: (line: string) => void): void {
    this.callbacks.add(cb);
  }

  onError(cb: (err: Error) => void): void {
    this.errors.add(cb);
  }

  close(): void {
    this.closing = true;
    this.child.stdin.end();
    this.child.kill();
  }

  private emitError(err: Error): void {
    for (const cb of this.errors) cb(err);
  }
}

interface NmruggEngine {
  listener?: (line: string) => void;
  sendCommand(cmd: string): void;
  terminate?(): void;
}

/**
 * The same wasm build the browser uses (npm `stockfish`, lite single-threaded), loaded in
 * Node through the package's own loader. Slower than a native binary but present on every
 * machine that ran `pnpm install`, so tests can rely on it.
 */
export class NodeWasmTransport implements UciTransport {
  private engine: NmruggEngine | undefined;
  private readonly callbacks = new Set<(line: string) => void>();
  private readonly errors = new Set<(err: Error) => void>();
  private readonly pending: string[] = [];
  readonly ready: Promise<void>;

  constructor(flavor: 'lite-single' | 'single' | 'lite' | 'full' = 'lite-single') {
    const require = createRequire(import.meta.url);
    const init = require('stockfish') as (flavor: string) => Promise<NmruggEngine>;
    this.ready = init(flavor).then(engine => {
      engine.listener = (line: string) => {
        for (const cb of this.callbacks) cb(line);
      };
      this.engine = engine;
      for (const cmd of this.pending.splice(0)) engine.sendCommand(cmd);
    });
    this.ready.catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err));
      for (const cb of this.errors) cb(e);
    });
  }

  send(line: string): void {
    if (this.engine) this.engine.sendCommand(line);
    else this.pending.push(line);
  }

  onLine(cb: (line: string) => void): void {
    this.callbacks.add(cb);
  }

  onError(cb: (err: Error) => void): void {
    this.errors.add(cb);
  }

  close(): void {
    this.engine?.terminate?.();
  }
}
