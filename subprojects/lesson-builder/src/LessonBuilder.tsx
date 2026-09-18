import { Page, Status } from '@human-chess/ui';

/** Placeholder shell wired into the app while the full editor/player is built. Replaced by the
 * real Lesson Builder (library list, step editor, annotation board, challenge setup, player,
 * JSON import/export, reload survival). */
export function LessonBuilder(): React.JSX.Element {
  return (
    <Page title="Lesson Builder" intro="Author a sequence of positions, notes and move-challenges — no code required.">
      <Status kind="info">Lesson Builder is being built.</Status>
    </Page>
  );
}
