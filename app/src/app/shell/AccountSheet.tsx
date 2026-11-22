import { LogOut, Monitor, Moon, SlidersHorizontal, Sun } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { toast } from '../../shared/context/ToastContext';
import { Language, LANGUAGES, useLanguage } from '../../shared/i18n/LanguageContext';
import { ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
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
  /** Omitted when the shell is embedded somewhere that owns sign-out itself. */
  onLogout?: () => void;
  /** Provided when the account holds `robot.manual.drive`. */
  onOpenManualDrive?: () => void;
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

const POPOVER_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/**
 * Anchored Apple-style Account Popover Menu.
 *
 * Floats right beneath the top-right avatar trigger with translucent material,
 * neutral inset segmented controls, and full-bleed hairline menu action rows.
 */
export function AccountSheet({
  visible,
  onClose,
  operatorName,
  operatorUsername,
  operatorRole,
  initials,
  onLogout,
  onOpenManualDrive,
}: AccountSheetProps) {
  const topInset = useTopInset();
  const { mode, setMode, colors, isDark } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const styles = useThemedStyles(createStyles);

  const [reducedMotion, setReducedMotion] = useState(false);
  const enterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReducedMotion);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      enterAnim.setValue(0);
      return;
    }
    enterAnim.setValue(0);
    const animation = Animated.timing(enterAnim, {
      toValue: 1,
      duration: reducedMotion ? 120 : 180,
      easing: POPOVER_EASE_OUT,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [visible, reducedMotion, enterAnim]);

  const handleSignOut = () => {
    triggerHaptic('warning');
    onClose();
    onLogout?.();
    toast.info(t('Signed out of the shift console.'));
  };

  const handleThemeSelect = (nextMode: ThemeMode) => {
    triggerHaptic('tap');
    setMode(nextMode);
  };

  const handleLanguageSelect = (nextLanguage: Language) => {
    triggerHaptic('tap');
    setLanguage(nextLanguage);
  };

  const roleText = t(operatorRole.toUpperCase());
  const destructiveColor = isDark ? '#ff453a' : '#dc2626';
  const webGlassStyle: ViewStyle | null =
    Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        } as unknown as ViewStyle)
      : null;

  const popoverMotionStyle = reducedMotion
    ? { opacity: enterAnim }
    : {
        opacity: enterAnim,
        transformOrigin: '100% 0%',
        transform: [
          {
            scale: enterAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1],
            }),
          },
          {
            translateY: enterAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-4, 0],
            }),
          },
        ],
      };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('Close account menu')}
        />

        <Animated.View
          style={[
            styles.dropdownCard,
            webGlassStyle,
            { top: topInset + 52 },
            popoverMotionStyle,
          ]}
        >
          {/* Operator Profile Header */}
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
              <Text variant="caption" color={colors.textMuted} numberOfLines={1} style={styles.operatorMeta}>
                {operatorUsername ? `@${operatorUsername} · ${roleText}` : roleText}
              </Text>
            </View>
          </View>

          <View style={styles.hairline} />

          {/* Appearance & Language Controls */}
          <View style={styles.controlsSection}>
            <View style={styles.controlGroup}>
              <Text variant="caption" color={colors.textMuted} style={styles.controlLabel}>
                Appearance
              </Text>
              <View style={styles.segmentedTrack} accessibilityRole="radiogroup">
                {THEME_OPTIONS.map((option) => {
                  const isSelected = mode === option.mode;
                  const IconCmp = option.icon;
                  return (
                    <Pressable
                      key={option.mode}
                      onPress={() => handleThemeSelect(option.mode)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${t('Appearance')}: ${t(option.label)}`}
                      style={({ pressed }) => [
                        styles.segmentItem,
                        isSelected && styles.segmentItemActive,
                        pressed && !isSelected && styles.segmentItemPressed,
                      ]}
                    >
                      <IconCmp
                        size={12}
                        color={isSelected ? colors.textPrimary : colors.textSecondary}
                        strokeWidth={isSelected ? 2.15 : 1.9}
                      />
                      <Text
                        variant="caption"
                        color={isSelected ? colors.textPrimary : colors.textSecondary}
                        style={[
                          styles.segmentText,
                          isSelected && styles.segmentTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.controlGroup}>
              <Text variant="caption" color={colors.textMuted} style={styles.controlLabel}>
                Language
              </Text>
              <View style={styles.segmentedTrack} accessibilityRole="radiogroup">
                {LANGUAGES.map((option) => {
                  const isSelected = language === option.code;
                  return (
                    <Pressable
                      key={option.code}
                      onPress={() => handleLanguageSelect(option.code)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${t('Language')}: ${option.label}`}
                      style={({ pressed }) => [
                        styles.segmentItem,
                        isSelected && styles.segmentItemActive,
                        pressed && !isSelected && styles.segmentItemPressed,
                      ]}
                    >
                      <Text
                        variant="caption"
                        color={isSelected ? colors.textPrimary : colors.textSecondary}
                        style={[
                          styles.segmentText,
                          isSelected && styles.segmentTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Action Menu Rows */}
          {(onOpenManualDrive || onLogout) ? <View style={styles.hairline} /> : null}

          {onOpenManualDrive ? (
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                onClose();
                onOpenManualDrive();
              }}
              accessibilityRole="button"
              accessibilityLabel={t('Manual Drive')}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
            >
              <Text variant="bodyMedium" color="textPrimary" style={styles.menuRowLabel}>
                Manual Drive
              </Text>
              <SlidersHorizontal size={16} color={colors.textPrimary} strokeWidth={1.85} />
            </Pressable>
          ) : null}

          {onOpenManualDrive && onLogout ? <View style={styles.hairline} /> : null}

          {onLogout ? (
            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel={t('Sign out of shift')}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowDestructivePressed]}
            >
              <Text variant="bodyMedium" color={destructiveColor} style={styles.menuRowLabel}>
                Sign Out
              </Text>
              <LogOut size={16} color={destructiveColor} strokeWidth={1.85} />
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.28)' : 'rgba(0, 0, 0, 0.06)',
    },
    dropdownCard: {
      position: 'absolute',
      right: 16,
      width: 252,
      backgroundColor: isDark ? 'rgba(34, 36, 40, 0.90)' : 'rgba(255, 255, 255, 0.90)',
      borderRadius: 16,
      borderCurve: 'continuous',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: isDark ? 0.48 : 0.14,
      shadowRadius: 32,
      elevation: 14,
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(60, 60, 67, 0.12)',
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#3a3a3c' : '#1c1c1e',
      borderWidth: isDark ? 1 : 0,
      borderColor: 'rgba(255, 255, 255, 0.16)',
    },
    avatarText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ffffff',
    },
    profileText: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    operatorName: {
      fontSize: 14.5,
      lineHeight: 19,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    operatorMeta: {
      fontSize: 12,
      lineHeight: 15,
    },
    controlsSection: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 11,
    },
    controlGroup: {
      gap: 5,
    },
    controlLabel: {
      fontSize: 11.5,
      lineHeight: 14,
      fontWeight: '500',
      letterSpacing: 0.1,
      paddingHorizontal: 2,
    },
    segmentedTrack: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(118, 118, 128, 0.24)' : 'rgba(118, 118, 128, 0.11)',
      borderRadius: 9,
      borderCurve: 'continuous',
      padding: 2,
      gap: 2,
    },
    segmentItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      height: 30,
      borderRadius: 7,
      borderCurve: 'continuous',
    },
    segmentItemActive: {
      backgroundColor: isDark ? '#3a3b40' : '#ffffff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.04)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.28 : 0.08,
      shadowRadius: 3,
      elevation: 1,
    },
    segmentItemPressed: {
      opacity: 0.65,
      transform: [{ scale: 0.97 }],
    },
    segmentText: {
      fontWeight: '500',
      fontSize: 12,
    },
    segmentTextActive: {
      fontWeight: '600',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      paddingHorizontal: 14,
    },
    menuRowPressed: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    },
    menuRowDestructivePressed: {
      backgroundColor: isDark ? 'rgba(255, 69, 58, 0.14)' : 'rgba(220, 38, 38, 0.08)',
    },
    menuRowLabel: {
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '500',
    },
  });
