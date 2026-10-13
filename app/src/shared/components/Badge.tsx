import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
}

export function Badge({ label, tone = 'neutral', size = 'md' }: BadgeProps) {
  const toneStyles = getToneStyles(tone);
  const isSm = size === 'sm';

  return (
    <View style={[styles.badge, toneStyles.container, isSm && styles.badgeSm]}>
      <Text style={[styles.label, toneStyles.text, isSm && styles.labelSm]}>
        {label}
      </Text>
    </View>
  );
}

function getToneStyles(tone: BadgeTone) {
  switch (tone) {
    case 'success':
      return {
        container: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
        text: { color: colors.success },
      };
    case 'warning':
      return {
        container: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
        text: { color: colors.warning },
      };
    case 'danger':
      return {
        container: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
        text: { color: colors.danger },
      };
    case 'info':
      return {
        container: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
        text: { color: colors.info },
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
  },
});
