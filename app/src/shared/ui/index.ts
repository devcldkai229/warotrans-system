/**
 * UI primitives.
 *
 * Import from the barrel so a screen never reaches into an individual file:
 *
 *   import { Button, Card, Text, StatusPill, SegmentedControl } from '../../shared/ui';
 *
 * Every primitive is token-driven (see `shared/theme`) — no component here
 * hardcodes a hex value or a font size below 12pt.
 */

export { Text } from './Text';
export type { TextProps, TextColor } from './Text';

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Card } from './Card';
export type { CardProps, CardPadding } from './Card';

export { StatusPill, statusLabel, statusTone } from './StatusPill';
export type { StatusPillProps, StatusValue } from './StatusPill';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedControlOption } from './SegmentedControl';

export { TextField } from './TextField';
export type { TextFieldProps } from './TextField';

export { ScreenHeader } from './ScreenHeader';
export type { ScreenHeaderProps } from './ScreenHeader';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ProgressMeter } from './ProgressMeter';
export type { ProgressMeterProps, MeterTone } from './ProgressMeter';