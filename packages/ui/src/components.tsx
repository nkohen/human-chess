// The shared primitives (docs/design/2026-09-17-ui.md): Button, Field, SegmentedControl,
// Status, Panel, Toolbar, Card, CardGrid. Every one takes an optional `className` passthrough
// and carries a BEM-ish class of its own (`hc-button`, `hc-button--sm`, ...) so a subproject can
// add a small, genuinely-its-own style on top without redefining spacing, colour or layout —
// those stay in tokens.css/base.css. Styling for all of these lives in base.css (the package
// keeps only two stylesheets); this file is markup and behaviour only.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Joins class name fragments, dropping falsy ones. The one pure helper every primitive below
 * uses to combine its own BEM class(es) with the caller's `className`; exported so
 * components.test.ts can exercise it without a DOM. */
export function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(' ');
}

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonSize = 'md' | 'sm';

/** The class names for a given Button variant/size/className combination. Pure (no JSX), so it
 * is the thing components.test.ts actually asserts against; `Button` itself just calls it.
 * `secondary` adds no modifier class beyond `hc-button` — base.css's plain-`button` look is the
 * secondary look, so a native `<button>` and `<Button variant="secondary">` render identically. */
export function buttonClassName(variant: ButtonVariant, size: ButtonSize, className?: string): string {
  return cx(
    'hc-button',
    variant === 'primary' && 'hc-primary',
    variant === 'quiet' && 'hc-quiet',
    size === 'sm' && 'hc-button--sm',
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Default 'secondary'. Only one Button per screen should be 'primary'
   * (docs/design/2026-09-17-ui.md, adoption rule 2). */
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** A styled `<button>`: `variant` picks primary/secondary/quiet, `size` picks the compact form
 * used in a Toolbar. All native button props (onClick, disabled, type, ...) pass through. */
export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps): React.JSX.Element {
  return <button className={buttonClassName(variant, size, className)} {...rest} />;
}

export interface FieldProps {
  label: string;
  hint?: string;
  /** The `id` of the native control inside, so clicking the label focuses it. Leave it out
   * when the child is a `SegmentedControl` or any other group of buttons: the wrapper is a
   * `div`, not a `label`, precisely so a label click can never fire the first button. */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** A labelled control: label above, hint (if given) below in muted small text. Wraps whatever
 * control is passed as `children` (an `input`, `select`, a `SegmentedControl`, ...). The label
 * is associated by `htmlFor`, never by wrapping — a wrapping `<label>` would target the first
 * labelable descendant, and a `SegmentedControl`'s first `<button>` counts, so a click on the
 * label text would silently select the first option. */
export function Field({ label, hint, htmlFor, className, children }: FieldProps): React.JSX.Element {
  return (
    <div className={cx('hc-field', className)}>
      <label className="hc-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint !== undefined && <span className="hc-field__hint">{hint}</span>}
    </div>
  );
}

export interface SegmentedControlOption<T> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}

/** The class name for one segment's button, given whether it is the selected one. Pure, and
 * exported for components.test.ts. */
export function segmentClassName(selected: boolean): string {
  return cx('hc-segmented__option', selected && 'hc-segmented__option--selected');
}

/** One connected group of options, replacing both radio rows and the ad-hoc button pairs
 * ("12 / 20") every screen used to invent for itself. The selected segment is in the accent
 * colour; `ariaLabel` names the group for assistive tech since there is no visible legend. */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: SegmentedControlProps<T>): React.JSX.Element {
  return (
    <div className={cx('hc-segmented', className)} role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={segmentClassName(option.value === value)}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type StatusKind = 'info' | 'busy' | 'success' | 'error';

const STATUS_ICON: Record<StatusKind, string> = { info: 'i', busy: '◐', success: '✓', error: '✕' };
const STATUS_ROLE: Record<StatusKind, 'status' | 'alert'> = {
  info: 'status',
  busy: 'status',
  success: 'status',
  error: 'alert',
};

export interface StatusProps {
  kind: StatusKind;
  className?: string;
  children: ReactNode;
}

/** One line for progress and errors — never a bare red `<p>` (adoption rule 3). A small glyph
 * per kind, coloured from tokens; `busy` spins its glyph with a plain CSS keyframe (no
 * animation library). `role="alert"` for `error` so assistive tech announces it immediately;
 * `role="status"` (polite) for the rest. */
export function Status({ kind, className, children }: StatusProps): React.JSX.Element {
  return (
    <div className={cx('hc-status', `hc-status--${kind}`, className)} role={STATUS_ROLE[kind]}>
      <span className="hc-status__icon" aria-hidden="true">
        {STATUS_ICON[kind]}
      </span>
      <span>{children}</span>
    </div>
  );
}

export interface PanelProps {
  title?: string;
  className?: string;
  children: ReactNode;
}

/** A `--hc-surface` box with standard padding: the one "card-like container" every screen used
 * to build its own border/padding for. */
export function Panel({ title, className, children }: PanelProps): React.JSX.Element {
  return (
    <div className={cx('hc-panel', className)}>
      {title !== undefined && <h3 className="hc-panel__title">{title}</h3>}
      {children}
    </div>
  );
}

export interface ToolbarProps {
  className?: string;
  children: ReactNode;
}

/** A row of (typically quiet) buttons with standard gaps: flip board, restart, new game, and
 * similar secondary actions. Workbench's `footer` is a Toolbar in the typical case, but the
 * primitive itself takes no opinion on what's inside it. */
export function Toolbar({ className, children }: ToolbarProps): React.JSX.Element {
  return <div className={cx('hc-toolbar', className)}>{children}</div>;
}

export interface CardProps {
  title: string;
  blurb: string;
  href: string;
  className?: string;
}

/** One entry in the home page's grid: a title (the link itself) and a blurb underneath. Built
 * for `apps/web`'s route list but generic — any subproject linking out to more of itself could
 * use it too. */
export function Card({ title, blurb, href, className }: CardProps): React.JSX.Element {
  return (
    <a className={cx('hc-card', className)} href={href}>
      <h2 className="hc-card__title">{title}</h2>
      <p className="hc-card__blurb">{blurb}</p>
    </a>
  );
}

export interface CardGridProps {
  className?: string;
  children: ReactNode;
}

/** A responsive grid of `Card`s (or anything else); wraps to as many columns as fit at
 * `--hc-space-4` gaps. Used by the home page; generic beyond that. */
export function CardGrid({ className, children }: CardGridProps): React.JSX.Element {
  return <div className={cx('hc-card-grid', className)}>{children}</div>;
}
