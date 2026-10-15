import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Home, Navigation } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { MainTab, useNavigation } from './NavigationContext';

/** Height of the tab row itself, excluding the bottom safe-area inset. */
const TAB_ROW_HEIGHT = 54;

/** Fallback bottom padding when the platform reports no inset. */
const FALLBACK_BOTTOM_INSET = 10;

/**
 * Minimalist, Icon-Only Bottom Navigation.
 *
 * 3 Core Tabs for Warehouse Operators:
 *   1. Home      — Live Telemetry Facility Map & Next Handover Task
 *   2. Jobs      — Task Execution Center (My Tasks, Fleet Queue, History)
 *   3. Transport — Dispatch & Transport Requests
 *
 * Designed with Google Workspace / Calm Operations precision:
 *   - Icon-only: no text labels underneath for maximum elegance and touch focus.
 *   - Active state: soft rounded-full pill highlight (`primaryLight`).
 *   - Touch targets: >= 64pt width x 48pt height.
 */
export function BottomTabBar() {
  const { activeTab, switchTab, activeJobCount, setDockHeight } = useNavigation();
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom || FALLBACK_BOTTOM_INSET;

  const handleTabPress = (tab: MainTab) => {
    triggerHaptic('tap');
    switchTab(tab);
  };

  return (
    <View
      accessibilityRole="tablist"
      style={styles.bar}
      onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
    >
      <View style={[styles.row, { height: TAB_ROW_HEIGHT }]}>
        {TABS.map((tab) => {
          const isActive = tab.value === activeTab;
          const IconCmp = tab.icon;

          return (
            <Pressable
              key={tab.value}
              onPress={() => handleTabPress(tab.value)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.tabBtn,
                isActive && styles.tabBtnActive,
                pressed && styles.tabBtnPressed,
              ]}
            >
              <View style={styles.iconSlot}>
                <IconCmp
                  size={24}
                  color={isActive ? colors.primaryText : colors.textMuted}
                  strokeWidth={isActive ? 2.4 : 2.0}
                />
                {tab.value === 'jobs' && activeJobCount > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="caption" color="#78350f" style={styles.badgeText}>
                      {activeJobCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Safe-area bottom inset padding */}
      <View style={[styles.safeArea, { height: bottomInset }]} pointerEvents="none" />
    </View>
  );
}

const TABS: ReadonlyArray<{
  label: string;
  value: MainTab;
  icon: LucideIcon;
}> = [
  { label: 'Home', value: 'home', icon: Home },
  { label: 'Jobs', value: 'jobs', icon: ClipboardList },
  { label: 'Transport', value: 'transport', icon: Navigation },
];

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...(Platform.OS === 'android' ? { elevation: 8 } : null),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
    height: 44,
    borderRadius: radii.full,
    paddingHorizontal: 18,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(21, 87, 208, 0.08)',
  },
  tabBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  iconSlot: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Lighter warm amber badge chip with crisp white border */
  badge: {
    position: 'absolute',
    top: -6,
    right: -13,
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.full,
    backgroundColor: '#fbbf24', // Amber 400: bright, light, warm golden
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 13,
    color: '#78350f',
  },
  safeArea: {
    backgroundColor: colors.surface,
  },
});