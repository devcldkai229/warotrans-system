import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  LogOut,
  X,
} from 'lucide-react-native';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { toast } from '../context/ToastContext';
import { triggerHaptic } from '../utils/haptics';
import { BrandMark } from './BrandMark';

interface AppHeaderProps {
  operatorName?: string;
  zone?: string;
  onLogout?: () => void;
  onZonePress?: () => void;
  onNotificationsPress?: () => void;
}

export function AppHeader({
  zone = 'Inbound Dock 01',
  onLogout,
  onZonePress,
  onNotificationsPress,
}: AppHeaderProps) {
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);

  const handleOpenNotifications = () => {
    triggerHaptic('tap');
    if (onNotificationsPress) {
      onNotificationsPress();
    } else {
      setIsNotifModalOpen(true);
    }
  };

  const handleDismissNotifications = () => {
    setHasUnread(false);
    setIsNotifModalOpen(false);
    triggerHaptic('tap');
  };

  return (
    <View style={styles.header}>
      {/* Brand & Zone Dropdown */}
      <View style={styles.leftGroup}>
        {/* Authentic WaroTrans BrandMark */}
        <BrandMark size={38} />

        <View style={styles.textGroup}>
          <Text style={styles.facilitySubtitle}>WAROTRANS FACILITY</Text>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onZonePress?.();
            }}
            style={({ pressed }) => [
              styles.zoneButton,
              pressed && styles.zoneButtonPressed,
            ]}
          >
            <Text style={styles.zoneName} numberOfLines={1}>
              {zone}
            </Text>
            <ChevronDown size={13} color={colors.textSecondary} style={styles.chevron} />
          </Pressable>
        </View>
      </View>

      {/* Right Actions: Bell + Logout + Avatar */}
      <View style={styles.rightGroup}>
        {/* Notifications Bell */}
        <Pressable
          onPress={handleOpenNotifications}
          style={({ pressed }) => [
            styles.iconCircle,
            pressed && styles.iconCirclePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={17} color={colors.textPrimary} />
          {hasUnread && <View style={styles.bellBadge} />}
        </Pressable>

        {/* Quick Shift Logout */}
        {onLogout && (
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setIsLogoutModalOpen(true);
            }}
            style={({ pressed }) => [
              styles.logoutCircle,
              pressed && styles.logoutCirclePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign out of shift"
          >
            <LogOut size={16} color={colors.textSecondary} />
          </Pressable>
        )}

        {/* User Avatar */}
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>AT</Text>
        </View>
      </View>

      {/* Real-Time Facility Notifications Modal */}
      <Modal
        visible={isNotifModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsNotifModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheetContainer}>
            {/* Top Drag Handle Indicator */}
            <View style={styles.dragHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>FACILITY TELEMETRY</Text>
                <Text style={styles.sheetTitle}>Real-Time Notifications</Text>
              </View>
              <Pressable
                onPress={() => setIsNotifModalOpen(false)}
                style={styles.closeBtn}
              >
                <X size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.notificationsList}>
              {/* Alert Item 1 */}
              <View style={styles.notifItem}>
                <View style={styles.notifIconSuccess}>
                  <Check size={14} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.notifItemTop}>
                    <Text style={styles.notifItemTitle}>AMR-01 Arrived</Text>
                    <Text style={styles.notifTime}>Just now</Text>
                  </View>
                  <Text style={styles.notifItemDesc}>
                    Robot is awaiting physical cargo handover at Rack A-02.
                  </Text>
                </View>
              </View>

              {/* Alert Item 2 */}
              <View style={styles.notifItem}>
                <View style={styles.notifIconWarning}>
                  <AlertTriangle size={14} color={colors.warning} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.notifItemTop}>
                    <Text style={styles.notifItemTitleWarning}>Deadlock Resolved</Text>
                    <Text style={styles.notifTime}>3m ago</Text>
                  </View>
                  <Text style={styles.notifItemDesc}>
                    AMR-02 yielded right-of-way in Aisle 2 corridor. Normal Nav2 path clear.
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={handleDismissNotifications}
              style={({ pressed }) => [
                styles.markReadBtn,
                pressed && styles.markReadBtnPressed,
              ]}
            >
              <Text style={styles.markReadText}>Dismiss & Mark As Read</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Shift Logout Confirmation Modal */}
      <Modal
        visible={isLogoutModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsLogoutModalOpen(false)}
      >
        <View style={styles.logoutModalOverlay}>
          <View style={styles.logoutDialog}>
            <View style={styles.logoutIconCircle}>
              <LogOut size={22} color={colors.danger} />
            </View>
            <Text style={styles.logoutDialogTitle}>End Shift & Sign Out?</Text>
            <Text style={styles.logoutDialogDesc}>
              Are you sure you want to sign out of the active shift console? Your current work zone and assigned queue will remain registered in WES.
            </Text>

            <View style={styles.logoutBtnRow}>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setIsLogoutModalOpen(false);
                }}
                style={({ pressed }) => [
                  styles.cancelLogoutBtn,
                  pressed && styles.cancelLogoutBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel sign out"
              >
                <Text style={styles.cancelLogoutText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic('warning');
                  setIsLogoutModalOpen(false);
                  onLogout?.();
                  toast.info('Logged out from shift console.');
                }}
                style={({ pressed }) => [
                  styles.confirmLogoutBtn,
                  pressed && styles.confirmLogoutBtnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm sign out"
              >
                <Text style={styles.confirmLogoutText}>Sign Out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 40,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  textGroup: {
    flex: 1,
    justifyContent: 'center',
    marginLeft: 2,
  },
  facilitySubtitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.primary,
    fontFamily: typography.fontSans,
    marginBottom: 1,
  },
  zoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoneButtonPressed: {
    opacity: 0.7,
  },
  zoneName: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    maxWidth: 155,
    fontFamily: typography.fontSans,
  },
  chevron: {
    marginLeft: 3,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCirclePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  bellBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  logoutCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCirclePressed: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: typography.fontMono,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    ...shadows.sheet,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 12,
  },
  sheetEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  notificationsList: {
    gap: 10,
    marginBottom: 16,
  },
  notifItem: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    alignItems: 'flex-start',
  },
  notifIconSuccess: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconWarning: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  notifItemTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  notifItemTitleWarning: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
  },
  notifTime: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  notifItemDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
  },
  markReadBtn: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  markReadBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logoutDialog: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    ...shadows.panel,
  },
  logoutIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoutDialogTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    textAlign: 'center',
  },
  logoutDialogDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 17,
  },
  logoutBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },
  cancelLogoutBtn: {
    flex: 1,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLogoutBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  cancelLogoutText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  confirmLogoutBtn: {
    flex: 1,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  confirmLogoutBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  confirmLogoutText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.fontSans,
  },
});
