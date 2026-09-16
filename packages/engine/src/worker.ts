import type { UciTransport } from './uci';

/**
 * Talks UCI to a Stockfish build running in a Web Worker: the npm package `stockfish`
 * (nmrugg/stockfish.js, GPL-3.0). Its worker takes one UCI command per postMessage and
 * answers with one string per output line.
 */
export class WorkerTransport implements UciTransport {
  private readonly worker: Worker;
  private readonly callbacks = new Set<(line: string) => void>();
  private readonly errors = new Set<(err: Error) => void>();

  constructor(scriptUrl: string) {
    this.worker = new Worker(scriptUrl);
    this.worker.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') for (const cb of this.callbacks) cb(e.data);
    };
    this.worker.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message || `worker at ${scriptUrl} failed to load`);
      for (const cb of this.errors) cb(err);
    };
  }

  onError(cb: (err: Error) => void): void {
    this.errors.add(cb);
  }

  send(line: string): void {
    this.worker.postMessage(line);
  }

  onLine(cb: (line: string) => void): void {
    this.callbacks.add(cb);
  }

  close(): void {
    this.worker.terminate();
  }
}
