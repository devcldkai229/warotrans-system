import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { colors, ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import { BrandMark } from '../../shared/components/BrandMark';
import { triggerHaptic } from '../../shared/utils/haptics';
import { AccountSheet } from './AccountSheet';
import { NotificationSheet } from './NotificationSheet';
import { useRealtime } from '../../shared/realtime';
import { useAuth } from '../../features/auth/authContext';

interface AppHeaderProps {
  operatorName?: string;
  operatorRole?: string;
  initials?: string;
  onLogout?: () => void;
  initialOpen?: 'account' | 'notifications';
}

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'OP'
  );
}

/**
 * Enterprise Calm Operations Home Header.
 *
 * Structure:
 *   - Left: BrandMark (40px).
 *   - Right: Quick Search (40px) + Notification Bell with Badge (40px) + Operator Avatar (40px).
 */
export function AppHeader({
  operatorName = 'Alex Tran',
  operatorRole = 'Staff',
  initials,
  onLogout,
  initialOpen,
}: AppHeaderProps) {
  const topInset = useTopInset();
  const styles = useThemedStyles(createStyles);
  const { unreadCount } = useRealtime();
  const { session } = useAuth();
  const [isAccountOpen, setIsAccountOpen] = useState(initialOpen === 'account');
  const [isNotificationOpen, setIsNotificationOpen] = useState(initialOpen === 'notifications');

  const avatarInitials = initials ?? initialsOf(operatorName);

  return (
    <View style={[styles.header, { paddingTop: topInset + 4 }]}>
      <View style={styles.row}>
        {/* Left: Brand Mark (40px) */}
        <View style={styles.leftGroup}>
          <BrandMark size={40} />
        </View>

        {/* Right: Notification Bell + Operator Avatar */}
        <View style={styles.rightGroup}>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setIsNotificationOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Notifications, ${unreadCount} unread`}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Bell size={18} color={colors.textPrimary} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setIsAccountOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Account menu for ${operatorName}`}
            style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          >
            <Text variant="label" color="#ffffff" style={styles.avatarText}>
              {avatarInitials}
            </Text>
          </Pressable>
        </View>
      </View>

      <AccountSheet
        visible={isAccountOpen}
        operatorName={operatorName}
        operatorUsername={session?.username}
        operatorRole={operatorRole}
        initials={avatarInitials}
        onClose={() => setIsAccountOpen(false)}
        onLogout={onLogout}
      />

      <NotificationSheet
        visible={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    header: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 16,
      paddingBottom: 10,
      zIndex: 999,
      ...shadows.sm,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 56,
    },
    leftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    rightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.full,
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    iconBtnPressed: {
      backgroundColor: colors.surfaceMuted,
      transform: [{ scale: 0.95 }],
    },
    notifBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.danger,
      borderWidth: 1.5,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    notifBadgeText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: '800',
      lineHeight: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.darkAction : '#121317',
      borderWidth: isDark ? 1 : 0,
      borderColor: colors.darkActionBorder,
    },
    avatarPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.95 }],
    },
    avatarText: {
      fontWeight: '700',
      fontSize: 14,
      color: '#ffffff',
    },
  });