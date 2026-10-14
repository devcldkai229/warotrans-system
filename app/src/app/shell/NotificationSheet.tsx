import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  BatteryMedium,
  CheckCheck,
  PackageCheck,
  Truck,
  X,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { toast } from '../../shared/context/ToastContext';
import { useRealtime, LiveNotificationEvent } from '../../shared/realtime';

export interface NotificationSheetProps {
  visible: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

/**
 * Compact Anchored Notification Dropdown Sheet.
 *
 * Drops down cleanly right beneath the notification bell in the AppHeader,
 * providing quick access to live operational alerts without taking over the screen.
 */
export function NotificationSheet({
  visible,
  onClose,
  onUnreadCountChange,
}: NotificationSheetProps) {
  const topInset = useTopInset();
  const {
    notifications,
    unreadCount,
    markAllNotificationsRead,
    markNotificationRead,
  } = useRealtime();

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
    toast.info('All notifications marked as read');
  };

  const handleItemPress = (id: string) => {
    triggerHaptic('tap');
    markNotificationRead(id);
  };

  const renderIcon = (type: LiveNotificationEvent['category']) => {
    switch (type) {
      case 'ROBOT_ARRIVED':
        return <Truck size={14} color={colors.primaryText} strokeWidth={2.2} />;
      case 'HAZARD':
        return <AlertTriangle size={14} color="#d97706" strokeWidth={2.2} />;
      case 'JOB_ASSIGNED':
        return <PackageCheck size={14} color="#059669" strokeWidth={2.2} />;
      case 'BATTERY_LOW':
      default:
        return <BatteryMedium size={14} color={colors.textMuted} strokeWidth={2.2} />;
    }
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
        {/* Dismiss Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close notifications dropdown"
        />

        {/* Dropdown Card Anchored below Header Bell */}
        <View style={[styles.card, { top: topInset + 54 }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text variant="headline" color={colors.textPrimary} style={styles.title}>
                Notifications
              </Text>
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text variant="caption" style={styles.badgeText}>
                    {unreadCount} new
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <Pressable
                  onPress={handleMarkAllRead}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all as read"
                  style={({ pressed }) => [styles.markReadBtn, pressed && styles.btnPressed]}
                >
                  <CheckCheck size={13} color={colors.primaryText} strokeWidth={2.2} />
                  <Text variant="caption" color={colors.primaryText} style={styles.markReadText}>
                    Mark all read
                  </Text>
                </Pressable>
              )}

              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close notifications"
                style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
              >
                <X size={14} color={colors.textSecondary} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          {/* List of Alerts */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {notifications.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleItemPress(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${item.timeLabel}`}
                style={({ pressed }) => [
                  styles.item,
                  !item.isRead && styles.itemUnread,
                  pressed && styles.itemPressed,
                ]}
              >
                <View
                  style={[
                    styles.iconBox,
                    item.category === 'HAZARD' && styles.iconBoxHazard,
                    item.category === 'JOB_ASSIGNED' && styles.iconBoxJob,
                    item.category === 'ROBOT_ARRIVED' && styles.iconBoxRobot,
                  ]}
                >
                  {renderIcon(item.category)}
                </View>

                <View style={styles.itemContent}>
                  <View style={styles.itemTopRow}>
                    <Text
                      variant="label"
                      color={colors.textPrimary}
                      numberOfLines={1}
                      style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                    >
                      {item.title}
                    </Text>
                    {!item.isRead && <View style={styles.unreadDot} />}
                  </View>

                  <Text
                    variant="caption"
                    color={colors.textSecondary}
                    numberOfLines={2}
                    style={styles.itemDesc}
                  >
                    {item.message}
                  </Text>

                  <Text variant="caption" color={colors.textMuted} style={styles.itemTime}>
                    {item.timeLabel}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
  },
  card: {
    position: 'absolute',
    right: 12,
    width: 320,
    maxHeight: 390,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#f8fafc',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontWeight: '800',
    fontSize: 14,
  },
  badge: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.full,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#78350f',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(21, 87, 208, 0.06)',
  },
  markReadText: {
    fontSize: 11,
    fontWeight: '600',
  },
  closeBtn: {
    width: 24,
    height: 24,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnPressed: {
    opacity: 0.65,
  },
  list: {
    maxHeight: 330,
    backgroundColor: '#ffffff',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#ffffff',
  },
  itemUnread: {
    backgroundColor: '#f6f9fe',
  },
  itemPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  iconBoxRobot: {
    backgroundColor: 'rgba(21, 87, 208, 0.08)',
    borderColor: 'rgba(21, 87, 208, 0.2)',
  },
  iconBoxHazard: {
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    borderColor: 'rgba(217, 119, 6, 0.2)',
  },
  iconBoxJob: {
    backgroundColor: 'rgba(5, 150, 105, 0.08)',
    borderColor: 'rgba(5, 150, 105, 0.2)',
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  itemTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
  },
  itemTitleUnread: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  unreadDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primaryText,
  },
  itemDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  itemTime: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3,
  },
});
