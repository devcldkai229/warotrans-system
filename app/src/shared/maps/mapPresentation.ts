import { colors } from '../theme/colors';

export function zoneColor(type: string): string {
  switch (type) {
    case 'KEEP_OUT': return colors.danger;
    case 'SPEED': return colors.warning;
    case 'JUNCTION': return colors.success;
    case 'NO_STOP': return colors.textSecondary;
    default: return colors.primary;
  }
}

export function zoneLabel(type: string): string {
  return type.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}
