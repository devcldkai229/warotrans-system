import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme/colors';

interface AppHeaderProps {
  operatorName?: string;
  zone?: string;
  onLogout?: () => void;
  onZonePress?: () => void;
}

export function AppHeader({
  operatorName = 'Staff Operator',
  zone = 'Storage Zone A',
  onLogout,
  onZonePress,
}: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <View style={styles.brandContainer}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandIconText}>WT</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>WAROTRANS</Text>
            <Text style={styles.brandSubtitle}>Fleet Control Mobile</Text>
          </View>
        </View>

        <View style={styles.rightActions}>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>ONLINE</Text>
          </View>

          {onLogout && (
            <Pressable
              onPress={onLogout}
              style={({ pressed }) => [
                styles.logoutBtn,
                pressed && styles.logoutBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Log out"
            >
              <Text style={styles.logoutText}>Exit</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Pressable
          onPress={onZonePress}
          style={({ pressed }) => [
            styles.zoneTag,
            pressed && onZonePress && styles.zoneTagPressed,
          ]}
          disabled={!onZonePress}
        >
          <Text style={styles.zonePin}>📍</Text>
          <Text style={styles.zoneText} numberOfLines={1}>
            {zone}
          </Text>
        </Pressable>

        <View style={styles.operatorContainer}>
          <Text style={styles.operatorLabel}>Operator:</Text>
          <Text style={styles.operatorName} numberOfLines={1}>
            {operatorName}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: {
    color: colors.textInverse,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.5,
  },
  logoutBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  logoutText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
  },
  zoneTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
    maxWidth: '55%',
  },
  zoneTagPressed: {
    opacity: 0.8,
  },
  zonePin: {
    fontSize: 10,
  },
  zoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  operatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '42%',
  },
  operatorLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  operatorName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
});
