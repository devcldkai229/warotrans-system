import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
          <ArrowLeft size={22} color={colors.textPrimary} />
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 48 : 14,
    paddingBottom: 14,
    minHeight: Platform.OS === 'ios' ? 104 : 72,
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
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  titleGroup: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: colors.primary,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  rightAction: {
    marginLeft: 10,
  },
});
