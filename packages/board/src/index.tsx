// The board UI package's entry point: re-exports only. Board lives in Board.tsx and MoveLine in
// MoveLine.tsx so MoveLine can import Board directly without a module cycle through this file.
export { Board, type BoardProps } from './Board';
export { BoardEditor, type BoardEditorProps } from './BoardEditor';
export { MoveLine, type MoveLineProps } from './MoveLine';
