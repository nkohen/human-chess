// Local-only primary keys for lessons and steps: same scheme as the openings builder's
// repertoire ids (subprojects/openings-builder/src/repertoire.ts's genId) — a base36 timestamp
// plus a random suffix, good enough for "unique within one browser's storage" without pulling in
// crypto.randomUUID. Pure and side-effect-free apart from Date.now()/Math.random(), so it is
// trivially unit-testable for shape and uniqueness.
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function genLessonId(): string {
  return genId('lesson');
}

export function genStepId(): string {
  return genId('step');
}
