import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';

interface SubScreenHeaderProps {
  label: string;
  title: string;
  onBack: () => void;
  rightAction?: React.ReactNode;
}

export function SubScreenHeader({
  label,
  title,
  onBack,
  rightAction,
}: SubScreenHeaderProps) {
  return (
    <View style={styles.header}>
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
          <Text style={styles.eyebrow} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.title} numberOfLines={1}>
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 30,
    ...shadows.panel,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: colors.border,
  },
  titleGroup: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  title: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
  rightAction: {
    marginLeft: 10,
  },
});
