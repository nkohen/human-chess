// Test-only helpers shared by this package's own tests and by every site-client instance's
// tests (packages/lichess, packages/chesscom, packages/import) — extracted 2026-09-17 so the
// in-memory localStorage shim and JSON Response builder exist in exactly one place (A2/R1).
// packages/lichess's test files predate this extraction and are left untouched (their own
// copies stay byte-identical to what's here) rather than risk changing their behaviour.

/** A minimal in-memory `Storage`, standing in for `localStorage` in Node's test environment
 * (there is no jsdom in this project). */
export class MemoryStorage implements Storage {
  protected store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

/** Builds a JSON `Response`, defaulting to a `{}` body and no extra headers — the common shape
 * every site-client test needs for a successful or error API response. */
export function jsonResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}
