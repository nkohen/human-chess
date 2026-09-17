import { describe, expect, it } from 'vitest';
import { positionEnd, positionFromFen } from '@human-chess/rules';
import { CURATED_ACCOUNTS, curatedEndgames, curatedGameDate, curatedMidgames, curatedOpponent, isCuratedAccount, type CuratedPosition } from './curated';

describe.each([
  ['curatedEndgames', curatedEndgames],
  ['curatedMidgames', curatedMidgames],
] as const)('%s', (_name, pool) => {
  it('is non-empty', () => {
    expect(pool.length).toBeGreaterThan(0);
  });

  it.each(pool)('$id: FEN parses to a legal position via @human-chess/rules', (entry: CuratedPosition) => {
    // positionFromFen is the only path in this test (and in the app) to a Position — it delegates
    // to chessops and throws RulesError on anything illegal, so a position that reaches this
    // assertion without throwing is a real, legal chess position, not merely well-formed text.
    expect(() => positionFromFen(entry.fen)).not.toThrow();
  });

  it('has unique ids', () => {
    const ids = pool.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique FENs', () => {
    const fens = pool.map(e => e.fen);
    expect(new Set(fens).size).toBe(fens.length);
  });

  it.each(pool)('$id: playAs is white or black', (entry: CuratedPosition) => {
    expect(['white', 'black']).toContain(entry.playAs);
  });

  it.each(pool)('$id: url, when present, starts with the recorded site\'s own domain', (entry: CuratedPosition) => {
    if (entry.game.url === undefined) return;
    const domain = entry.game.site === 'chess.com' ? 'https://www.chess.com/' : 'https://lichess.org/';
    expect(entry.game.url.startsWith(domain)).toBe(true);
  });

  it.each(pool)('$id: source matches whether the game has a url (game-record) or not (screenshot-transcription)', (entry: CuratedPosition) => {
    expect(entry.source).toBe(entry.game.url !== undefined ? 'game-record' : 'screenshot-transcription');
  });

  // Names are only assertable when the screenshot showed them at all — one lichess
  // Analysis-screen shot has neither, and that is allowed ("unknown names are allowed").
  // Otherwise the account on the playAs side must be a recognised curated account: chicachoo123
  // on chess.com, nkohen on lichess.org.
  it.each(pool)('$id: when player names are present, the playAs side is the curated account for that site', (entry: CuratedPosition) => {
    const onPlayAsSide = entry.playAs === 'white' ? entry.game.white : entry.game.black;
    if (onPlayAsSide === null) return;
    expect(isCuratedAccount(onPlayAsSide)).toBe(true);
    // chicachoo123 only plays on chess.com and nkohen only on lichess.org, so a mislabelled site
    // would show up here as the wrong account for the site.
    expect(onPlayAsSide.toLowerCase()).toBe(entry.game.site === 'chess.com' ? 'chicachoo123' : 'nkohen');
  });
});

describe('curatedOpponent / curatedGameDate', () => {
  it.each([...curatedEndgames, ...curatedMidgames])('$id: curatedOpponent is the other player, never a curated account, when resolvable', (entry: CuratedPosition) => {
    const opponent = curatedOpponent(entry.game);
    if (opponent === undefined) {
      // Only the one nameless lichess screenshot (and, in principle, a game between two
      // unrecognised names) resolves to undefined.
      expect(isCuratedAccount(entry.game.white ?? '')).toBe(false);
      expect(isCuratedAccount(entry.game.black ?? '')).toBe(false);
      return;
    }
    expect((CURATED_ACCOUNTS as readonly string[]).includes(opponent)).toBe(false);
    expect([entry.game.white, entry.game.black]).toContain(opponent);
  });

  it('curatedGameDate reads the date portion of game.ended', () => {
    const withEnded = curatedEndgames.find(e => e.game.ended !== undefined)!;
    expect(curatedGameDate(withEnded.game)).toBe(withEnded.game.ended!.slice(0, 10));
  });

  it('curatedGameDate is undefined when the game has no recorded end time', () => {
    const withoutEnded = curatedMidgames.find(e => e.game.ended === undefined);
    expect(withoutEnded).toBeDefined();
    expect(curatedGameDate(withoutEnded!.game)).toBeUndefined();
  });
});

describe('id prefixes', () => {
  it('endgame ids all start with eg- and are sanitised to [a-z0-9-]', () => {
    for (const e of curatedEndgames) {
      expect(e.id.startsWith('eg-')).toBe(true);
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('midgame ids all start with mg- and are sanitised to [a-z0-9-]', () => {
    for (const e of curatedMidgames) {
      expect(e.id.startsWith('mg-')).toBe(true);
      expect(e.id).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe('ids across both pools', () => {
  it('are globally unique', () => {
    const ids = [...curatedEndgames, ...curatedMidgames].map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('endgame positions specifically', () => {
  // Endgames are pedagogical material for endgames-intro, but unlike the hard-coded lessons in
  // index.ts these are real positions from real games — some may already be over (e.g. a
  // screenshot taken right at/after mate) or mid-play; no assumption is made here beyond "the
  // FEN is legal", checked above. positionEnd is exercised here only to prove it does not throw.
  it.each(curatedEndgames)('$id: positionEnd does not throw', (entry: CuratedPosition) => {
    expect(() => positionEnd(positionFromFen(entry.fen))).not.toThrow();
  });
});
