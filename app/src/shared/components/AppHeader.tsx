import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Bell, ChevronDown, LogOut } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '../theme/colors';

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
  return (
    <View style={styles.header}>
      {/* Brand & Zone Dropdown */}
      <View style={styles.leftGroup}>
        {/* BrandMark */}
        <View style={styles.brandMark}>
          <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M6 3v12" />
            <Path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <Path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
            <Path d="M15 6a9 9 0 0 0-9 9" />
          </Svg>
        </View>

        <View style={styles.textGroup}>
          <Text style={styles.facilitySubtitle}>WAROTRANS FACILITY</Text>
          <Pressable
            onPress={onZonePress}
            style={({ pressed }) => [
              styles.zoneButton,
              pressed && styles.zoneButtonPressed,
            ]}
          >
            <Text style={styles.zoneName} numberOfLines={1}>
              {zone}
            </Text>
            <ChevronDown size={14} color="#64748b" style={styles.chevron} />
          </Pressable>
        </View>
      </View>

      {/* Right Actions: Bell + Logout + Avatar */}
      <View style={styles.rightGroup}>
        {/* Notifications Bell */}
        <Pressable
          onPress={onNotificationsPress}
          style={({ pressed }) => [
            styles.iconCircle,
            pressed && styles.iconCirclePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={17} color="#334155" />
          <View style={styles.bellBadge} />
        </Pressable>

        {/* Quick Shift Logout */}
        {onLogout && (
          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutCircle,
              pressed && styles.logoutCirclePressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign out of shift"
          >
            <LogOut size={16} color="#64748b" />
          </Pressable>
        )}

        {/* User Avatar */}
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>AT</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
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
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  textGroup: {
    flex: 1,
    justifyContent: 'center',
  },
  facilitySubtitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
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
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    maxWidth: 155,
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
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconCirclePressed: {
    backgroundColor: '#e2e8f0',
  },
  bellBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  logoutCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutCirclePressed: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
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
  },
});
