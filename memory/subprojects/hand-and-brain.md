# Hand and Brain — interview notes

Source: user interview, 2026-09-16. Added to the list 2026-09-15.

## Rules
The **standard variant**: per team, the brain sees the board and may say only a piece type
(pawn, knight, bishop, rook, queen, king); the hand must make a legal move with a piece of that
type; if no legal move of that type exists, the brain names another. Two teams play each
other.

## Players
**Humans only for now**: two human pairs. No engine as hand or brain in the first version.

## Grounding
Legality of "a move with that piece type" comes from chessops; the app enforces that the
hand's move matches the called type.

## The call
The brain chooses from a **list of buttons showing only the piece types that have a legal
move** in the current position. The app carries the call to the hand, enforces the rules, and
records every call (so the review can show them). The "no legal move of that type" re-call
case disappears, since only legal types are offered.

## Rooms and clocks
- **Private rooms** first; matchmaking possible in the future (same as group chess).
- **A clock per player** (four clocks: each brain's runs while it is choosing a type, each
  hand's while it is choosing a move). The user is open to experimenting with other formats.

## Status
Interview closed 2026-09-16; the user may add more later.

## Open questions (not yet asked)
- Role swap between games; post-game review with the calls recorded.
