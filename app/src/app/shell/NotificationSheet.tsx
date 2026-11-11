import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  PackageCheck,
  Truck,
} from 'lucide-react-native';
import { colors, ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import { localizedNotificationText, translateText } from '../../shared/i18n';
import { triggerHaptic } from '../../shared/utils/haptics';
import { useRealtime, LiveNotificationEvent } from '../../shared/realtime';
import { notificationDestination } from '../../shared/realtime/notificationInbox';
import { useAuth } from '../../features/auth/authContext';
import { useNavigation } from '../navigation/NavigationContext';

export interface NotificationSheetProps {
  visible: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

/** Compact notification popover; tap outside or use the accessibility escape gesture to close. */
export function NotificationSheet({
  visible,
  onClose,
  onUnreadCountChange,
}: NotificationSheetProps) {
  const topInset = useTopInset();
  const styles = useThemedStyles(createStyles);
  const { navigate } = useNavigation();
  const { session } = useAuth();
  const open = useRef(visible);
  open.current = visible;
  useEffect(() => {
    open.current = visible;
    return () => { open.current = false; };
  }, [visible]);
  const {
    notifications,
    unreadCount,
    markAllNotificationsRead,
    markNotificationRead,
    notificationsAvailable,
    notificationsLoading,
    notificationsRefreshing,
    notificationsError,
    notificationReadError,
    isSavingNotification,
    refreshNotifications,
  } = useRealtime();
  const compact = notifications.length === 0 && !notificationsError && !notificationReadError;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const handleMarkAllRead = () => {
    // Errors stay in this modal. Read state changes only after the server answers.
    void markAllNotificationsRead().catch(() => {});
  };

  const handleItemPress = async (item: LiveNotificationEvent) => {
    triggerHaptic('tap');
    try {
      if (!item.isRead) await markNotificationRead(item.id);
    } catch { return; }
    if (!open.current) return;
    const destination = notificationDestination(item, session);
    if (destination) {
      onClose();
      navigate(destination.screen, destination.params);
    }
  };

  const renderIcon = (item: LiveNotificationEvent) => {
    const isCompleted = item.kind === 'ISSUE_RESOLVED';
    if (isCompleted) {
      return <CheckCircle2 size={16} color={colors.success} strokeWidth={2.2} />;
    }
    if (item.category === 'HAZARD') {
      return <AlertTriangle size={16} color={colors.warning} strokeWidth={2.2} />;
    }
    if (
      item.category === 'JOB_ASSIGNED' ||
      item.title?.toLowerCase().includes('ready') ||
      item.message?.toLowerCase().includes('ready')
    ) {
      return <PackageCheck size={16} color={colors.primary} strokeWidth={2.2} />;
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
      <View style={StyleSheet.absoluteFill} onAccessibilityEscape={onClose}>
        {/* Dismiss Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close notifications dropdown"
        />

        {/* Anchored Popover Card below Header Bell */}
        <View style={[styles.cardContainer, compact && styles.cardCompact, { top: topInset + 54 }]}>
          {/* Top Anchor Caret pointing directly to Notification Bell */}
          <View style={styles.caret} />

          <View style={styles.card}>
            {(notificationReadError || notificationsError) && (
              <View style={styles.state}>
                {notificationReadError && <Text variant="caption" color="dangerText" accessibilityRole="alert">{notificationReadError}</Text>}
                {notificationsError && <Text variant="caption" color="dangerText" accessibilityRole="alert">{notificationsError}</Text>}
                {notificationsAvailable && (
                  <Pressable
                    onPress={() => { void refreshNotifications(); }}
                    disabled={notificationsRefreshing || isSavingNotification}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: notificationsRefreshing || isSavingNotification, busy: notificationsRefreshing }}
                    style={({ pressed }) => [styles.retry, pressed && styles.btnPressed]}
                  >
                    <Text variant="caption" color="primary" fontWeight="600">Try Again</Text>
                  </Pressable>
                )}
              </View>
            )}

            {!notificationsAvailable ? (
              <View style={styles.emptyState}>
                <Text variant="caption" color="textSecondary">Notifications unavailable</Text>
              </View>
            ) : notificationsLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={colors.primary} accessibilityLabel="Loading notifications" />
              </View>
            ) : !notificationsError && notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Bell size={22} color={colors.textMuted} strokeWidth={1.5} />
                <Text variant="caption" color="textSecondary">No notifications yet</Text>
              </View>
            ) : null}

            {/* Notification items list */}
            {notifications.length > 0 && <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {notifications.map((item) => {
                const isCompleted = item.kind === 'ISSUE_RESOLVED';
                const isHazard = item.category === 'HAZARD';
                const isReadyOrAssigned =
                  item.category === 'JOB_ASSIGNED' ||
                  item.title?.toLowerCase().includes('ready') ||
                  item.message?.toLowerCase().includes('ready');
                const rawDisplayTitle = item.title.startsWith('Job JOB-')
                  ? item.title.slice(4)
                  : item.title;
                const localized = localizedNotificationText({
                  title: rawDisplayTitle,
                  content: item.message,
                });
                const localizedTime = translateText(item.timeLabel);

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => { void handleItemPress(item); }}
                    disabled={isSavingNotification}
                    accessibilityRole="button"
                    accessibilityLabel={`${localized.title}, ${localizedTime}, ${translateText(item.isRead ? 'read' : 'unread')}`}
                    accessibilityState={{ disabled: isSavingNotification }}
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
                          {localized.title}
                        </Text>
                      </View>

                      <Text
                        variant="caption"
                        color={colors.textSecondary}
                        style={styles.itemDesc}
                      >
                        {localized.content}
                      </Text>

                      <Text variant="caption" color={colors.textMuted} style={styles.itemTime}>
                        {localizedTime}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>}
            {unreadCount > 0 && (
              <Pressable
                onPress={handleMarkAllRead}
                disabled={isSavingNotification}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
                accessibilityState={{ disabled: isSavingNotification, busy: isSavingNotification }}
                style={({ pressed }) => [styles.footerAction, pressed && styles.btnPressed]}
              >
                {isSavingNotification && <ActivityIndicator size="small" color={colors.primary} />}
                <Text variant="caption" color="primary" fontWeight="600">{isSavingNotification ? 'Saving…' : 'Mark All As Read'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
    },
    cardContainer: {
      position: 'absolute',
      right: 14,
      width: 280,
      zIndex: 1000,
    },
    cardCompact: {
      width: 240,
    },
    caret: {
      position: 'absolute',
      top: -5,
      // Bell center is 84 from the screen edge; subtract the card inset (14) and half the caret (5).
      right: 65,
      width: 10,
      height: 10,
      backgroundColor: colors.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      transform: [{ rotate: '45deg' }],
      zIndex: 10,
    },
    card: {
      width: '100%',
      maxHeight: 320,
      backgroundColor: colors.surface,
      borderRadius: radii.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
      ...shadows.md,
    },
    btnPressed: {
      opacity: 0.65,
    },
    list: {
      maxHeight: 260,
      flexShrink: 1,
      backgroundColor: colors.surface,
    },
    state: {
      paddingHorizontal: 16,
      paddingTop: 14,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 8,
    },
    retry: {
      alignSelf: 'flex-start',
      minHeight: 44,
      justifyContent: 'center',
    },
    footerAction: {
      minHeight: 44,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
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
      backgroundColor: colors.surface,
    },
    itemUnread: {
      backgroundColor: colors.primaryLight,
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
      backgroundColor: colors.primaryLight,
      borderColor: colors.primaryBorder,
    },
    iconBoxHazard: {
      backgroundColor: colors.warningBg,
      borderColor: colors.warningBorder,
    },
    iconBoxJob: {
      backgroundColor: colors.successBg,
      borderColor: colors.successBorder,
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
      backgroundColor: colors.primary,
      flexShrink: 0,
    },
    itemDesc: {
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    itemTime: {
      fontSize: 12,
      fontWeight: '500',
      marginTop: 3,
    },
  });
