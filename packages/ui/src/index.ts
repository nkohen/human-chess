// The shared look (docs/design/2026-09-17-ui.md): design tokens, native-control base styles, a
// handful of primitives, and the two page layouts every subproject renders inside. Depends on
// react only. Importing this module pulls in tokens.css and base.css as side effects — every
// consumer gets them exactly once, the same way @human-chess/board pulls in chessground's CSS.
import './tokens.css';
import './base.css';

export {
  Button,
  Card,
  CardGrid,
  Field,
  Panel,
  SegmentedControl,
  Status,
  Toolbar,
  buttonClassName,
  cx,
  segmentClassName,
} from './components';
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  CardGridProps,
  CardProps,
  FieldProps,
  PanelProps,
  SegmentedControlOption,
  SegmentedControlProps,
  StatusKind,
  StatusProps,
  ToolbarProps,
} from './components';

export { AppShell, Page, Workbench } from './layouts';
export type { AppShellProps, PageProps, PageWidth, WorkbenchProps } from './layouts';

export { fitSquare } from './fit';
export { useFitSquare } from './useFitSquare';

export { handoffHash, navigateWithHandoff, readHandoffParams, routeOf } from './handoff';

export { clearPersisted, isBoolean, isFiniteNumber, isOneOf, isRecord, isString, isStringArray, readPersisted, usePersistedState, writePersisted } from './persisted';
export type { PersistedStateOptions, PersistedStorage } from './persisted';
