// The two page shapes every subproject screen renders inside (docs/design/2026-09-17-ui.md):
// Workbench for a board screen, Page for a setup/import screen; plus AppShell, the one full-width
// header apps/web itself renders. Styling for all three lives in base.css.
import type { ReactNode } from 'react';
import { cx } from './components';
import { useFitSquare } from './useFitSquare';

export interface WorkbenchProps {
  title: string;
  status?: ReactNode;
  /** The question and its buttons, or the single action that moves the screen forward. At most
   * one primary Button belongs in here (adoption rule 2). */
  primary?: ReactNode;
  /** Extra panels above `children`, e.g. the openings builder's engine lines. */
  aside?: ReactNode;
  /** A `Toolbar` of secondary actions (flip, restart, new game), pinned at the bottom of the
   * side column. */
  footer?: ReactNode;
  /** Render prop: called with the largest square (px) that fits the board column's width and
   * the height left under the app header, so the caller can hand that size straight to
   * `@human-chess/board`'s `Board`. */
  board: (sizePx: number) => ReactNode;
  /** Move list, lesson text, results, ... Fills the remaining side-column height and scrolls
   * internally so the page itself never scrolls. */
  children: ReactNode;
  className?: string;
}

/**
 * Board screen layout: the board on the left at the largest square that fits, a fixed-width
 * side column on the right (title, status, primary, aside extras, scrolling children, footer,
 * in that order). Below 60rem the columns stack into one, board first and primary directly
 * under it, so the thing the learner must act on is never pushed below the fold on a short
 * viewport (the problem the 2026-09-17 UI survey found on five board screens). The workbench
 * itself is exactly the height AppShell's main region gives it — it never grows past the
 * viewport under the header, and never needs the whole page to scroll.
 *
 * The board sizing (`useFitSquare`) replaces the memory trainer's own
 * `useAvailableHeight`/`useElementSize`/`squareSize`
 * (subprojects/memory-trainer/src/MemoryTrainer.tsx) — that subproject still owns its copies
 * until it is migrated onto Workbench.
 */
export function Workbench({ title, status, primary, aside, footer, board, children, className }: WorkbenchProps): React.JSX.Element {
  const [boardRef, sizePx] = useFitSquare<HTMLDivElement>();
  return (
    <div className={cx('hc-workbench', className)}>
      <div className="hc-workbench__board" ref={boardRef}>
        {board(sizePx)}
      </div>
      <h2 className="hc-workbench__title">{title}</h2>
      {status !== undefined && <div className="hc-workbench__status">{status}</div>}
      {primary !== undefined && <div className="hc-workbench__primary">{primary}</div>}
      {aside !== undefined && <div className="hc-workbench__extra">{aside}</div>}
      <div className="hc-workbench__children">{children}</div>
      {footer !== undefined && <div className="hc-workbench__footer">{footer}</div>}
    </div>
  );
}

export type PageWidth = 'narrow' | 'medium' | 'wide';

export interface PageProps {
  /** Optional so a screen that already names itself elsewhere (apps/web's home page, under the
   * AppShell brand) doesn't have to repeat the name as a second heading. */
  title?: string;
  intro?: ReactNode;
  /** Column width: 'narrow' 28rem, 'medium' 36rem (default), 'wide' 60rem (the home page's
   * card grid). */
  width?: PageWidth;
  /** Renders at the top right of the title row, so a primary control (the openings builder's
   * opening picker) is never pushed below a long form. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Setup/import screen layout: one centred column. Unlike Workbench, a Page is allowed to
 * scroll normally when its content is long — only board screens carry the never-scrolls rule
 * (docs/design/2026-09-17-ui.md, Direction). */
export function Page({ title, intro, width = 'medium', actions, children, className }: PageProps): React.JSX.Element {
  const hasHeader = title !== undefined || actions !== undefined;
  return (
    <div className={cx('hc-page', `hc-page--${width}`, className)}>
      {hasHeader && (
        <div className="hc-page__header">
          <div>
            {title !== undefined && <h1 className="hc-page__title">{title}</h1>}
            {intro !== undefined && <p className="hc-page__intro">{intro}</p>}
          </div>
          {actions !== undefined && <div className="hc-page__actions">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export interface AppShellProps {
  /** Left side of the header, e.g. a link back to the home page. */
  brand: ReactNode;
  /** Right side of the header, e.g. the engine status line. */
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** apps/web's outer shell: one full-width header (`--hc-header` tall) with `brand` left and
 * `right` right, and everything else — a Workbench or a Page for whichever route is active —
 * below it, sized to exactly fill the rest of the viewport. This is the only full-width bar in
 * the app; every screen inside it is centred or two-column, never edge to edge. */
export function AppShell({ brand, right, children, className }: AppShellProps): React.JSX.Element {
  return (
    <div className={cx('hc-app-shell', className)}>
      <header className="hc-app-shell__header">
        <div className="hc-app-shell__brand">{brand}</div>
        {right !== undefined && <div className="hc-app-shell__right">{right}</div>}
      </header>
      <main className="hc-app-shell__main">{children}</main>
    </div>
  );
}
