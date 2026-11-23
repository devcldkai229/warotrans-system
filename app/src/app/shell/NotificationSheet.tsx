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
  CheckCheck,
  CheckCircle2,
  PackageCheck,
  Truck,
  type LucideIcon,
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

const ALERT_TITLE_PATTERN =
  /\b(cancel|cancelled|cargo|block|blocked|fail|failed|error|hazard|fault)\b/i;
const JOB_READY_PATTERN = /\b(ready|handover|assigned)\b/i;

function notificationIconSpec(
  item: LiveNotificationEvent,
  isDark: boolean,
): { Icon: LucideIcon; color: string; wellBg: string } {
  if (item.kind === 'ISSUE_RESOLVED') {
    return {
      Icon: CheckCircle2,
      color: isDark ? '#30D158' : '#248A3D',
      wellBg: isDark ? 'rgba(48, 209, 88, 0.14)' : 'rgba(52, 199, 89, 0.12)',
    };
  }
  if (
    item.category === 'HAZARD' ||
    item.category === 'BATTERY_LOW' ||
    item.entityType === 'RECOVERY' ||
    ALERT_TITLE_PATTERN.test(item.title)
  ) {
    return {
      Icon: AlertTriangle,
      color: isDark ? '#FF9F0A' : '#B45309',
      wellBg: isDark ? 'rgba(255, 159, 10, 0.14)' : 'rgba(245, 158, 11, 0.12)',
    };
  }
  const neutralWell = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(18, 19, 23, 0.06)';
  const neutralInk = isDark ? '#E4E6EB' : '#1C1C1E';
  if (
    item.category === 'JOB_ASSIGNED' ||
    JOB_READY_PATTERN.test(`${item.title} ${item.message}`)
  ) {
    return {
      Icon: PackageCheck,
      color: neutralInk,
      wellBg: neutralWell,
    };
  }
  return {
    Icon: Truck,
    color: neutralInk,
    wellBg: neutralWell,
  };
}

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
    triggerHaptic('tap');
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

  const renderNotificationIcon = (item: LiveNotificationEvent) => {
    const { Icon, color, wellBg } = notificationIconSpec(item, isDark);
    return (
      <View style={[styles.iconWell, { backgroundColor: wellBg }, item.isRead && styles.iconWellRead]}>
        <Icon size={15} color={color} strokeWidth={2.1} />
      </View>
    );
  };

  const webGlassStyle: ViewStyle | null =
    Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(28px) saturate(190%)',
          WebkitBackdropFilter: 'blur(28px) saturate(190%)',
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
          accessibilityLabel={translateText('Close notifications dropdown')}
        />

        {/* Anchored Popover Card below Header Bell */}
        <Animated.View
          style={[
            styles.dropdownCard,
            webGlassStyle,
            compact && styles.cardCompact,
            { top: topInset + 56 },
            popoverMotionStyle,
          ]}
        >
          {/* Structured Popover Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <Text variant="bodyMedium" color={colors.textPrimary} style={styles.headerTitle}>
                Notifications
              </Text>
              {unreadCount > 0 && (
                <View style={styles.countChip}>
                  <Text variant="caption" color={colors.textPrimary} style={styles.countChipText}>
                    {unreadCount}
                  </Text>
                </View>
              )}
            </View>

            {unreadCount > 0 && (
              <Pressable
                onPress={handleMarkAllRead}
                disabled={isSavingNotification}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={translateText('Mark all as read')}
                accessibilityState={{ disabled: isSavingNotification, busy: isSavingNotification }}
                style={({ pressed }) => [
                  styles.headerActionBtn,
                  pressed && !isSavingNotification && styles.headerActionPressed,
                  isSavingNotification && styles.headerActionDisabled,
                ]}
              >
                {isSavingNotification ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : (
                  <CheckCheck size={13} color={colors.textSecondary} strokeWidth={2.2} />
                )}
                <Text variant="caption" color={colors.textSecondary} style={styles.headerActionText}>
                  {isSavingNotification ? 'Saving…' : 'Mark all read'}
                </Text>
              </Pressable>
            )}
          </View>
          <View style={styles.headerDivider} />

          {(notificationReadError || notificationsError) && (
            <View style={styles.state}>
              {notificationReadError && (
                <Text variant="caption" color="dangerText" accessibilityRole="alert">
                  {notificationReadError}
                </Text>
              )}
              {notificationsError && (
                <Text variant="caption" color="dangerText" accessibilityRole="alert">
                  {notificationsError}
                </Text>
              )}
              {notificationsAvailable && (
                <Pressable
                  onPress={() => { void refreshNotifications(); }}
                  disabled={notificationsRefreshing || isSavingNotification}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: notificationsRefreshing || isSavingNotification,
                    busy: notificationsRefreshing,
                  }}
                  style={({ pressed }) => [styles.retry, pressed && styles.btnPressed]}
                >
                  <Text variant="caption" color="primary" fontWeight="600">Try Again</Text>
                </Pressable>
              )}
            </View>
          )}

          {!notificationsAvailable ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Bell size={17} color={colors.textMuted} strokeWidth={1.8} />
              </View>
              <Text variant="caption" color={colors.textSecondary} style={styles.emptyText}>
                Notifications unavailable
              </Text>
            </View>
          ) : notificationsLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <ActivityIndicator
                  size="small"
                  color={colors.textSecondary}
                  accessibilityLabel={translateText('Loading notifications')}
                />
              </View>
            </View>
          ) : !notificationsError && notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Bell size={17} color={colors.textMuted} strokeWidth={1.8} />
              </View>
              <Text variant="caption" color={colors.textSecondary} style={styles.emptyText}>
                No notifications yet
              </Text>
            </View>
          ) : null}

          {/* Notification items list */}
          {notifications.length > 0 && (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {notifications.map((item, idx) => {
                const rawDisplayTitle = item.title.startsWith('Job JOB-')
                  ? item.title.slice(4)
                  : item.title;
                const localized = localizedNotificationText({
                  title: rawDisplayTitle,
                  content: item.message,
                });
                const localizedTime = translateText(item.timeLabel);
                const isLast = idx === notifications.length - 1;

                return (
                  <View key={item.id}>
                    <Pressable
                      onPress={() => { void handleItemPress(item); }}
                      disabled={isSavingNotification}
                      accessibilityRole="button"
                      accessibilityLabel={`${localized.title}, ${localizedTime}, ${translateText(item.isRead ? 'read' : 'unread')}`}
                      accessibilityState={{ disabled: isSavingNotification }}
                      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                    >
                      {renderNotificationIcon(item)}

                      <View style={styles.itemContent}>
                        <Text
                          variant="label"
                          color={item.isRead ? colors.textSecondary : colors.textPrimary}
                          style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]}
                        >
                          {localized.title}
                        </Text>

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

                      {!item.isRead && <View style={styles.unreadDot} />}
                    </Pressable>
                    {!isLast && <View style={styles.insetDivider} />}
                  </View>
                );
              })}
            </ScrollView>
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
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.34)' : 'rgba(18, 19, 23, 0.08)',
    },
    dropdownCard: {
      position: 'absolute',
      right: 16,
      width: 326,
      maxWidth: '92%',
      maxHeight: 424,
      zIndex: 1000,
      backgroundColor: isDark ? 'rgba(28, 30, 34, 0.94)' : 'rgba(255, 255, 255, 0.94)',
      borderRadius: 18,
      borderCurve: 'continuous',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(18, 19, 23, 0.08)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: isDark ? 0.52 : 0.14,
      shadowRadius: 36,
      elevation: 16,
    },
    cardCompact: {
      width: 260,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 11,
      gap: 8,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      flexShrink: 1,
      minWidth: 0,
    },
    headerTitle: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    countChip: {
      height: 19,
      minWidth: 20,
      paddingHorizontal: 6,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(18, 19, 23, 0.07)',
    },
    countChipText: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    headerActionBtn: {
      minHeight: 28,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderCurve: 'continuous',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    headerActionPressed: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(18, 19, 23, 0.06)',
      opacity: 0.85,
    },
    headerActionDisabled: {
      opacity: 0.5,
    },
    headerActionText: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '600',
    },
    headerDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 19, 23, 0.08)',
    },
    btnPressed: {
      opacity: 0.65,
    },
    list: {
      maxHeight: 360,
      flexShrink: 1,
      backgroundColor: 'transparent',
    },
    listContent: {
      paddingVertical: 4,
    },
    state: {
      marginHorizontal: 12,
      marginTop: 10,
      marginBottom: 4,
      padding: 10,
      borderRadius: 10,
      borderCurve: 'continuous',
      backgroundColor: colors.dangerBg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.dangerBorder,
      gap: 6,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 28,
      gap: 10,
    },
    emptyIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(18, 19, 23, 0.05)',
    },
    emptyText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    retry: {
      alignSelf: 'flex-start',
      minHeight: 36,
      paddingHorizontal: 8,
      borderRadius: 7,
      justifyContent: 'center',
    },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    itemPressed: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(18, 19, 23, 0.04)',
    },
    iconWell: {
      width: 32,
      height: 32,
      marginTop: 1,
      borderRadius: 9,
      borderCurve: 'continuous',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    iconWellRead: {
      opacity: 0.62,
    },
    itemContent: {
      flex: 1,
      minWidth: 0,
    },
    itemTitle: {
      fontSize: 13,
      lineHeight: 18,
      letterSpacing: -0.15,
      fontWeight: '500',
    },
    itemTitleUnread: {
      fontWeight: '600',
    },
    itemDesc: {
      fontSize: 12.5,
      lineHeight: 17.5,
      marginTop: 3,
    },
    itemTime: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      marginTop: 6,
    },
    unreadDot: {
      width: 6.5,
      height: 6.5,
      borderRadius: 3.25,
      backgroundColor: isDark ? '#0A84FF' : '#007AFF',
      marginTop: 6,
      marginLeft: 2,
      flexShrink: 0,
    },
    insetDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 57,
      marginRight: 14,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 19, 23, 0.08)',
    },
  });
