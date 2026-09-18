// The library screen: every saved lesson, plus new/edit/preview/delete and JSON export/import.
// Export and import both go through a plain textarea (not just a file picker) so the flow works
// headless too, per the brief; the download link is a `data:` URI, which needs no Blob/ObjectURL
// support and so works the same in a real browser and in the jsdom tests.
import { useState } from 'react';
import { parseLessonFile, serializeLesson, type Lesson } from '@human-chess/lessons';
import { Button, Field, Page, Panel, Status } from '@human-chess/ui';

export interface LibraryViewProps {
  lessons: Lesson[];
  onNew: () => void;
  onEdit: (id: string) => void;
  onPlay: (id: string) => void;
  onDelete: (id: string) => void;
  onImport: (lesson: Lesson) => void;
}

function formatUpdatedAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export function LibraryView({ lessons, onNew, onEdit, onPlay, onDelete, onImport }: LibraryViewProps): React.JSX.Element {
  const [exportOpenId, setExportOpenId] = useState<string | undefined>(undefined);
  const [copiedId, setCopiedId] = useState<string | undefined>(undefined);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | undefined>(undefined);

  const handleDelete = (lesson: Lesson): void => {
    if (window.confirm(`Delete "${lesson.title}"? This cannot be undone.`)) onDelete(lesson.id);
  };

  const handleCopy = (lesson: Lesson): void => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) return; // no clipboard API (jsdom, an unsupported browser, denied permission): the textarea below still lets the author copy it by hand
    clipboard
      .writeText(serializeLesson(lesson))
      .then(() => {
        setCopiedId(lesson.id);
        setTimeout(() => setCopiedId(undefined), 1500);
      })
      .catch(() => {
        // Clipboard access denied: not surfaced as an error, same reasoning as above.
      });
  };

  const handleImport = (): void => {
    const lesson = parseLessonFile(importText);
    if (!lesson) {
      setImportError('That is not a valid lesson file.');
      return;
    }
    onImport(lesson);
    setImportText('');
    setImportError(undefined);
  };

  return (
    <Page title="Lesson Builder" intro="Author a sequence of positions, notes and move-challenges — no code required." actions={<Button variant="primary" onClick={onNew}>New lesson</Button>}>
      {lessons.length === 0 && <Status kind="info">No lessons yet. Start one with "New lesson".</Status>}
      <ul className="lb-library-list">
        {lessons.map(lesson => (
          <li key={lesson.id} className="lb-library-item">
            <Panel>
              <div className="lb-library-item__header">
                <h3 className="lb-library-item__title">{lesson.title || 'Untitled lesson'}</h3>
                <span className="lb-library-item__meta">
                  {lesson.steps.length} step{lesson.steps.length === 1 ? '' : 's'} · updated {formatUpdatedAt(lesson.updatedAt)}
                </span>
              </div>
              {lesson.description && <p className="lb-library-item__desc">{lesson.description}</p>}
              <div className="lb-library-item__actions">
                <Button size="sm" onClick={() => onEdit(lesson.id)}>Edit</Button>
                <Button size="sm" onClick={() => onPlay(lesson.id)}>Preview</Button>
                <Button size="sm" variant="quiet" onClick={() => setExportOpenId(id => (id === lesson.id ? undefined : lesson.id))}>
                  {exportOpenId === lesson.id ? 'Hide export' : 'Export'}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => handleDelete(lesson)}>Delete</Button>
              </div>
              {exportOpenId === lesson.id && (
                <div className="lb-export">
                  <textarea className="lb-export__text" readOnly rows={8} value={serializeLesson(lesson)} onFocus={e => e.currentTarget.select()} />
                  <div className="lb-export__actions">
                    {typeof navigator !== 'undefined' && navigator.clipboard && (
                      <Button size="sm" variant="quiet" onClick={() => handleCopy(lesson)}>
                        {copiedId === lesson.id ? 'Copied' : 'Copy to clipboard'}
                      </Button>
                    )}
                    <a
                      className="hc-button hc-button--sm"
                      href={`data:application/json;charset=utf-8,${encodeURIComponent(serializeLesson(lesson))}`}
                      download={`${lesson.title || 'lesson'}.json`}
                    >
                      Download
                    </a>
                  </div>
                </div>
              )}
            </Panel>
          </li>
        ))}
      </ul>
      <Panel title="Import a lesson">
        <Field label="Paste lesson JSON" htmlFor="lb-import-text">
          <textarea id="lb-import-text" rows={6} value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste exported lesson JSON here" />
        </Field>
        {importError && <Status kind="error">{importError}</Status>}
        <Button onClick={handleImport} disabled={importText.trim().length === 0}>Import</Button>
      </Panel>
    </Page>
  );
}
