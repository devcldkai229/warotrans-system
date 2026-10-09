import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
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
  Clock3,
  LogOut,
  MapPin,
  RefreshCw,
  X,
} from 'lucide-react-native';
import { colors } from '../theme/colors';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { toast } from '../context/ToastContext';
import { triggerHaptic } from '../utils/haptics';
import { BrandMark } from './BrandMark';

const WORK_ZONE_DROPDOWN_ITEMS = [
  'Inbound Dock 01',
  'Storage Zone A (Racks A01-A12)',
  'Storage Zone B (Racks B01-B08)',
  'Outbound Shipping Bay 01',
];

interface AppHeaderProps {
  operatorName?: string;
  zone?: string;
  onLogout?: () => void;
  onZonePress?: () => void;
  onZoneChange?: (zone: string) => void;
  onNotificationsPress?: () => void;
}

export function AppHeader({
  operatorName = 'Alex Tran',
  zone = 'Inbound Dock 01',
  onLogout,
  onZonePress,
  onZoneChange,
  onNotificationsPress,
}: AppHeaderProps) {
  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
  const [isAvatarDropdownOpen, setIsAvatarDropdownOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);

  const handleOpenNotifications = () => {
    triggerHaptic('tap');
    if (onNotificationsPress) {
      onNotificationsPress();
    } else {
      setIsZoneDropdownOpen(false);
      setIsAvatarDropdownOpen(false);
      setIsNotifModalOpen(!isNotifModalOpen);
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
              if (onZonePress) {
                onZonePress();
              } else {
                setIsNotifModalOpen(false);
                setIsAvatarDropdownOpen(false);
                setIsZoneDropdownOpen(!isZoneDropdownOpen);
              }
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

      {/* Floating Work Zone Dropdown Menu (Anchored under Header) */}
      {isZoneDropdownOpen && (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setIsZoneDropdownOpen(false)}
          />
          <View style={styles.zoneDropdownMenu}>
            <Text style={styles.zoneDropdownEyebrow}>SCR-STF-02: WORK ZONE</Text>
            {WORK_ZONE_DROPDOWN_ITEMS.map((item) => {
              const isSelected =
                zone === item ||
                (item.startsWith('Inbound') && zone.includes('Inbound')) ||
                (item.startsWith('Storage Zone A') && zone.includes('Zone A')) ||
                (item.startsWith('Storage Zone B') && zone.includes('Zone B')) ||
                (item.startsWith('Outbound') && zone.includes('Outbound'));

              return (
                <Pressable
                  key={item}
                  onPress={() => {
                    triggerHaptic('tap');
                    onZoneChange?.(item);
                    setIsZoneDropdownOpen(false);
                    toast.info(`Switched zone to: ${item}`);
                  }}
                  style={[
                    styles.zoneDropdownItem,
                    isSelected && styles.zoneDropdownItemActive,
                  ]}
                >
                  <MapPin
                    size={13}
                    color={isSelected ? colors.primary : colors.textMuted}
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      styles.zoneDropdownItemText,
                      isSelected && styles.zoneDropdownItemTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

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
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            setIsZoneDropdownOpen(false);
            setIsNotifModalOpen(false);
            setIsAvatarDropdownOpen(!isAvatarDropdownOpen);
          }}
          style={({ pressed }) => [
            styles.avatarCircle,
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="User profile menu"
        >
          <Text style={styles.avatarText}>AT</Text>
        </Pressable>
      </View>

      {/* Floating Notifications Popover (Anchored under Bell, matching Prototype 1:1) */}
      {isNotifModalOpen && (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setIsNotifModalOpen(false)}
          />
          <View style={styles.notifDropdownMenu}>
            <Text style={styles.notifDropdownEyebrow}>NOTIFICATIONS</Text>
            <View style={styles.notifDropdownList}>
              <Pressable
                style={({ pressed }) => [
                  styles.notifDropdownItem,
                  pressed && styles.notifDropdownItemPressed,
                ]}
                onPress={handleDismissNotifications}
              >
                <View style={styles.notifItemHeader}>
                  <View style={styles.notifIconSuccess}>
                    <Check size={12} color={colors.success} strokeWidth={2.5} />
                  </View>
                  <Text style={styles.notifItemTitle}>AMR-01 Arrived</Text>
                </View>
                <Text style={styles.notifItemDesc}>
                  Robot is awaiting handover at Rack A-02.
                </Text>
                <Text style={styles.notifItemTime}>Just now</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.notifDropdownItem,
                  styles.notifDropdownItemWarning,
                  pressed && styles.notifDropdownItemPressed,
                ]}
                onPress={handleDismissNotifications}
              >
                <View style={styles.notifItemHeader}>
                  <View style={styles.notifIconWarning}>
                    <AlertTriangle size={12} color="#dc2626" strokeWidth={2.5} />
                  </View>
                  <Text style={[styles.notifItemTitle, { color: '#dc2626' }]}>
                    Deadlock Resolved
                  </Text>
                </View>
                <Text style={styles.notifItemDesc}>
                  AMR-02 yielded right-of-way in Aisle 2.
                </Text>
                <Text style={styles.notifItemTime}>3m ago</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* Floating Avatar Menu (Anchored under Avatar, matching Prototype 1:1) */}
      {isAvatarDropdownOpen && (
        <>
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setIsAvatarDropdownOpen(false)}
          />
          <View style={styles.avatarDropdownMenu}>
            <Text style={styles.avatarName}>{operatorName || 'Alex Tran'}</Text>
            <Text style={styles.avatarRole}>Warehouse Operator · {zone}</Text>
            <View style={styles.dropdownDivider} />
            <View style={styles.shiftRow}>
              <Clock3 size={13} color={colors.textSecondary} />
              <Text style={styles.shiftText}>Current Shift: Morning (06:00 - 14:00)</Text>
            </View>
            <View style={styles.dropdownDivider} />
            <Pressable
              style={({ pressed }) => [
                styles.avatarLogoutBtn,
                pressed && { backgroundColor: '#fee2e2' },
              ]}
              onPress={() => {
                triggerHaptic('tap');
                setIsAvatarDropdownOpen(false);
                setIsLogoutModalOpen(true);
              }}
            >
              <LogOut size={13} color={colors.danger} />
              <Text style={styles.avatarLogoutText}>Log out</Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Shift Logout Confirmation Dialog */}
      {(() => {
        if (!isLogoutModalOpen) return null;
        const modalBody = (
          <View style={styles.logoutModalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setIsLogoutModalOpen(false)}
            />
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
        );

        if (Platform.OS === 'web') {
          return (
            <View style={styles.webLogoutAbsoluteOverlay} pointerEvents="auto">
              {modalBody}
            </View>
          );
        }

        return (
          <Modal
            visible={isLogoutModalOpen}
            animationType="fade"
            transparent
            onRequestClose={() => setIsLogoutModalOpen(false)}
          >
            {modalBody}
          </Modal>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'ios' ? 48 : 12,
    paddingBottom: 12,
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
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -1200,
    zIndex: 99,
  },
  zoneDropdownMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 92 : 56,
    left: 16,
    width: 250,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 6,
    zIndex: 100,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  zoneDropdownEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    paddingHorizontal: 8,
    paddingVertical: 5,
    textTransform: 'uppercase',
  },
  zoneDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
  },
  zoneDropdownItemActive: {
    backgroundColor: 'rgba(0, 92, 209, 0.1)',
  },
  zoneDropdownItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  zoneDropdownItemTextActive: {
    color: colors.primary,
    fontWeight: '900',
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
  notifDropdownMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 92 : 56,
    right: 12,
    width: 288,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    zIndex: 100,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 10,
  },
  notifDropdownEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 6,
  },
  notifDropdownList: {
    gap: 4,
  },
  notifDropdownItem: {
    padding: 8,
    borderRadius: 8,
    gap: 2,
  },
  notifDropdownItemPressed: {
    backgroundColor: 'rgba(0, 92, 209, 0.08)',
  },
  notifDropdownItemWarning: {
    backgroundColor: 'transparent',
  },
  notifItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notifIconSuccess: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifIconWarning: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  notifItemDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    paddingLeft: 32,
    lineHeight: 15,
  },
  notifItemTime: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    paddingLeft: 32,
    marginTop: 2,
  },
  avatarDropdownMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 92 : 56,
    right: 12,
    width: 224,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    zIndex: 100,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 10,
  },
  avatarName: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  avatarRole: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shiftText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  avatarLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  avatarLogoutText: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.danger,
  },
  webLogoutAbsoluteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: -1000,
    zIndex: 999,
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
