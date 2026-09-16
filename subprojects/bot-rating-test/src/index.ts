// Bot rating test: play a rating-limited Stockfish, record every finished game with
// provenance, and suggest (never claim) the next level to try.
// Design record: memory/subprojects/bot-rating-test.md.
export { BotRatingTest, type BotRatingTestProps } from './BotRatingTest';
export * from './records';
export * from './suggest';
export * from './summary';
