// Visualization trainer: two modes behind one mode switch (VisualizationTrainer.tsx). "Lines"
// (LinesTrainer.tsx): the board stays visible, a short line is given in SAN, and the learner
// must answer questions about the resulting position without seeing it — mirroring calculation
// in a real game. "Memorize" (MemorizeTrainer.tsx): a timed position-memorizer, scored by
// memorize.ts. Design record: memory/subprojects/visualization-trainer.md.
export { VisualizationTrainer, type VisualizationTrainerProps } from './VisualizationTrainer';
export { LinesTrainer, type LinesTrainerProps } from './LinesTrainer';
export { MemorizeTrainer } from './MemorizeTrainer';
export * from './exercise';
export * from './memorize';
export * from './mode';
