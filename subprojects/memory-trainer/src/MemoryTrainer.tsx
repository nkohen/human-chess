import { useState } from 'react';
import { Board } from '@human-chess/board';
import { ImportScreen } from '@human-chess/import/react';
import type { ImportedGame } from '@human-chess/import';
import { fullmove, inCheck, opposite, positionFromFen, turn, uciSquares, type Color, type SquareName } from '@human-chess/rules';
import { compareReconstruction, fenSequence } from './compare';
import {
  currentFen, lastReconstructedMove, playReconstructionMove, reconstructedSans, reconstructedUcis,
  reconstructionDests, sideToMove, startReconstruction, type Reconstruction,
} from './reconstruction';

const STORAGE_KEY = 'human-chess.memory-trainer.lichess-username';

type Screen =
  | { kind: 'import' }
  | { kind: 'reconstruct'; game: ImportedGame; reconstruction: Reconstruction }
  | { kind: 'review'; game: ImportedGame; reconstruction: Reconstruction };

/**
 * Ply → (colour, move number), anchored to the game's real start position — not always White
 * to move 1 (a FEN start can begin with Black to move at any fullmove number). `startColor`
 * and `startFullmove` come from the start position once (see ReviewScreen) rather than being
 * re-derived per ply.
 */
const ordinalMove = (
  startColor: Color,
  startFullmove: number,
  ply: number,
): { moveNumber: number; color: 'White' | 'Black' } => {
  const plyColor = ply % 2 === 1 ? startColor : opposite(startColor);
  const offset = startColor === 'white' ? 1 : 0;
  return {
    moveNumber: startFullmove + Math.floor((ply - offset) / 2),
    color: plyColor === 'white' ? 'White' : 'Black',
  };
};

export function MemoryTrainer(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ kind: 'import' });

  const startOver = (): void => setScreen({ kind: 'import' });

  const beginReconstruction = (game: ImportedGame): void => {
    setScreen({ kind: 'reconstruct', game, reconstruction: startReconstruction(game.startFen) });
  };

  if (screen.kind === 'import') {
    return (
      <div className="memory-trainer">
        <ImportScreen storageKey={STORAGE_KEY} title="Memory trainer" onImported={beginReconstruction} />
      </div>
    );
  }

  if (screen.kind === 'reconstruct') {
    const { game, reconstruction } = screen;
    const onMove = (from: SquareName, to: SquareName): void => {
      setScreen({ kind: 'reconstruct', game, reconstruction: playReconstructionMove(reconstruction, from, to) });
    };
    const onDone = (): void => setScreen({ kind: 'review', game, reconstruction });
    return (
      <div className="memory-trainer">
        <Board
          fen={currentFen(reconstruction)}
          orientation={game.playedAs ?? 'white'}
          turnColor={sideToMove(reconstruction)}
          dests={reconstructionDests(reconstruction)}
          movableColor={sideToMove(reconstruction)}
          lastMove={lastReconstructedMove(reconstruction)}
          check={inCheck(reconstruction.pos)}
          onMove={onMove}
        />
        <p className="memory-trainer-note">
          Enter both sides' moves as best you remember them. Wrong moves are accepted silently —
          the board just keeps going from your version of the position. Promotions always become
          a queen.
        </p>
        <MoveList sans={reconstructedSans(reconstruction)} />
        <button className="memory-trainer-done" onClick={onDone}>
          I have no idea
        </button>
      </div>
    );
  }

  const { game, reconstruction } = screen;
  return <ReviewScreen game={game} reconstruction={reconstruction} onAnotherGame={startOver} />;
}

function MoveList({ sans }: { sans: string[] }): React.JSX.Element {
  const pairs: { moveNumber: number; white: string | undefined; black: string | undefined }[] = [];
  for (let i = 0; i < sans.length; i += 2) {
    pairs.push({ moveNumber: i / 2 + 1, white: sans[i], black: sans[i + 1] });
  }
  return (
    <ol className="memory-trainer-moves">
      {pairs.map(p => (
        <li key={p.moveNumber}>
          {p.moveNumber}. {p.white ?? ''} {p.black ?? ''}
        </li>
      ))}
    </ol>
  );
}

