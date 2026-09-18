// Minimal openings builder + drill, one browser, localStorage. Design record:
// memory/subprojects/openings-builder-trainer.md.
export { OpeningsBuilder, type OpeningsBuilderProps } from './OpeningsBuilder';
export { GamesTreeView, type GamesTreeTarget, type GamesTreeViewProps } from './GamesTreeView';
export * from './repertoire';
export { loadRepertoire, saveRepertoire } from './storage';
