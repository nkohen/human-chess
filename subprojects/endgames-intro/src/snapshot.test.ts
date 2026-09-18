import { describe, expect, it } from 'vitest';
import { curatedEndgames, endgameLadder } from '@human-chess/positions';
import { parseEndgamesSnapshot, type EndgamesSnapshot } from './snapshot';

const LESSON = endgameLadder.find(l => l.id === 'two-rooks-open-1')!;
const CURATED = curatedEndgames[0]!; // playAs: 'black', fen has Black to move

const LESSON_SNAPSHOT: EndgamesSnapshot = {
  mode: 'lesson',
  lesson: LESSON,
  curatedEntry: undefined,
  showIntro: false,
  startColor: 'white',
  moves: ['h1h4', 'e5d5'],
};

const CURATED_SNAPSHOT: EndgamesSnapshot = {
  mode: 'curated',
  lesson: LESSON, // the background lesson hook keeps whatever lesson/colour it had, unrelated to curated mode
  curatedEntry: CURATED,
  showIntro: true,
  startColor: 'black',
  moves: ['b1a2', 'c5a4'],
};

// What actually gets stored is lessonId/curatedEntryId, not the resolved objects — mirror that
// round trip rather than JSON.stringify-ing the resolved snapshot directly (same shape as
// chessitout/src/snapshot.test.ts's curated-position test).
function stored(snapshot: EndgamesSnapshot): Record<string, unknown> {
  return { ...snapshot, lesson: undefined, lessonId: snapshot.lesson.id, curatedEntry: undefined, curatedEntryId: snapshot.curatedEntry?.id };
}

describe('parseEndgamesSnapshot', () => {
  it('round-trips a lesson-mode snapshot through JSON, re-resolving the lesson by id', () => {
    const decoded = parseEndgamesSnapshot(JSON.parse(JSON.stringify(stored(LESSON_SNAPSHOT))));
    expect(decoded).toEqual(LESSON_SNAPSHOT);
  });

  it('round-trips a curated-mode snapshot through JSON, re-resolving both the lesson and the curated entry by id', () => {
    const decoded = parseEndgamesSnapshot(JSON.parse(JSON.stringify(stored(CURATED_SNAPSHOT))));
    expect(decoded).toEqual(CURATED_SNAPSHOT);
  });

  it('accepts a lesson-mode snapshot with no curated entry and no moves played yet', () => {
    const snapshot: EndgamesSnapshot = { ...LESSON_SNAPSHOT, showIntro: true, moves: [] };
    expect(parseEndgamesSnapshot(JSON.parse(JSON.stringify(stored(snapshot))))).toEqual(snapshot);
  });

  it('rejects non-object input', () => {
    expect(parseEndgamesSnapshot(null)).toBeUndefined();
    expect(parseEndgamesSnapshot('lesson')).toBeUndefined();
    expect(parseEndgamesSnapshot([1, 2, 3])).toBeUndefined();
  });

  it('rejects a stale/unknown mode', () => {
    expect(parseEndgamesSnapshot({ ...stored(LESSON_SNAPSHOT), mode: 'curated-old' })).toBeUndefined();
  });

  it('rejects a lesson id that is no longer in the ladder', () => {
    expect(parseEndgamesSnapshot({ ...stored(LESSON_SNAPSHOT), lessonId: 'not-a-real-lesson' })).toBeUndefined();
  });

  it('rejects a curated entry id that is no longer in the pool', () => {
    expect(parseEndgamesSnapshot({ ...stored(CURATED_SNAPSHOT), curatedEntryId: 'not-a-real-entry' })).toBeUndefined();
  });

  it("rejects 'curated' mode with no curated entry id", () => {
    const bad = { ...stored(CURATED_SNAPSHOT), curatedEntryId: undefined };
    expect(parseEndgamesSnapshot(bad)).toBeUndefined();
  });

  it('rejects an illegal move list for lesson mode, the whole snapshot at once', () => {
    const bad = { ...stored(LESSON_SNAPSHOT), moves: ['h1h4', 'h1h4'] }; // second move: rook no longer there
    expect(parseEndgamesSnapshot(bad)).toBeUndefined();
  });

  it('rejects an illegal move list for curated mode', () => {
    const bad = { ...stored(CURATED_SNAPSHOT), moves: ['a1a2'] }; // no piece on a1 in that position
    expect(parseEndgamesSnapshot(bad)).toBeUndefined();
  });

  it('rejects malformed showIntro/startColor fields', () => {
    expect(parseEndgamesSnapshot({ ...stored(LESSON_SNAPSHOT), showIntro: 'yes' })).toBeUndefined();
    expect(parseEndgamesSnapshot({ ...stored(LESSON_SNAPSHOT), startColor: 'blue' })).toBeUndefined();
  });
});