function ReviewScreen({
  game,
  reconstruction,
  onAnotherGame,
}: {
  game: ImportedGame;
  reconstruction: Reconstruction;
  onAnotherGame: () => void;
}): React.JSX.Element {
  // ReviewScreen only mounts once per attempt (ReplayBoard below owns its own step state), so
  // this pure comparison runs once rather than needing memoisation.
  const userUcis = reconstructedUcis(reconstruction);
  const userSans = reconstructedSans(reconstruction);
  const segments = compareReconstruction(game.startFen, game.ucis, userUcis);
  const realFens = fenSequence(game.startFen, game.ucis);

  // Ply → colour/move-number is anchored to the actual start position (parsed once here),
  // not assumed to be White to move 1.
  const startPos = positionFromFen(game.startFen);
  const startColor = turn(startPos);
  const startFullmove = fullmove(startPos);

  const firstSegment = segments[0];
  const correctBeforeFirstDivergence = firstSegment?.kind === 'match' ? firstSegment.toPly : 0;
  const diverged = segments.filter(s => s.kind === 'diverged');
  const lastMatchPly = firstSegment?.kind === 'match' ? firstSegment.toPly : 0;

  return (
    <div className="memory-trainer memory-trainer-review">
      <h2>How you did</h2>
      <p>
        {userUcis.length === 0
          ? 'You entered no moves.'
          : correctBeforeFirstDivergence > 0
            ? `You reconstructed the first ${correctBeforeFirstDivergence} ${correctBeforeFirstDivergence === 1 ? 'ply' : 'plies'} correctly.`
            : 'The very first move you entered did not match the real game.'}
      </p>

      {realFens.length > 1 && (
        <ReplayBoard
          fens={realFens.slice(0, lastMatchPly + 1)}
          ucis={game.ucis.slice(0, lastMatchPly)}
          orientation={game.playedAs ?? 'white'}
        />
      )}

      {diverged.length === 0 && segments.length > 0 && <p>No divergence — you reconstructed the whole game you entered.</p>}

      {diverged.map((seg, i) => {
        const { moveNumber, color } = ordinalMove(startColor, startFullmove, seg.fromPly);
        const youPlayed = userSans[seg.fromPly - 1] ?? '?';
        const gameWent = game.sans[seg.fromPly - 1] ?? '?';
        const nextSegment = segments[segments.indexOf(seg) + 1];
        const rejoinedAt = nextSegment?.kind === 'match' ? nextSegment.fromPly : undefined;
        return (
          <p key={i}>
            At move {moveNumber} ({color}) you played {youPlayed}, the game went {gameWent}.{' '}
            {rejoinedAt !== undefined
              ? `Your reconstruction rejoined the real game at ply ${rejoinedAt}.`
              : 'It never rejoined the real game after that.'}
          </p>
        );
      })}

      <button onClick={onAnotherGame}>Another game</button>
    </div>
  );
}

function ReplayBoard({ fens, ucis, orientation }: { fens: string[]; ucis: string[]; orientation: Color }): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.min(index, fens.length - 1);
  const fen = fens[clampedIndex] ?? fens[0]!;
  // fens[0] is the start position (no previous move); fens[i] for i > 0 is the position after
  // ucis[i - 1], so that is the real move that produced the position now shown.
  const uci = clampedIndex > 0 ? ucis[clampedIndex - 1] : undefined;
  const lastMove: [SquareName, SquareName] | undefined = uci ? uciSquares(uci) : undefined;
  return (
    <div className="memory-trainer-replay">
      <Board
        fen={fen}
        orientation={orientation}
        turnColor="white"
        dests={new Map()}
        movableColor={undefined}
        lastMove={lastMove}
        check={false}
        onMove={() => {}}
      />
      <div className="memory-trainer-replay-controls">
        <button onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={index === 0}>
          prev
        </button>
        <button onClick={() => setIndex(i => Math.min(fens.length - 1, i + 1))} disabled={index >= fens.length - 1}>
          next
        </button>
      </div>
    </div>
  );
}
