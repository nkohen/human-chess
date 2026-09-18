// Lesson Builder: a GUI for authoring lessons — an ordered sequence of board positions, prose,
// arrow/circle annotations, and optional move-challenges — without touching the code. Lessons are
// saved in the browser (survive reload) and can be exported as JSON to be shipped later. Schema
// and validation live in @human-chess/lessons; this subproject is the editor and the player.
export { LessonBuilder } from './LessonBuilder';
