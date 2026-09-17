// Curated positions from the user's own games (chess.com account chicachoo123, screenshots
// supplied 2026-09-17; lichess.org account nkohen, more endgame screenshots supplied and
// transcribed 2026-09-17). Every 'game-record' position's FEN is taken from the real fetched
// game record; every 'screenshot-transcription' position's FEN was read off the screenshot
// itself (two independent passes that agreed, or the coordinator's own adjudication from the
// image when they disagreed — see that entry's `note`), since not every game could be matched
// back to a fetchable record. Either way the FEN is never invented — curated.test.ts checks
// every one parses to a legal position via @human-chess/rules (never chessops directly).
// `siteEvalShown`, when present, records what the site's own analysis screen displayed at
// capture time; it is provenance only and must never be shown to the user as an evaluation — A1
// requires every evaluation the user sees to come from our own engine at run time (see
// curatedEval.ts's `evaluateCuratedMidgame`, and EndgamesIntro.tsx's own starting-position
// analyse call).
//
// More entries will be appended here over time; the pools below stay plain array literals for
// exactly that reason — easy to extend, nothing to regenerate.
import type { Color } from '@human-chess/rules';

export interface CuratedGameRef {
  site: 'chess.com' | 'lichess.org';
  url?: string;
  /** null for the one screenshot with no visible player names (an Analysis-screen shot). */
  white: string | null;
  black: string | null;
  ended?: string;
  /** chess.com-style, e.g. "blitz". */
  timeClass?: string;
  /** lichess-style, e.g. "3+2 • Blitz • Rated". */
  timeControl?: string;
  ply?: number;
  lastMove?: string;
  /** Why this game has no url / could not be matched to a fetchable record, when relevant. */
  note?: string;
}

export interface CuratedPosition {
  id: string;
  fen: string;
  playAs: Color;
  game: CuratedGameRef;
  screenshot: string;
  siteEvalShown?: string;
  /** 'game-record': the FEN came from a real fetched game record (the game has a `url` into
   * it). 'screenshot-transcription': the FEN was read off the screenshot itself — still never
   * invented (see the header comment), but a transcription rather than a fetched record, so a
   * single square could in principle be wrong. */
  source: 'game-record' | 'screenshot-transcription';
  /** Extra transcription-confidence detail for a 'screenshot-transcription' entry, e.g. "A/B
   * differed on b4; image shows a white pawn (coordinator adjudication)". Not shown verbatim in
   * the UI; surfaced as a title/tooltip so the user can gauge confidence. */
  note?: string;
}

/** The accounts these positions are drawn from: chicachoo123 on chess.com (user, 2026-09-15),
 * nkohen on lichess.org (coordinator, 2026-09-17). */
export const CURATED_ACCOUNTS = ['chicachoo123', 'nkohen'] as const;
export type CuratedAccount = (typeof CURATED_ACCOUNTS)[number];

export function isCuratedAccount(name: string): boolean {
  return (CURATED_ACCOUNTS as readonly string[]).includes(name);
}

/** Lowercases and collapses every run of characters outside [a-z0-9] to a single '-', trimming
 * leading/trailing '-', so a screenshot filename becomes a safe id fragment. */
