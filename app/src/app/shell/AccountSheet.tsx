import { LogOut, Monitor, Moon, Sun } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { toast } from '../../shared/context/ToastContext';
import { ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { ThemeMode, useTheme, useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  operatorName: string;
  operatorUsername?: string;
  operatorRole: string;
  /** Avatar initials, computed by the caller from the operator name. */
  initials: string;
  zone: string;
  /** Omitted when the shell is embedded somewhere that owns sign-out itself. */
  onLogout?: () => void;
}

const THEME_OPTIONS: ReadonlyArray<{
  mode: ThemeMode;
  label: string;
  icon: LucideIcon;
}> = [
  { mode: 'system', label: 'Auto', icon: Monitor },
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
];

/**
 * Anchored Account Dropdown Card.
 *
 * Drops down cleanly right beneath the avatar with an ultra-lightweight,
 * transparent dismiss layer instead of a heavy centered screen modal.
 */
export function AccountSheet({
  visible,
  onClose,
  operatorName,
  operatorUsername,
  operatorRole,
  initials,
  zone,
  onLogout,
}: AccountSheetProps) {
  const topInset = useTopInset();
  const { mode, setMode, colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const handleSignOut = () => {
    triggerHaptic('warning');
    onClose();
    onLogout?.();
    toast.info('Signed out of the shift console.');
  };

  const handleThemeSelect = (nextMode: ThemeMode) => {
    triggerHaptic('tap');
    setMode(nextMode);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close account menu"
        />

        <View style={[styles.dropdownCard, { top: topInset + 50 }]}>
          {/* Operator Profile */}
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text variant="caption" color="#ffffff" style={styles.avatarText}>
                {initials}
              </Text>
            </View>
            <View style={styles.profileText}>
              <Text variant="bodyMedium" numberOfLines={1} style={styles.operatorName}>
                {operatorName}
              </Text>
              <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {operatorUsername
                  ? `@${operatorUsername} · ${operatorRole.toUpperCase()} · ${zone}`
                  : `${operatorRole.toUpperCase()} · ${zone}`}
              </Text>
            </View>
          </View>

          {/* Shift Details */}
          <View style={styles.shiftBox}>
            <Text variant="caption" color={colors.textSecondary}>
              Current shift
            </Text>
            <Text variant="label" color={colors.textPrimary}>
              Morning (06:00 – 14:00)
            </Text>
          </View>

          {/* Appearance Theme Switcher */}
          <View style={styles.appearanceSection}>
            <Text variant="caption" color={colors.textSecondary} style={styles.appearanceLabel}>
              Appearance
            </Text>
            <View style={styles.themeTrack} accessibilityRole="radiogroup">
              {THEME_OPTIONS.map((option) => {
                const isSelected = mode === option.mode;
                const IconCmp = option.icon;
                return (
                  <Pressable
                    key={option.mode}
                    onPress={() => handleThemeSelect(option.mode)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Appearance: ${option.label}`}
                    style={({ pressed }) => [
                      styles.themeSegment,
                      isSelected && styles.themeSegmentActive,
                      pressed && !isSelected && styles.themeSegmentPressed,
                    ]}
                  >
                    <IconCmp
                      size={13}
                      color={isSelected ? colors.primaryText : colors.textSecondary}
                      strokeWidth={isSelected ? 2.4 : 2.0}
                    />
                    <Text
                      variant="caption"
                      color={isSelected ? colors.primaryText : colors.textSecondary}
                      style={[
                        styles.themeSegmentText,
                        isSelected && styles.themeSegmentTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Sign Out Action */}
          {onLogout ? (
            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out of shift"
              style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
            >
              <LogOut size={15} color={colors.dangerText} />
              <Text variant="label" color={colors.dangerText}>
                Sign Out
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(15, 23, 42, 0.18)',
    },
    dropdownCard: {
      position: 'absolute',
      right: 16,
      width: 268,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      padding: 12,
      gap: 10,
      ...shadows.lg,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.darkAction : '#121317',
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.darkActionBorder,
    },
    avatarText: {
      fontWeight: '700',
      color: '#ffffff',
    },
    profileText: {
      flex: 1,
      minWidth: 0,
    },
    operatorName: {
      fontWeight: '700',
    },
    shiftBox: {
      padding: 8,
      borderRadius: radii.md,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 2,
    },
    appearanceSection: {
      gap: 6,
    },
    appearanceLabel: {
      fontWeight: '600',
      paddingHorizontal: 2,
    },
    themeTrack: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceSubtle,
      borderRadius: radii.md,
      padding: 3,
      gap: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    themeSegment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 32,
      borderRadius: radii.sm,
    },
    themeSegmentActive: {
      backgroundColor: colors.primaryLight,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
    },
    themeSegmentPressed: {
      backgroundColor: colors.surfaceMuted,
    },
    themeSegmentText: {
      fontWeight: '500',
      fontSize: 12,
    },
    themeSegmentTextActive: {
      fontWeight: '700',
    },
    signOutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 38,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    signOutBtnPressed: {
      opacity: 0.85,
    },
  });
