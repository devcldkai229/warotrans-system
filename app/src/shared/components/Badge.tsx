import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { translateText } from '../i18n';
import { useThemeColors } from '../theme/ThemeContext';
import { typography } from '../theme/typography';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

export function Badge({ label, tone = 'neutral', size = 'md' }: BadgeProps) {
  const colors = useThemeColors();
  const toneStyles = getToneStyles(tone, colors);
  const isSm = size === 'sm';

  return (
    <View style={[styles.badge, toneStyles.container, isSm && styles.badgeSm]}>
      <Text style={[styles.label, toneStyles.text, isSm && styles.labelSm]}>
        {translateText(label)}
      </Text>
    </View>
  );
}

function getToneStyles(tone: BadgeTone, colors: ThemeColors) {
  switch (tone) {
    case 'success':
      return {
        container: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
        text: { color: colors.successText },
      };
    case 'warning':
      return {
        container: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
        text: { color: colors.warningText },
      };
    case 'danger':
      return {
        container: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
        text: { color: colors.dangerText },
      };
    case 'info':
      return {
        container: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
        text: { color: colors.infoText },
      };
    case 'neutral':
    default:
      return {
        container: { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
        text: { color: colors.textSecondary },
      };
  }
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  label: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelSm: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: typography.fontSans,
  },
});
