import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  PackageCheck,
  Truck,
} from 'lucide-react-native';
import { ThemeColors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useTheme, useThemedStyles } from '../../shared/theme/ThemeContext';
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

const POPOVER_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** Compact notification popover; tap outside or use the accessibility escape gesture to close. */
export function NotificationSheet({
  visible,
  onClose,
  onUnreadCountChange,
}: NotificationSheetProps) {
  const topInset = useTopInset();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { navigate } = useNavigation();
  const { session } = useAuth();
  const open = useRef(visible);
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
    return <Truck size={16} color={colors.primary} strokeWidth={2.2} />;
  };

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
      <View style={StyleSheet.absoluteFill} onAccessibilityEscape={onClose}>
        {/* Dismiss Backdrop */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close notifications dropdown"
        />

        {/* Anchored Popover Card below Header Bell */}
        <Animated.View
          style={[
            styles.dropdownCard,
            webGlassStyle,
            compact && styles.cardCompact,
            { top: topInset + 52 },
            popoverMotionStyle,
          ]}
        >
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
                    <View style={styles.iconSlot}>
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
      width: 280,
      maxHeight: 340,
      zIndex: 1000,
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
    cardCompact: {
      width: 240,
    },
    btnPressed: {
      opacity: 0.65,
    },
    list: {
      maxHeight: 280,
      flexShrink: 1,
      backgroundColor: 'transparent',
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
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(60, 60, 67, 0.12)',
    },
    listContent: {
      paddingBottom: 4,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(60, 60, 67, 0.12)',
      backgroundColor: 'transparent',
    },
    itemUnread: {
      backgroundColor: isDark ? 'rgba(45, 136, 255, 0.12)' : 'rgba(50, 121, 249, 0.06)',
    },
    itemPressed: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    },
    iconSlot: {
      width: 20,
      paddingTop: 2,
      alignItems: 'center',
      flexShrink: 0,
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
