import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Bell, ScanLine } from 'lucide-react-native';
import { ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import { BrandMark } from '../../shared/components/BrandMark';
import { triggerHaptic } from '../../shared/utils/haptics';
import { AccountSheet } from './AccountSheet';
import { NotificationSheet } from './NotificationSheet';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { useRealtime } from '../../shared/realtime';
import { useAuth } from '../../features/auth/authContext';
import { useNavigation } from '../navigation/NavigationContext';

interface AppHeaderProps {
  title?: string;
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
  title,
  operatorName = 'Alex Tran',
  operatorRole = 'Staff',
  initials,
  onLogout,
  initialOpen,
}: AppHeaderProps) {
  const topInset = useTopInset();
  const { styles, colors } = useThemedStyles(createStyles);
  const { unreadCount } = useRealtime();
  const { session } = useAuth();
  const { navigate } = useNavigation();
  const [isAccountOpen, setIsAccountOpen] = useState(initialOpen === 'account');
  const [isNotificationOpen, setIsNotificationOpen] = useState(initialOpen === 'notifications');

  const avatarInitials = initials ?? initialsOf(operatorName);

  return (
    <View style={[styles.header, { paddingTop: topInset + 4 }]}>
      <View style={styles.row}>
        {/* Left: Screen Title (on secondary tabs) or Brand Mark (on Home) */}
        <View style={styles.leftGroup}>
          {title ? (
            <Text variant="display" color={colors.textPrimary} numberOfLines={1} style={styles.title}>
              {title}
            </Text>
          ) : (
            <BrandMark size={40} />
          )}
        </View>

        {/* Right: Notification Bell + Operator Avatar */}
        <View style={styles.rightGroup}>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              navigate('scanner');
            }}
            accessibilityRole="button"
            accessibilityLabel="Scan a code"
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <ScanLine size={21} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setIsNotificationOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Notifications, ${unreadCount} unread`}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
          >
            <Bell size={21} color={colors.textPrimary} strokeWidth={2} />
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
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Account menu for ${operatorName}`}
            style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
          >
            <Text variant="label" color={colors.textPrimary} style={styles.avatarText}>
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
        onOpenManualDrive={
          sessionCan(session, PERMISSIONS.robotManualDrive)
            ? () => navigate('manual_drive')
            : undefined
        }
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
    title: {
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    rightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginLeft: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: radii.full,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    iconBtnPressed: {
      opacity: 0.55,
      transform: [{ scale: 0.94 }],
    },
    notifBadge: {
      position: 'absolute',
      top: 4,
      right: 3,
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
      width: 36,
      height: 36,
      borderRadius: 18,
      marginLeft: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.darkAction : colors.surfaceMuted,
      borderWidth: 1,
      borderColor: isDark ? colors.darkActionBorder : colors.border,
    },
    avatarPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.95 }],
    },
    avatarText: {
      fontWeight: '700',
      fontSize: 13,
      color: colors.textPrimary,
    },
  });