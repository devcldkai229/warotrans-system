import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { shadows } from '../theme/shadows';
import { useTopInset } from '../theme/layout';
import { Text } from '../ui/Text';

interface SubScreenHeaderProps {
  label?: string;
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}

const HEADER_CONTENT = 56;

export function SubScreenHeader({
  label,
  title,
  onBack,
  rightAction,
}: SubScreenHeaderProps) {
  const topInset = useTopInset();

  return (
    <View style={[styles.header, { paddingTop: topInset, minHeight: topInset + HEADER_CONTENT }]}>
      <View style={styles.leftGroup}>
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.titleGroup}>
          {label ? (
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.eyebrow}>
              {label}
            </Text>
          ) : null}
          <Text variant="headline" color={colors.textPrimary} numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
      </View>

      {rightAction && <View style={styles.rightAction}>{rightAction}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 30,
    ...shadows.sm,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  title: {
    fontWeight: '700',
  },
  rightAction: {
    marginLeft: 8,
  },
});