function slug(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Drops a screenshot filename's extension. */
function stemOf(screenshot: string): string {
  return screenshot.replace(/\.[a-zA-Z0-9]+$/, '');
}

function endgame(entry: Omit<CuratedPosition, 'id'>): CuratedPosition {
  return { id: `eg-${slug(stemOf(entry.screenshot))}`, ...entry };
}

function midgame(entry: Omit<CuratedPosition, 'id'>): CuratedPosition {
  return { id: `mg-${slug(stemOf(entry.screenshot))}`, ...entry };
}

/** The other player in a curated game — whichever side is NOT a recognised curated account.
 * Undefined when neither recorded name (possibly null) is a curated account, e.g. the one
 * screenshot with no visible names at all. */
export function curatedOpponent(game: CuratedGameRef): string | undefined {
  if (game.white && isCuratedAccount(game.white)) return game.black ?? undefined;
  if (game.black && isCuratedAccount(game.black)) return game.white ?? undefined;
  return undefined;
}

/** The date portion of `game.ended` (e.g. "2024-10-19" from "2024-10-19T14:54"), or undefined
 * when the game has no recorded end time (most lichess entries here, and the one chess.com entry
 * replayed from a move list outside the archive window a fetch could reach). */
export function curatedGameDate(game: CuratedGameRef): string | undefined {
  return game.ended?.slice(0, 10);
}

export const curatedEndgames: CuratedPosition[] = [
  endgame({
    fen: "6k1/5p1p/p1p2p2/2N5/8/2P3P1/5PP1/1b4K1 b - - 0 27",
    playAs: "black",
    screenshot: "Screenshot_20241019-105604.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/123088218261", white: "Spartan923", black: "chicachoo123", ended: "2024-10-19T14:54", timeClass: "blitz", ply: 53, lastMove: "c3" },
    siteEvalShown: "-1.69",
    source: "game-record",
  }),
  endgame({
    fen: "8/6p1/4P1p1/1k1p4/3Kp2P/1P6/8/8 b - - 0 46",
    playAs: "black",
    screenshot: "Screenshot_20241022-171813.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/123369601453", white: "Chief007", black: "chicachoo123", ended: "2024-10-22T21:15", timeClass: "rapid", ply: 91, lastMove: "e6" },
    siteEvalShown: "-4.13",
    source: "game-record",
  }),
  endgame({
    fen: "8/5p2/4k3/1B1pN2p/3P4/4K3/8/8 w - - 1 44",
    playAs: "white",
    screenshot: "Screenshot_20241101-192227.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/124241946695", white: "chicachoo123", black: "Squirrel373", ended: "2024-11-01T23:21", timeClass: "bullet", ply: 86, lastMove: "Ke6" },
    siteEvalShown: "+4.67",
    source: "game-record",
  }),
  endgame({
    fen: "8/R1R2p1p/4b1pk/8/3K1NP1/P6P/8/5r2 w - - 3 46",
    playAs: "white",
    screenshot: "Screenshot_20241108-010253.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/124783771327", white: "chicachoo123", black: "jonno09", ended: "2024-11-08T06:00", timeClass: "blitz", ply: 90, lastMove: "Rf1" },
    siteEvalShown: "+5.51",
    source: "game-record",
  }),
  endgame({
    fen: "3r4/2k4p/p4p1B/1p6/1Pp5/P4P2/B1P3PP/3R2K1 b - - 0 28",
    playAs: "black",
    screenshot: "Screenshot_20241108-021223.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/124787972087", white: "mc_nerbz10", black: "chicachoo123", ended: "2024-11-08T07:09", timeClass: "blitz", ply: 55, lastMove: "Bxh6" },
    siteEvalShown: "-2.43",
    source: "game-record",
  }),
  endgame({
    fen: "6k1/5ppp/3bp3/p1p5/2P2P2/1P4P1/P6P/6K1 w - - 0 29",
    playAs: "black",
    screenshot: "Screenshot_20241111-164504.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/125099947243", white: "joehuelsman", black: "chicachoo123", ended: "2024-11-11T21:44", timeClass: "blitz", ply: 56, lastMove: "Bxd6" },
    siteEvalShown: "-4.65",
    source: "game-record",
  }),
  endgame({
    fen: "8/2b5/8/3P4/1K6/P4k1P/8/8 w - - 0 58",
    playAs: "white",
    screenshot: "Screenshot_20241115-145450.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/125438343553", white: "chicachoo123", black: "MIZ6", ended: "2024-11-15T19:53", timeClass: "rapid", ply: 114, lastMove: "Kxf3" },
    siteEvalShown: "+3.94",
    source: "game-record",
  }),
  endgame({
    fen: "6k1/4BpPp/4p3/8/1Kp1P3/5P2/5r2/8 b - - 1 40",
    playAs: "black",
    screenshot: "Screenshot_20241118-212328.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/125720900799", white: "sergio-abreu", black: "chicachoo123", ended: "2024-11-19T02:21", timeClass: "rapid", ply: 79, lastMove: "Kb4" },
    siteEvalShown: "-5.23",
    source: "game-record",
  }),
  endgame({
    fen: "8/8/5Rp1/7p/2p4P/5kP1/2r5/5K2 b - - 11 51",
    playAs: "black",
    screenshot: "Screenshot_20241120-220853.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/125896721023", white: "gab1812", black: "chicachoo123", ended: "2024-11-21T03:06", timeClass: "blitz", ply: 101, lastMove: "Rf6+" },
    siteEvalShown: "-4.11",
    source: "game-record",
  }),
  endgame({
    fen: "1q5r/6pp/5b1k/8/8/7Q/6PP/4R2K b - - 17 42",
    playAs: "black",
    screenshot: "Screenshot_20241127-105254.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/126422926707", white: "aquillas1990", black: "chicachoo123", ended: "2024-11-27T05:21", timeClass: "rapid", ply: 83, lastMove: "Qh3+" },
    siteEvalShown: "-2.50",
    source: "game-record",
  }),
  endgame({
    fen: "6k1/6pp/pB1p3r/P7/8/2K2P1P/6P1/8 b - - 0 39",
    playAs: "black",
    screenshot: "Screenshot_20241206-150816.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/127254025785", white: "jtorres1080", black: "chicachoo123", ended: "2024-12-06T20:07", timeClass: "blitz", ply: 77, lastMove: "Kxc3" },
    siteEvalShown: "-4.32",
    source: "game-record",
  }),
  endgame({
    fen: "3r2k1/p5pp/8/1p1P4/2r5/b1P3P1/P1R2K1P/3R4 b - - 0 27",
    playAs: "black",
    screenshot: "Screenshot_20241220-161705.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/128470975501", white: "ronizl", black: "chicachoo123", ended: "2024-12-20T22:15", timeClass: "rapid", ply: 53, lastMove: "d5" },
    siteEvalShown: "-4.46",
    source: "game-record",
  }),
  endgame({
    fen: "8/3k1p1p/p3p1p1/3p1b2/3P4/4P1P1/5PP1/R5K1 w - - 0 30",
    playAs: "white",
    screenshot: "Screenshot_20241223-164024.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/128731408489", white: "chicachoo123", black: "actContact", ended: "2024-12-23T22:36", timeClass: "rapid", ply: 58, lastMove: "Kxd7" },
    siteEvalShown: "+2.40",
    source: "game-record",
  }),
  endgame({
    fen: "8/8/4pRp1/3p1b2/3PkP2/4P3/5KP1/8 w - - 5 43",
    playAs: "white",
    screenshot: "Screenshot_20241223-164850.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/128731408489", white: "chicachoo123", black: "actContact", ended: "2024-12-23T22:36", timeClass: "rapid", ply: 84, lastMove: "Bf5" },
    siteEvalShown: "+8.01",
    source: "game-record",
  }),
  endgame({
    fen: "r1b5/p4pkp/4p1p1/1p6/2R1N3/1P2P3/P4PPP/6K1 w - - 0 23",
    playAs: "white",
    screenshot: "Screenshot_20241223-170754.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/128733185679", white: "chicachoo123", black: "Farfocel4333", ended: "2024-12-23T23:04", timeClass: "rapid", ply: 44, lastMove: "b5" },
    siteEvalShown: "+2.29 (top engine line); alternate line +0.59",
    source: "game-record",
  }),
  endgame({
    fen: "8/5pk1/P1R4p/5p2/8/6P1/r4PKP/8 w - - 0 31",
    playAs: "white",
    screenshot: "Screenshot_20241224-171626.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/128820149555", white: "chicachoo123", black: "ffierrojr", ended: "2024-12-24T23:12", timeClass: "rapid", ply: 60, lastMove: "f5" },
    siteEvalShown: "+2.27",
    source: "game-record",
  }),
  endgame({
    fen: "6k1/5p2/r3p1pp/P1Pp4/3P4/2n1PN2/5PPP/R5K1 w - - 0 28",
    playAs: "white",
    screenshot: "Screenshot_20241224-223303.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/128839347377", white: "chicachoo123", black: "gnarledbrain", ended: "2024-12-25T04:24", timeClass: "blitz", ply: 54, lastMove: "Rxa6" },
    siteEvalShown: "+3.92",
    source: "game-record",
  }),
  endgame({
    fen: "1r4k1/1p1R1p2/p1p2Ppp/4P3/1P4P1/P7/5K1P/8 w - - 0 38",
    playAs: "white",
    screenshot: "Screenshot_20250131-184944.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/132103245319", white: "chicachoo123", black: "Mezag", ended: "2025-01-31T23:45", timeClass: "rapid", ply: 74, lastMove: "h6" },
    siteEvalShown: "+3.52",
    source: "game-record",
  }),
  endgame({
    fen: "2r2k2/8/ppp1RPp1/6P1/1P2K3/P7/8/8 w - - 1 47",
    playAs: "white",
    screenshot: "Screenshot_20250131-190449.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/132103245319", white: "chicachoo123", black: "Mezag", ended: "2025-01-31T23:45", timeClass: "rapid", ply: 92, lastMove: "Rc8" },
    siteEvalShown: "+2.83",
    source: "game-record",
  }),
  endgame({
    fen: "6k1/p5p1/1p1R1p1p/8/1P1N2P1/P7/5PK1/r7 w - - 0 33",
    playAs: "white",
    screenshot: "Screenshot_20250302-110351.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/123463259102", white: "chicachoo123", black: "Minhgiang1975", ended: "2025-03-02T16:01", timeClass: "rapid", ply: 64, lastMove: "Rxa1" },
    siteEvalShown: "+4.37",
    source: "game-record",
  }),
  endgame({
    fen: "r4rk1/1p3ppp/p3p3/3p1n2/8/1PN5/P4PPP/R4RK1 b - - 0 21",
    playAs: "black",
    screenshot: "Screenshot_20250322-142539.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136558525388", white: "mariano03111", black: "chicachoo123", ended: "2025-03-22T19:24", timeClass: "rapid", ply: 41, lastMove: "Nxc3" },
    siteEvalShown: "-4.11",
    source: "game-record",
  }),
  endgame({
    fen: "4b3/6kp/pp1p4/2pPp1p1/PPP1P1Pb/7P/3B2K1/3B4 w - - 0 27",
    playAs: "white",
    screenshot: "Screenshot_20241217-103123.png",
    game: { site: "lichess.org", white: "nkohen", black: "Aubi20", timeControl: "3+2 • Blitz • Rated", lastMove: "26...a6" },
    siteEvalShown: "+3.9",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/8/4k3/2p2p1p/p4Pp1/1P2K1P1/7P/8 w - - 0 39",
    playAs: "white",
    screenshot: "Screenshot_20250119-125724.png",
    game: { site: "lichess.org", white: "nkohen", black: "LandonLagg", timeControl: "3+2 • Blitz • Rated", lastMove: "38...bxa4" },
    siteEvalShown: "+6.3",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/8/8/p1k5/1p2K3/1P6/8/8 b - - 0 46",
    playAs: "black",
    screenshot: "Screenshot_20250123-171256.png",
    game: { site: "lichess.org", white: "Hokusai58", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "46.Ke4" },
    siteEvalShown: "-56.5",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/p7/5K2/8/PP1Nk3/2P1p3/8/8 b - - 0 41",
    playAs: "black",
    screenshot: "Screenshot_20241126-123155.png",
    game: { site: "lichess.org", white: "Nikopoulosv", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "41.Kf6" },
    siteEvalShown: "0",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "6k1/4bp2/3p3p/p2Pp1p1/Pp6/5P2/2P2BPP/6K1 w - - 0 36",
    playAs: "black",
    screenshot: "Screenshot_20241201-150131.png",
    game: { site: "lichess.org", white: "jaybradley60", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "35...cxb4" },
    siteEvalShown: "+6.4",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "2k5/pp6/8/2Pp4/8/2P2KP1/PP4r1/8 b - - 0 38",
    playAs: "black",
    screenshot: "Screenshot_20241210-101700.png",
    game: { site: "lichess.org", white: "Imock", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "38.Kf3" },
    siteEvalShown: "-7.6",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/8/pp6/3k1p2/7p/3K2P1/PP6/8 w - - 0 37",
    playAs: "white",
    screenshot: "Screenshot_20241220-234021.png",
    game: { site: "lichess.org", white: "nkohen", black: "c0nsummatum_est", timeControl: "3+2 • Blitz • Rated", lastMove: "36...gxh4" },
    siteEvalShown: "+6.7",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "5r2/ppp1kp2/6p1/4P2p/8/P1P5/1P4PP/5RK1 b - - 0 21",
    playAs: "black",
    screenshot: "Screenshot_20250115-095145.png",
    game: { site: "lichess.org", white: "FlorianKuhlewind", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "21.e5" },
    siteEvalShown: "-4.3",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/7p/8/1R6/P2bk3/1P4P1/7r/5K2 b - - 0 38",
    playAs: "black",
    screenshot: "Screenshot_20250129-103820.png",
    game: { site: "lichess.org", white: "Mats999", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "38.Kxf1" },
    siteEvalShown: "-5.9",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/p7/1pNn1kp1/1P3p2/5P2/6P1/6KP/8 b - - 0 40",
    playAs: "black",
    screenshot: "Screenshot_20250216-175137.png",
    game: { site: "lichess.org", white: "hammaoui", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "40.Nc6" },
    siteEvalShown: "-4.5",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/8/1p5K/p2BkpP1/P1P2p2/8/8/2b5 w - - 0 46",
    playAs: "white",
    screenshot: "Screenshot_20241108-214052.png",
    game: { site: "lichess.org", white: null, black: null, lastMove: "45...Bc1" },
    siteEvalShown: "+4.40",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/3k1p1p/5p2/1p1p1P2/6P1/2P4P/P1PK4/8 w - - 0 34",
    playAs: "white",
    screenshot: "Screenshot_20241126-115109.png",
    game: { site: "lichess.org", white: "nkohen", black: "OTML", timeControl: "10+0 • Rapid • Rated", lastMove: "33...cxd5" },
    siteEvalShown: "not shown in this screenshot (no eval/opening line was visible above the move list, unlike the other 'Moves' screenshots)",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/2pk4/1p2p1n1/p2p1p2/3P1P2/2P1PN2/P2K4/8 b - - 0 35",
    playAs: "white",
    screenshot: "Screenshot_20241126-125147.png",
    game: { site: "lichess.org", white: "nkohen", black: "larlar", timeControl: "3+2 • Blitz • Rated", lastMove: "35.Kxd2" },
    siteEvalShown: "-2.3",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "4k3/p4p1p/2p1p3/8/5P2/4P3/PPP4P/3K4 b - - 0 21",
    playAs: "black",
    screenshot: "Screenshot_20241201-144934.png",
    game: { site: "lichess.org", white: "yurii_dubnytskyi", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "21.Kxd1" },
    siteEvalShown: "+5.3",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "2k5/1pp1bp1p/p3pp2/8/8/2P1BP2/PP3P1P/6K1 b - - 0 23",
    playAs: "black",
    screenshot: "Screenshot_20241215-193946.png",
    game: { site: "lichess.org", white: "Miguel12243582", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "23.gxf3" },
    siteEvalShown: "-3.2",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/4kp1p/4pnp1/3p4/7P/1P1R4/r7/2K5 w - - 0 27",
    playAs: "black",
    screenshot: "Screenshot_20241218-120950.png",
    game: { site: "lichess.org", white: "rezashirazi", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "26...Rxa2" },
    siteEvalShown: "-9.8",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/ppp1kp2/6p1/4P2p/8/P1P4P/1P3KP1/8 b - - 0 24",
    playAs: "black",
    screenshot: "Screenshot_20250115-095154.png",
    game: { site: "lichess.org", white: "FlorianKuhlewind", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "24.Kxf2" },
    siteEvalShown: "-6",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "4r3/8/8/pppkP3/4R3/PP2K3/8/8 b - - 0 40",
    playAs: "black",
    screenshot: "Screenshot_20250123-171229.png",
    game: { site: "lichess.org", white: "Hokusai58", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "40.a3" },
    siteEvalShown: "-10.1",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/8/6kP/5p2/4pK2/2b5/5B2/8 b - - 0 46",
    playAs: "black",
    screenshot: "Screenshot_20250323-120551.png",
    game: { site: "lichess.org", white: "befi123", black: "nkohen", timeControl: "3+2 • Blitz • Rated", lastMove: "46.Bf2" },
    siteEvalShown: "-11.4",
    source: "screenshot-transcription",
    note: "transcribed from the screenshot: two independent passes agreed on every square",
  }),
  endgame({
    fen: "8/p7/6K1/8/PP1Nk3/2P1p3/8/8 w - - 0 41",
    playAs: "black",
    screenshot: "Screenshot_20241126-123142.png",
    game: { site: "lichess.org", white: "Nikopoulosv", black: "nkohen", timeControl: "3+2 blitz", lastMove: "40...Ke4" },
    siteEvalShown: "+10.2",
    source: "screenshot-transcription",
    note: "A/B differed on b4; image shows a white pawn (coordinator adjudication)",
  }),
  endgame({
    fen: "1r4k1/4bp2/3p3p/p1pPp1p1/P3R3/5P2/2P2BPP/6K1 b - - 0 34",
    playAs: "black",
    screenshot: "Screenshot_20241201-150116.png",
    game: { site: "lichess.org", white: "jaybradley60", black: "nkohen", timeControl: "3+2 blitz", lastMove: "34. Re4" },
    siteEvalShown: "-5.6",
    source: "screenshot-transcription",
    note: "A/B differed on a5; image shows a black pawn",
  }),
  endgame({
    fen: "8/p7/7R/8/2K5/k3PP2/P5rP/8 w - - 0 36",
    playAs: "white",
    screenshot: "Screenshot_20241209-163333.png",
    game: { site: "lichess.org", white: "nkohen", black: "Bamey", timeControl: "3+2 blitz", lastMove: "35...Rxg2" },
    siteEvalShown: "+8.8",
    source: "screenshot-transcription",
    note: "A/B differed on a2; image shows a white pawn",
  }),
  endgame({
    fen: "6k1/2p2pbp/2Pp2p1/B7/2Pp4/6P1/P4P1P/6K1 b - - 0 24",
    playAs: "white",
    screenshot: "Screenshot_20250217-234147.png",
    game: { site: "lichess.org", white: "nkohen", black: "jonathanrechter", timeControl: "3+2 blitz", lastMove: "24. Bxa5" },
    siteEvalShown: "+7.6",
    source: "screenshot-transcription",
    note: "A/B differed on c4; image shows a white pawn",
  }),
  endgame({
    fen: "6r1/8/2p3rk/2pp4/p3P3/3P3P/PPP5/3RKR2 w - - 0 36",
    playAs: "black",
    screenshot: "Screenshot_2025-03-24_at_11.01.14_AM.png",
    game: { site: "lichess.org", white: "yogurtfreak", black: "nkohen", lastMove: "35...Rag8" },
    siteEvalShown: "+3.1 at depth 26",
    source: "screenshot-transcription",
    note: "desktop analysis shot; transcribed by the coordinator from the image; playAs from the tab's white-black name order",
  }),
  endgame({
    fen: "8/3k2p1/p3p2p/1p1p1b2/1P1P1B1P/P3PP2/6P1/6K1 w - - 0 26",
    playAs: "white",
    screenshot: "Screenshot_20241112-115153.png",
    game: { site: "lichess.org", white: "nkohen", black: "Zaharvis2017", timeControl: "3+2 blitz", lastMove: "25...Kd7" },
    siteEvalShown: "+3.4",
    source: "screenshot-transcription",
    note: "A/B differed on d6/e6; image shows the pawn on e6",
  }),
  endgame({
    fen: "2k4r/ppp2ppp/4pn2/8/3r4/1P1P2NP/5PP1/2RR2K1 b - - 0 20",
    playAs: "black",
    screenshot: "Screenshot_20241217-113559.png",
    game: { site: "lichess.org", white: "Hokusai58", black: "nkohen", timeControl: "3+2 blitz", lastMove: "20. Rfd1" },
    siteEvalShown: "-7.9",
    source: "screenshot-transcription",
    note: "A/B differed on h8; image shows a black rook there (and 20...Rhd8 follows)",
  }),
  endgame({
    fen: "1k4r1/ppp2p1p/5B2/8/8/1N6/P1P2P1P/1K6 b - - 0 27",
    playAs: "black",
    screenshot: "Screenshot_20241226-143234.png",
    game: { site: "lichess.org", white: "cypchess", black: "nkohen", timeControl: "3+2 blitz", lastMove: "27. Bxf6" },
    siteEvalShown: "-2.4",
    source: "screenshot-transcription",
    note: "A/B differed on the white king and a c6 pawn; image plus the full move list give 14 pieces, king on b1, no c6 pawn",
  }),
  endgame({
    fen: "6k1/6b1/5p2/2p1pPp1/2Pp2P1/3P4/4P3/BK6 w - - 0 31",
    playAs: "white",
    screenshot: "Screenshot_20250123-165408.png",
    game: { site: "lichess.org", white: "nkohen", black: "JOGEL", timeControl: "3+2 blitz", lastMove: "30...f6" },
    siteEvalShown: "+6.6",
    source: "screenshot-transcription",
    note: "A/B differed on several white pawns; image plus move list (c4 at move 1, d3 at move 5, e3 only at move 33) give c4, d3, e2, f5, g4",
  }),
  endgame({
    fen: "6k1/pp5p/5r2/5b2/8/n5B1/6PP/3R2K1 w - - 0 28",
    playAs: "black",
    screenshot: "Screenshot_20241127-153403.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/126440328635", white: "Hank_Hulley", black: "chicachoo123", ended: "2024-11-27T10:02", timeClass: "rapid", ply: 54, lastMove: "Rxf6" },
    siteEvalShown: "-4.19",
    source: "game-record",
    note: "board matched exactly to the chess.com game record after coordinator adjudication",
  }),
];

