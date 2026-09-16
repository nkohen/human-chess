# Openings builder and trainer — interview notes

Source: user interview, 2026-09-16. One question per turn. Landscape references:
docs/research/2026-09-15-commercial-landscape.md (Chessable, Chess Position Trainer,
Chessbook, Bookup); open-source references: chessdriller (no license), Listudy (AGPL).

## Building a repertoire
All of these are valid inputs:
- by hand on a board;
- import from a lichess study or PGN;
- suggested from the opening explorer or an engine;
- generated from heuristics by the openings heuristic finder;
- an **interactive "what if" process**: the user builds moves while the app asks "what if"
  and supplies likely opponent replies (explorer frequencies at the user's rating band, or
  Maia, are the grounded sources of "likely").

In the interactive setting the user has a **multi-line engine** (Stockfish MultiPV or
equivalent) on screen: give them as many resources as possible when choosing moves.

## Design notes
The user can attach **design decisions and notes** to the repertoire as they build. These
notes are data: they can be analysed, given feedback on (the "state your reasoning, app checks
it" loop again), and fed to the heuristic finder.

## Structure
- An **opening = one tree for one colour**. A system playable by both colours has two trees
  linked by name.
- A repertoire may hold multiple "conflicting" openings. **Merging two openings at a shared
  position is the user's decision**, per position; they can stay separate.
- **Within one opening**, transpositions default to a **single position** (position-graph
  model, as in Chess Position Trainer), because most heuristics prefer the compact form. The
  user may still choose to keep two paths to the same position distinct.
- Implication: the storage model is a graph of positions (keyed by FEN or Zobrist) with edges
  as moves, plus per-opening "split" markers where the user overrides merging. A plain PGN
  tree is an export/import format, not the model.

## Training sessions
All of these are wanted as options:
- drill the whole repertoire;
- drill one opening or one line;
- a spaced-repetition queue that picks positions for you;
- opponent moves taken from the repertoire only, **or** weighted by what real opponents at
  the user's rating actually play (lichess explorer at the rating band; Maia as alternative).

## Deviation handling in drill mode
- The mode explicitly called **drill stops on a wrong move**.
- Two scopes: drill one specific opening, or drill several openings up to the whole
  repertoire. In the multi-opening scope, **any move that keeps the user inside one of the
  selected openings is allowed**, so a move that is wrong for opening A but right for opening
  B is accepted when both are selected.
- Implication: "wrong" is evaluated against the union of the selected position graphs, and
  the drill has to track which opening(s) the current path still belongs to.

## Tools the user actually uses
- **openingtree.com** (open source, GPL-3.0, surveyed): the user uses it heavily to diagnose
  opening weaknesses from their own games. Its consolidated opening tree with per-move results
  across lichess and chess.com games is a reference for the diagnostic side of this tool.
- **Aimchess opening trainer** (formerly used often): plays probabilistically likely opponent
  moves at the user's level; the user believes the probabilities came from a database. That is
  the "weighted by real opponents at your rating" option above; lichess explorer per rating
  band is the grounded source.

## Priority for version one (user, 2026-09-16)
1. **Interactive building** with a multi-line engine on screen. Heuristic help is a maybe,
   possibly a follow-up.
2. **Analysis through an opening tree** (openingtree-style, over the user's own games).
3. **Practice**: drilling, and playing the first few moves against likely opponent replies as
   Aimchess did. Both informed by broad statistics (explorer) and by the user's own opening
   tree of played games.
Later: study/PGN import, explorer/engine suggestions as a first-class input, heuristic
generation.

## Reuse directive
openingtree (github.com/openingtree/openingtree, GPL-3.0 verified from LICENSE 2026-09-15) is
open source and the user wants to **take what we can from it** (2026-09-16): the played-games
opening tree with per-move results, and its no-copy-paste import of lichess and chess.com
games. GPL-3.0 is compatible with human-chess's AGPL-3.0; obligations are attribution and
keeping the copied code's license notices. It is React/JavaScript, which fits the TypeScript
stack. Before any of its code lands, the specific files and what they depend on go into
memory/reuse-library.md.

## Status
Interview closed 2026-09-16; the user may add more later.

**User feedback on the first slice (2026-09-16), built the same day:** search depth at least 20,
and configurable — now default 20, range 6..30, persisted per browser, with the engine's
intermediate lines streamed while the search runs (new `onProgress` on `analyse`). A button to
suggest opponent moves on the opponent's turn — implemented as "Add these N opponent replies to
the tree" over the MultiPV first moves, because the lichess explorer (the interview's source of
"likely") now answers 401 without a lichess login (see memory/reuse-library.md). Built the same
day once the user said yes to OAuth: an explorer panel under the engine lines on the opponent's
turn (`ExplorerPanel.tsx`), logged out it shows a login prompt; logged in it lists each reply's
share with win/draw/loss bars, a rating band (persisted; default 1600–2000, lichess's documented
buckets) and "Add replies played ≥ 5%" — the 5% threshold and the band default are first guesses
the user has not weighed in on. Speeds fixed to blitz+rapid+classical. Explorer responses cached
7 days per position/band through `packages/lichess`.

## Open questions (not yet asked)
- How the user's played games are pulled in (openingtree's importer is the candidate).
- Whether repertoires are shared between users.
- Other (non-drill) modes' deviation handling, e.g. free play against the repertoire.
- SRS scheduling scheme (Chessable's 8 fixed levels is the only documented one; SM-2/FSRS are
  the general-purpose options).
