import { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, SemanticTone } from '../theme/colors';
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
  const palette = TONE_PALETTE[tone];
  const IconCmp = Icon;

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {IconCmp ? (
        <View
          style={[
            styles.iconWell,
            compact && styles.iconWellCompact,
            { backgroundColor: palette.well },
          ]}
        >
          <IconCmp size={compact ? 22 : 28} color={palette.text} strokeWidth={1.8} />
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

const TONE_PALETTE: Record<SemanticTone, { well: string; text: string }> = {
  neutral: { well: colors.surfaceSubtle, text: colors.textMuted },
  info: { well: colors.infoBg, text: colors.info },
  success: { well: colors.successBg, text: colors.success },
  warning: { well: colors.warningBg, text: colors.warning },
  danger: { well: colors.dangerBg, text: colors.danger },
};

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
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconWellCompact: {
    width: 48,
    height: 48,
    marginBottom: 12,
  },
  message: {
    marginTop: 6,
    maxWidth: 320,
  },
  action: {
    marginTop: 20,
  },
});