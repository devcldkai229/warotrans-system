import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Bell, ChevronDown, MapPin } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui';
import { BrandMark } from '../../shared/components/BrandMark';
import { triggerHaptic } from '../../shared/utils/haptics';
import { toast } from '../../shared/context/ToastContext';
import { AccountSheet } from './AccountSheet';
import { NotificationSheet } from './NotificationSheet';
import { ZonePickerModal } from './ZonePickerModal';
import { useRealtime } from '../../shared/realtime';
import { useAuth } from '../../features/auth/authContext';

interface AppHeaderProps {
  operatorName?: string;
  operatorRole?: string;
  initials?: string;
  zone?: string;
  onLogout?: () => void;
  onZoneChange?: (zone: string) => void;
  initialOpen?: 'zone' | 'account' | 'notifications';
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
 *   - Left: BrandMark (40px) + Work Zone Selector Pill (40px height).
 *   - Right: Quick Search (40px) + Notification Bell with Badge (40px) + Operator Avatar (40px).
 */
export function AppHeader({
  operatorName = 'Alex Tran',
  operatorRole = 'Staff',
  initials,
  zone = 'Inbound Dock 01',
  onLogout,
  onZoneChange,
  initialOpen,
}: AppHeaderProps) {
  const topInset = useTopInset();
  const { unreadCount } = useRealtime();
  const { session } = useAuth();
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(initialOpen === 'zone');
  const [isAccountOpen, setIsAccountOpen] = useState(initialOpen === 'account');
  const [isNotificationOpen, setIsNotificationOpen] = useState(initialOpen === 'notifications');

  const avatarInitials = initials ?? initialsOf(operatorName);

  const handleZoneChange = (nextZone: string) => {
    triggerHaptic('tap');
    onZoneChange?.(nextZone);
    setIsZoneModalOpen(false);
    toast.info(`Switched zone to ${nextZone}`);
  };

  return (
    <View style={[styles.header, { paddingTop: topInset + 4 }]}>
      <View style={styles.row}>
        {/* Left: Brand Mark (40px) + Work Zone Selector Pill */}
        <View style={styles.leftGroup}>
          <BrandMark size={40} />

          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setIsZoneModalOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Work zone: ${zone}. Tap to change.`}
            style={({ pressed }) => [styles.zonePill, pressed && styles.zonePillPressed]}
          >
            <MapPin size={13} color={colors.primaryText} strokeWidth={2.4} />
            <Text variant="label" color={colors.textPrimary} numberOfLines={1} style={styles.zoneName}>
              {zone}
            </Text>
            <ChevronDown size={13} color={colors.textMuted} strokeWidth={2.2} />
          </Pressable>
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
            <Text variant="label" color={colors.textInverse} style={styles.avatarText}>
              {avatarInitials}
            </Text>
          </Pressable>
        </View>
      </View>

      <ZonePickerModal
        visible={isZoneModalOpen}
        zone={zone}
        onClose={() => setIsZoneModalOpen(false)}
        onSelect={handleZoneChange}
      />

      <AccountSheet
        visible={isAccountOpen}
        operatorName={operatorName}
        operatorUsername={session?.username}
        operatorRole={operatorRole}
        initials={avatarInitials}
        zone={zone}
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

const styles = StyleSheet.create({
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
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 180,
  },
  zonePillPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  zoneName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
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
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ffffff',
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
    backgroundColor: '#121317', // Solid deep ink / black
  },
  avatarPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  avatarText: {
    fontWeight: '700',
    fontSize: 14,
  },
});