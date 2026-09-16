// Plain-language material difference, built only from a chessops pieceCounts board read (V3):
// no evaluation, no judgement of who stands better — just what is on the board.
import type { Color, Role } from '@human-chess/rules';

const ROLE_ORDER: Role[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

function pieceWords(n: number, role: Role): string {
  return n === 1 ? `a ${role}` : `${countWord(n)} ${role}s`;
}

interface Extra {
  role: Role;
  n: number;
}

/** Roles where `a` has strictly more than `b`, in a fixed queen-to-pawn order (king is always 1-1). */
function extraRoles(a: Record<Role, number>, b: Record<Role, number>): Extra[] {
  const extras: Extra[] = [];
  for (const role of ROLE_ORDER) {
    const diff = a[role] - b[role];
    if (diff > 0) extras.push({ role, n: diff });
  }
  return extras;
}

function joinWords(items: Extra[]): string {
  const words = items.map(({ role, n }) => pieceWords(n, role));
  if (words.length === 1) return words[0]!;
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
}

/**
 * Describes the material difference in words, e.g. "White: a knight and a pawn for a rook." or
 * "White is up a rook." Reads a real pieceCounts result; never judges who stands better.
 */
export function describeMaterialDifference(counts: Record<Color, Record<Role, number>>): string {
  const white = extraRoles(counts.white, counts.black);
  const black = extraRoles(counts.black, counts.white);
  if (white.length === 0 && black.length === 0) return 'Material is equal.';
  if (black.length === 0) return `White is up ${joinWords(white)}.`;
  if (white.length === 0) return `Black is up ${joinWords(black)}.`;
  return `White: ${joinWords(white)} for ${joinWords(black)}.`;
}
