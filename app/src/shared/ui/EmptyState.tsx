import { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SemanticTone, ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { ThemeShadows } from '../theme/shadows';
import { useThemedStyles } from '../theme/ThemeContext';
import { Button, ButtonSize, ButtonVariant } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  /** Lucide icon component, e.g. `Radio` or `ClipboardCheck`. */
  icon?: LucideIcon;
  title: string;
  message?: string;
  /** Primary recovery action — the one thing worth tapping. */
  actionTitle?: string;
  onAction?: () => void;
  actionVariant?: ButtonVariant;
  actionSize?: ButtonSize;
  actionIcon?: LucideIcon;
  actionIconPosition?: 'left' | 'right';
  /** Quiet live-status pill shown beneath the message when standing by. */
  statusIndicator?: { label: string; tone?: SemanticTone };
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
  actionVariant = 'primary',
  actionSize = 'md',
  actionIcon,
  actionIconPosition = 'left',
  statusIndicator,
  tone = 'neutral',
  compact = false,
  style,
}: EmptyStateProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const palette = getTonePalette(colors)[tone];
  const indicatorPalette = statusIndicator ? getTonePalette(colors)[statusIndicator.tone ?? 'neutral'] : null;
  const IconCmp = Icon;

  return (
    <View style={[styles.container, compact && styles.containerCompact, style]}>
      {IconCmp ? (
        <View
          style={[
            styles.iconWell,
            compact && styles.iconWellCompact,
            tone === 'neutral' ? styles.iconWellNeutral : { backgroundColor: palette.bg, borderColor: palette.border },
          ]}
        >
          <IconCmp size={compact ? 20 : 24} color={palette.text} strokeWidth={1.75} />
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

      {statusIndicator && indicatorPalette ? (
        <View style={styles.statusPill}>
          <View style={[styles.statusDot, { backgroundColor: indicatorPalette.dot }]} />
          <Text variant="caption" color={colors.textSecondary} fontWeight="500">
            {statusIndicator.label}
          </Text>
        </View>
      ) : null}

      {actionTitle && onAction ? (
        <Button
          title={actionTitle}
          onPress={onAction}
          variant={actionVariant}
          size={actionSize}
          icon={actionIcon}
          iconPosition={actionIconPosition}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

function getTonePalette(
  colors: ThemeColors,
): Record<SemanticTone, { text: string; bg: string; border: string; dot: string }> {
  return {
    neutral: { text: colors.textSecondary, bg: colors.surface, border: colors.border, dot: colors.textMuted },
    info: { text: colors.infoText, bg: colors.infoBg, border: colors.infoBorder, dot: colors.info },
    success: { text: colors.successText, bg: colors.successBg, border: colors.successBorder, dot: colors.success },
    warning: { text: colors.warningText, bg: colors.warningBg, border: colors.warningBorder, dot: colors.warning },
    danger: { text: colors.dangerText, bg: colors.dangerBg, border: colors.dangerBorder, dot: colors.danger },
  };
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
  StyleSheet.create({
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
      width: 52,
      height: 52,
      borderRadius: 14,
      borderCurve: 'continuous',
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    iconWellCompact: {
      width: 44,
      height: 44,
      borderRadius: 12,
      marginBottom: 10,
    },
    iconWellNeutral: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      ...shadows.sm,
    },
    message: {
      marginTop: 6,
      maxWidth: 280,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      flexShrink: 0,
    },
    action: {
      marginTop: 20,
    },
  });