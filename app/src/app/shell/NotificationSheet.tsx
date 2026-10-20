import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
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
 * Native Bottom Sheet for Operational Notifications.
 *
 * Slides up from the bottom of the screen with a native drag pill,
 * full backdrop tap-to-dismiss, and compact mark-all-read action.
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
      return <CheckCircle2 size={16} color="#059669" strokeWidth={2.2} />;
    }
    if (item.category === 'HAZARD') {
      return <AlertTriangle size={16} color="#d97706" strokeWidth={2.2} />;
    }
    if (
      item.category === 'JOB_ASSIGNED' ||
      item.title?.toLowerCase().includes('ready') ||
      item.message?.toLowerCase().includes('ready')
    ) {
      return <PackageCheck size={16} color="#2563eb" strokeWidth={2.2} />;
    }
    return <Truck size={16} color={colors.primaryText} strokeWidth={2.2} />;
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
        {/* Dismiss Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close notifications dropdown"
        />

        {/* Anchored Popover Card below Header Bell */}
        <View style={[styles.cardContainer, { top: topInset + 54 }]}>
          {/* Top Anchor Caret pointing directly to Notification Bell */}
          <View style={styles.caret} />

          <View style={styles.card}>
            {/* Minimalist Popover Header */}
            <View style={styles.header}>
              <Text variant="headline" color={colors.textPrimary} style={styles.title}>
                Notifications
              </Text>

              <View style={styles.headerActions}>
                {unreadCount > 0 && (
                  <Pressable
                    onPress={handleMarkAllRead}
                    accessibilityRole="button"
                    accessibilityLabel="Mark all as read"
                    style={({ pressed }) => [styles.iconActionBtn, pressed && styles.btnPressed]}
                  >
                    <CheckCheck size={14} color={colors.primary} strokeWidth={2.2} />
                  </Pressable>
                )}

                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close notifications"
                  style={({ pressed }) => [styles.iconActionBtn, pressed && styles.btnPressed]}
                >
                  <X size={14} color={colors.textSecondary} strokeWidth={2.2} />
                </Pressable>
              </View>
            </View>

            {/* Notification items list */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
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
                          style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                        >
                          {displayTitle}
                        </Text>
                      </View>

                      <Text
                        variant="caption"
                        color={colors.textSecondary}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  cardContainer: {
    position: 'absolute',
    right: 14,
    width: 280,
    zIndex: 1000,
  },
  caret: {
    position: 'absolute',
    top: -5,
    right: 64,
    width: 10,
    height: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: colors.borderStrong,
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
  },
  card: {
    width: 280,
    maxHeight: 320,
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
  title: {
    fontWeight: '800',
    fontSize: 14,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.65,
  },
  list: {
    maxHeight: 260,
    backgroundColor: '#ffffff',
  },
  listContent: {
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
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
    marginTop: 2,
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
    lineHeight: 17,
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
