import { ArrowLeft } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';
import { useTopInset } from '../theme/layout';
import { radii } from '../theme/radii';
import { shadows } from '../theme/shadows';
import { Text } from './Text';

/**
 * Minimum height of the header row, excluding the safe-area inset.
 *
 * `minHeight`, never a fixed `height`: a long subtitle (an endpoint name, a
 * filter hint) wraps to two lines and has to be able to grow the header rather
 * than being clipped by a fixed row.
 */
const HEADER_CONTENT_HEIGHT = 48;

/** Gap between the title block and the bottom hairline. */
const HEADER_BOTTOM_PADDING = 8;

export interface ScreenHeaderProps {
  title: string;
  /** Secondary line: the endpoint being worked, the job number, a filter hint. */
  subtitle?: string;
  /** Renders the back chevron. Ignored unless `onBack` is also provided. */
  canGoBack?: boolean;
  onBack?: () => void;
  /** Trailing control — a status pill, an icon button, a compact `Button`. */
  rightAction?: React.ReactNode;
  /** Lets map/sheet content show through. Drops the hairline and the shadow. */
  transparent?: boolean;
  /** Defaults to true; set false when the header sits flush on a card. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Standard header for every full-screen route.
 *
 * The top padding comes from `useTopInset()` — the real device inset on native
 * (20pt on an SE up to 59pt on a Dynamic Island) and the simulated status-bar
 * height inside the web phone frame. Never hardcode it here; the header must
 * not drift from the status bar `App.tsx` paints.
 *
 * Stays a plain `View` (never `SafeAreaView`) so the app keeps rendering edge
 * to edge; only this element opts into the inset.
 */
export function ScreenHeader({
  title,
  subtitle,
  canGoBack = false,
  onBack,
  rightAction,
  transparent = false,
  bordered = true,
  style,
}: ScreenHeaderProps) {
  const topInset = useTopInset();
  const showBack = canGoBack && !!onBack;

  return (
    <View
      style={[
        styles.header,
        { paddingTop: topInset, minHeight: topInset + HEADER_CONTENT_HEIGHT + HEADER_BOTTOM_PADDING },
        transparent ? styles.transparent : styles.surface,
        bordered && !transparent ? styles.bordered : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {showBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={6}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          >
            <ArrowLeft size={22} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        ) : null}

        <View style={styles.titleGroup}>
          <Text variant="headline" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingBottom: HEADER_BOTTOM_PADDING,
  },
  surface: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  bordered: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    minHeight: HEADER_CONTENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  backBtnPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
  rightAction: {
    flexShrink: 0,
  },
});