export const curatedMidgames: CuratedPosition[] = [
  midgame({
    fen: "2kr3r/ppp1qp2/2n4p/4P1p1/2PpBP2/P5P1/1P1Q1P1P/3R1RK1 w - - 0 18",
    playAs: "black",
    screenshot: "Screenshot_2025-03-24_at_10.30.15_AM.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136446473076", white: "jeanmarc33", black: "chicachoo123", ended: "2025-03-19T17:54", ply: 34 },
    siteEvalShown: "+3.5 at depth 28",
    source: "game-record",
  }),
  midgame({
    fen: "2k4r/ppp1np2/5p2/7r/1P3pp1/P1NP2P1/2P2R1P/R5K1 w - - 0 21",
    playAs: "black",
    screenshot: "Screenshot_2025-03-24_at_10.32.19_AM.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136445931486", white: "abdallaelsisy", black: "chicachoo123", ended: "2025-03-19T17:37", ply: 40 },
    siteEvalShown: "-3.8 at depth 29",
    source: "game-record",
  }),
  midgame({
    fen: "5rk1/pp4pp/1b6/5p2/7n/1P2P1NP/PB1r1PP1/R4RK1 w - - 0 22",
    playAs: "white",
    screenshot: "Screenshot_2025-03-24_at_10.35.37_AM.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136424505414", white: "chicachoo123", black: "snarecs", ended: "2025-03-19T04:04", ply: 42 },
    siteEvalShown: "+2.1 at depth 30",
    source: "game-record",
  }),
  midgame({
    fen: "1k1r3r/1p3ppp/b1p2n2/2b1p3/P7/2N1N3/1PKP1PPP/R1B4R b - - 7 19",
    playAs: "black",
    screenshot: "Screenshot_2025-03-24_at_10.37.30_AM.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136424323688", white: "vkkapatid", black: "chicachoo123", ended: "2025-03-19T03:55", ply: 37 },
    siteEvalShown: "-3.0 at depth 28",
    source: "game-record",
  }),
  midgame({
    fen: "6k1/4bppp/p3pn2/3p4/Pp1Pn3/1P1BP2P/5PP1/2N1B1K1 w - - 1 28",
    playAs: "white",
    screenshot: "Screenshot_2025-03-24_at_10.39.39_AM.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136409613110", white: "chicachoo123", black: "aditi607", ended: "2025-03-18T18:08", ply: 54 },
    siteEvalShown: "+4.2 at depth 28",
    source: "game-record",
  }),
  midgame({
    fen: "k4b1r/2pr1ppp/PnN1p3/8/8/5N2/2R2PPP/R5K1 w - - 3 22",
    playAs: "black",
    screenshot: "Screenshot_2025-03-24_at_10.41.05_AM.png",
    game: { site: "chess.com", url: "https://www.chess.com/game/live/136313725486", white: "Thiagobbad", black: "chicachoo123", ended: "2025-03-16T03:52", ply: 42 },
    siteEvalShown: "+3.1 at depth 31",
    source: "game-record",
  }),
  midgame({
    fen: "r2qr1k1/1pp2pp1/p1nb3p/7b/3P4/P1N1PN1P/1P2BPP1/R2Q1RK1 w - - 0 15",
    playAs: "white",
    screenshot: "Screenshot_2025-03-24_at_10.46.13_AM.png",
    game: { site: "chess.com", white: "chicachoo123", black: "wiam2000", note: "replayed from the fully visible move list; game not in Oct 2024-Mar 2025 archives" },
    siteEvalShown: "+2.3 at depth 23",
    source: "screenshot-transcription",
  }),
];
