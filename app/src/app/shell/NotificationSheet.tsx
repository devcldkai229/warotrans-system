import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  BatteryMedium,
  CheckCheck,
  CheckCircle2,
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
import { useNavigation } from '../navigation/NavigationContext';

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
  const { navigate } = useNavigation();
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

  const handleItemPress = (item: LiveNotificationEvent) => {
    triggerHaptic('tap');
    markNotificationRead(item.id);
    if (item.jobId) {
      onClose();
      navigate('job_detail', { jobId: item.jobId });
    }
  };

  const renderIcon = (item: LiveNotificationEvent) => {
    const isCompleted = item.title?.includes('Completed') || item.message?.includes('Completed');
    if (isCompleted) {
      return <CheckCircle2 size={14} color="#059669" strokeWidth={2.2} />;
    }
    if (item.category === 'HAZARD') {
      return <AlertTriangle size={14} color="#d97706" strokeWidth={2.2} />;
    }
    if (
      item.category === 'JOB_ASSIGNED' ||
      item.title?.toLowerCase().includes('ready') ||
      item.message?.toLowerCase().includes('ready')
    ) {
      return <PackageCheck size={14} color="#2563eb" strokeWidth={2.2} />;
    }
    return <Truck size={14} color={colors.primaryText} strokeWidth={2.2} />;
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
            {notifications.map((item) => {
              const isCompleted = item.title?.includes('Completed') || item.message?.includes('Completed');
              const isHazard = item.category === 'HAZARD';
              const isReadyOrAssigned =
                item.category === 'JOB_ASSIGNED' ||
                item.title?.toLowerCase().includes('ready') ||
                item.message?.toLowerCase().includes('ready');
              const displayTitle = item.title.startsWith('Job JOB-')
                ? item.title.slice(4)
                : item.title;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleItemPress(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`${displayTitle}, ${item.timeLabel}`}
                  style={({ pressed }) => [
                    styles.item,
                    !item.isRead && styles.itemUnread,
                    pressed && styles.itemPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.iconBox,
                      isCompleted
                        ? styles.iconBoxJob
                        : isHazard
                        ? styles.iconBoxHazard
                        : isReadyOrAssigned
                        ? styles.iconBoxRobot
                        : undefined,
                    ]}
                  >
                    {renderIcon(item)}
                  </View>

                  <View style={styles.itemContent}>
                    <View style={styles.itemTopRow}>
                      {!item.isRead && <View style={styles.unreadDot} />}
                      <Text
                        variant="label"
                        color={colors.textPrimary}
                        numberOfLines={2}
                        style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                      >
                        {displayTitle}
                      </Text>
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
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
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
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.2)',
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
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2563eb',
    flexShrink: 0,
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
