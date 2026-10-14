import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, Home, Map as MapIcon, Navigation } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { MainTab, useNavigation } from './NavigationContext';

/** Height of the tab row itself, excluding the bottom safe-area inset. */
const TAB_ROW_HEIGHT = 56;

/**
 * Fallback bottom padding when the platform reports no inset (web inside the
 * phone frame). 8pt is enough to clear the home indicator drawn by the frame.
 */
const FALLBACK_BOTTOM_INSET = 8;

/**
 * Bottom navigation.
 *
 * Flat and edge to edge: a white surface, a single hairline on top, no pill and
 * no floating shadow. Content scrolls underneath it (see `dockReservedSpace` in
 * `shared/theme/layout`), which is what lets a card run the full width of the
 * screen the way a Google console does.
 *
 * Four tabs, 12pt Title Case labels, and a 48pt-min tap target per tab inside
 * the 56pt row. The Jobs count rides as a chip on the icon rather than as a pill
 * behind the whole tab, so the label stays legible.
 *
 * The active tab uses `colors.primaryText`, not `colors.primary`. Both are the
 * same value today (see `theme/colors`), but the label is 12pt text on a
 * *white* bar — the case the accent has to clear 4.5:1 in as a foreground, not
 * only as a fill.
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
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              <View style={styles.iconSlot}>
                <IconCmp
                  size={22}
                  color={isActive ? colors.primaryText : colors.textMuted}
                  strokeWidth={isActive ? 2.4 : 2}
                />
                {tab.value === 'jobs' && activeJobCount > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="caption" color={colors.textPrimary} style={styles.badgeText}>
                      {activeJobCount}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text
                variant="caption"
                color={isActive ? colors.primaryText : colors.textMuted}
                numberOfLines={1}
                style={[styles.label, isActive && styles.labelActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The safe-area strip is painted in, not left to the parent, so the bar
          background stays unbroken on a device with a home indicator. */}
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
  { label: 'Live Map', value: 'live_map', icon: MapIcon },
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
    paddingTop: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
    paddingHorizontal: 4,
  },
  tabPressed: {
    opacity: 0.6,
  },
  iconSlot: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '600',
  },
  /** Count chip: amber fill with a ring so it reads as a separate element. */
  badge: {
    position: 'absolute',
    top: -6,
    right: -12,
    minWidth: 18,
    paddingHorizontal: 4,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.warning,
    borderWidth: 1.5,
    borderColor: colors.warningText,
  },
  badgeText: {
    fontWeight: '700',
    lineHeight: 14,
  },
  safeArea: {
    backgroundColor: colors.surface,
  },
});