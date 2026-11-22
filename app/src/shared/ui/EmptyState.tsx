import { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SemanticTone, ThemeColors } from '../theme/colors';
import { useThemeColors } from '../theme/ThemeContext';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  /** Lucide icon component, e.g. `Inbox` or `BatteryLow`. */
  icon?: LucideIcon;
  title: string;
  message?: string;
  /** Primary recovery action — the one thing worth tapping. */
  actionTitle?: string;
  onAction?: () => void;
  /** Tints the icon well. Keep `neutral` unless the empty state is an error. */
  tone?: SemanticTone;
  /** Tightens the vertical rhythm for use inside a card or a docked sheet. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * "Nothing here" with a way out.
 *
 * Every list in the app needs one: an empty fleet view, a job filter with no
 * hits, a transport history before the first request. An empty state without a
 * next action is a dead end on a handheld, so `actionTitle` is wired to the
 * `Button` primitive rather than hand-rolled.
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
  actionTitle,
  onAction,
  tone = 'neutral',
  compact = false,
  style,
}: EmptyStateProps) {
  const colors = useThemeColors();
  const palette = getTonePalette(colors)[tone];
  const IconCmp = Icon;

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {IconCmp ? (
        <View style={[styles.iconSlot, compact && styles.iconSlotCompact]}>
          <IconCmp size={compact ? 24 : 30} color={palette.text} strokeWidth={1.6} />
        </View>
      ) : null}

      <Text variant="headline" textAlign="center">
        {title}
      </Text>

      {message ? (
        <Text variant="body" color={colors.textSecondary} textAlign="center" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {actionTitle && onAction ? (
        <Button title={actionTitle} onPress={onAction} size="md" style={styles.action} />
      ) : null}
    </View>
  );
}

function getTonePalette(colors: ThemeColors): Record<SemanticTone, { text: string }> {
  return {
    neutral: { text: colors.textMuted },
    info: { text: colors.info },
    success: { text: colors.success },
    warning: { text: colors.warning },
    danger: { text: colors.danger },
  };
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  containerCompact: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconSlotCompact: {
    marginBottom: 8,
  },
  message: {
    marginTop: 6,
    maxWidth: 320,
  },
  action: {
    marginTop: 20,
  },
});