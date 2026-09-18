import { describe, expect, it } from 'vitest';
import { toImportedGame, toImportedGames } from './parse';

function pgn(headers: Record<string, string>, moves = '1. e4 e5 *'): string {
  const lines = Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`);
  return `${lines.join('\n')}\n\n${moves}\n`;
}

describe('toImportedGame meta: speed + rated from the lichess [Event] header', () => {
  it.each([
    ['Rated Blitz game', 'blitz', true],
    ['Casual Bullet game', 'bullet', false],
    ['Rated UltraBullet game', 'ultraBullet', true],
    ['Casual Rapid game', 'rapid', false],
    ['Rated Classical game', 'classical', true],
    ['Rated Correspondence game', 'correspondence', true],
    // Case-insensitive on both the rated/casual word and the speed word.
    ['rated BLITZ game', 'blitz', true],
    ['CASUAL bullet GAME', 'bullet', false],
  ] as const)('Event %j -> speed %j, rated %j', (event, speed, rated) => {
    const game = toImportedGame('lichess', pgn({ Event: event }));
    expect(game.meta?.speed).toBe(speed);
    expect(game.meta?.rated).toBe(rated);
  });

  it('an Event header that does not name one of the six perf types leaves speed undefined', () => {
    const game = toImportedGame('lichess', pgn({ Event: 'Rated Chess960 game' }));
    expect(game.meta?.speed).toBeUndefined();
    // "rated"/"casual" is still readable even when the speed word is unrecognised.
    expect(game.meta?.rated).toBe(true);
  });

  it('no Event header at all leaves both speed and rated undefined', () => {
    const game = toImportedGame('lichess', pgn({}));
    expect(game.meta?.speed).toBeUndefined();
    expect(game.meta?.rated).toBeUndefined();
  });

  it('a tournament Event ("Rated Blitz tournament https://…") still reads speed/rated, URL and all', () => {
    const game = toImportedGame('lichess', pgn({ Event: 'Rated Blitz tournament https://lichess.org/tournament/abc123' }));
    expect(game.meta?.speed).toBe('blitz');
    expect(game.meta?.rated).toBe(true);
  });

  it('a simul Event with no Rated/Casual word ("Blitz simul https://…") reads speed, leaves rated undefined', () => {
    const game = toImportedGame('lichess', pgn({ Event: 'Blitz simul https://lichess.org/simul/xyz789' }));
    expect(game.meta?.speed).toBe('blitz');
    expect(game.meta?.rated).toBeUndefined();
  });
});

describe('toImportedGame meta: TimeControl header', () => {
  it('parses "180+2" into initialSeconds/incrementSeconds', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '180+2' }));
    expect(game.meta?.timeControl).toEqual({ initialSeconds: 180, incrementSeconds: 2 });
  });

  it('parses a bare seconds value (chess.com style, no increment) as incrementSeconds: 0', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '300' }));
    expect(game.meta?.timeControl).toEqual({ initialSeconds: 300, incrementSeconds: 0 });
  });

  it('"-" (no clock) gives undefined, not a fabricated zero clock', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '-' }));
    expect(game.meta?.timeControl).toBeUndefined();
  });

  it('an unparseable TimeControl gives undefined', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: 'garbage' }));
    expect(game.meta?.timeControl).toBeUndefined();
  });
});

describe('toImportedGame meta: speed derived from TimeControl when Event does not name one (lichess Speed rule, first guess)', () => {
  it('15+0 (estimate 15s) -> ultraBullet', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '15+0' }));
    expect(game.meta?.speed).toBe('ultraBullet');
  });

  it('60+0 (estimate 60s) -> bullet', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '60+0' }));
    expect(game.meta?.speed).toBe('bullet');
  });

  it('300+0 (estimate 300s) -> blitz', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '300+0' }));
    expect(game.meta?.speed).toBe('blitz');
  });

  it('600+0 (estimate 600s) -> rapid', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '600+0' }));
    expect(game.meta?.speed).toBe('rapid');
  });

  it('1800+0 (estimate 1800s) -> classical', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '1800+0' }));
    expect(game.meta?.speed).toBe('classical');
  });

  it('increment counts 40x toward the estimate: 60+30 (estimate 60+1200=1260s) -> rapid, not bullet', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '60+30' }));
    expect(game.meta?.speed).toBe('rapid');
  });

  it('an Event-named speed wins over the TimeControl estimate when both are present', () => {
    const game = toImportedGame('lichess', pgn({ Event: 'Rated Bullet game', TimeControl: '1800+0' }));
    expect(game.meta?.speed).toBe('bullet');
  });

  it('no clock at all (TimeControl "-") leaves speed undefined, not a fabricated guess', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '-' }));
    expect(game.meta?.speed).toBeUndefined();
  });

  it('21600+0 (estimate exactly 21600s / 6h) -> correspondence, the lila byTime boundary', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '21600+0' }));
    expect(game.meta?.speed).toBe('correspondence');
  });

  it('a very large estimate (e.g. 604800+0, one week) -> correspondence', () => {
    const game = toImportedGame('lichess', pgn({ TimeControl: '604800+0' }));
    expect(game.meta?.speed).toBe('correspondence');
  });
});

describe('toImportedGame meta: WhiteElo/BlackElo', () => {
  it('parses numeric ratings', () => {
    const game = toImportedGame('lichess', pgn({ WhiteElo: '1850', BlackElo: '1900' }));
    expect(game.meta?.whiteElo).toBe(1850);
    expect(game.meta?.blackElo).toBe(1900);
  });

  it('a non-numeric rating ("?", a guest/unrated player) gives undefined, never NaN', () => {
    const game = toImportedGame('lichess', pgn({ WhiteElo: '?', BlackElo: '1900' }));
    expect(game.meta?.whiteElo).toBeUndefined();
    expect(game.meta?.blackElo).toBe(1900);
  });

  it('missing headers give undefined', () => {
    const game = toImportedGame('lichess', pgn({}));
    expect(game.meta?.whiteElo).toBeUndefined();
    expect(game.meta?.blackElo).toBeUndefined();
  });
});

describe('toImportedGame meta: ECO/Opening', () => {
  it('passes ECO and Opening headers through as-is', () => {
    const game = toImportedGame('lichess', pgn({ ECO: 'C50', Opening: 'Italian Game' }));
    expect(game.meta?.eco).toBe('C50');
    expect(game.meta?.openingName).toBe('Italian Game');
  });

  it('missing headers give undefined', () => {
    const game = toImportedGame('lichess', pgn({}));
    expect(game.meta?.eco).toBeUndefined();
    expect(game.meta?.openingName).toBeUndefined();
  });
});

describe('toImportedGame meta: overrides win for speed/rated/whiteElo/blackElo only', () => {
  it('an override speed/rated/elo beats the header-derived values', () => {
    const game = toImportedGame(
      'chess.com',
      pgn({ Event: 'Rated Blitz game', WhiteElo: '1500', BlackElo: '1490' }),
      undefined,
      { meta: { speed: 'rapid', rated: false, whiteElo: 1600, blackElo: 1610 } },
    );
    expect(game.meta?.speed).toBe('rapid');
    expect(game.meta?.rated).toBe(false);
    expect(game.meta?.whiteElo).toBe(1600);
    expect(game.meta?.blackElo).toBe(1610);
  });

  it('an override does not touch eco/openingName/timeControl, which always come from headers', () => {
    const game = toImportedGame(
      'chess.com',
      pgn({ ECO: 'C50', Opening: 'Italian Game', TimeControl: '300+0' }),
      undefined,
      { meta: { speed: 'bullet' } },
    );
    expect(game.meta?.eco).toBe('C50');
    expect(game.meta?.openingName).toBe('Italian Game');
    expect(game.meta?.timeControl).toEqual({ initialSeconds: 300, incrementSeconds: 0 });
  });

  it('an undefined override field falls back to the header-derived value, not undefined', () => {
    const game = toImportedGame('chess.com', pgn({ Event: 'Rated Blitz game' }), undefined, {
      meta: { whiteElo: 1600 },
    });
    expect(game.meta?.speed).toBe('blitz');
    expect(game.meta?.rated).toBe(true);
    expect(game.meta?.whiteElo).toBe(1600);
  });
});

describe('toImportedGames (multi-game path): meta is computed per game from that game’s own headers', () => {
  it('two games with different Event/TimeControl headers each get their own meta', () => {
    const twoGames = `${pgn({ Event: 'Rated Blitz game', WhiteElo: '1500', BlackElo: '1490' })}\n${pgn({
      Event: 'Casual Bullet game',
      WhiteElo: '1200',
      BlackElo: '1210',
    })}`;
    const { games } = toImportedGames('lichess', twoGames);
    expect(games).toHaveLength(2);
    expect(games[0]!.meta?.speed).toBe('blitz');
    expect(games[0]!.meta?.rated).toBe(true);
    expect(games[0]!.meta?.whiteElo).toBe(1500);
    expect(games[1]!.meta?.speed).toBe('bullet');
    expect(games[1]!.meta?.rated).toBe(false);
    expect(games[1]!.meta?.whiteElo).toBe(1200);
  });
});
