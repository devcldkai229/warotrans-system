import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  CheckCheck,
  CheckCircle2,
  PackageCheck,
  Truck,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
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
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        {/* Dismiss Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close notifications bottom sheet"
        />

        {/* Bottom Sheet Container */}
        <View style={styles.sheet}>
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          {/* Sheet Header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Notifications</Text>

            {unreadCount > 0 && (
              <Pressable
                onPress={handleMarkAllRead}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
                style={({ pressed }) => [styles.markReadBtn, pressed && styles.btnPressed]}
              >
                <CheckCheck size={18} color={colors.primary} strokeWidth={2.2} />
              </Pressable>
            )}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '62%',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 16,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  markReadBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(50, 121, 249, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.65,
  },
  list: {
    flexGrow: 0,
    backgroundColor: '#ffffff',
  },
  listContent: {
    paddingBottom: 28,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
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
    width: 32,
    height: 32,
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
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
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
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  itemTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
});
