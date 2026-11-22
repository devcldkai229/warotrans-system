import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Rect, Svg } from 'react-native-svg';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
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
 * Designed with Calm Operations monochrome precision:
 *   - Icon-only: outline when inactive, solid filled when active.
 *   - Touch targets: >= 64pt width x 48pt height.
 */
function TabGlyph({
  tab,
  active,
  ink,
  cutout,
}: {
  tab: MainTab;
  active: boolean;
  ink: string;
  cutout: string;
}) {
  if (tab === 'home') {
    const housePath =
      'M3 10.5a2 2 0 0 1 .71-1.53l7-5.85a2 2 0 0 1 2.58 0l7 5.85A2 2 0 0 1 21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5Z';
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24">
        {active ? (
          <>
            <Path
              d={housePath}
              fill={ink}
              stroke={ink}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            <Path d="M9.2 21.8V14.2a1 1 0 0 1 1-1h3.6a1 1 0 0 1 1 1v7.6Z" fill={cutout} />
          </>
        ) : (
          <>
            <Path
              d={housePath}
              fill="none"
              stroke={ink}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M9 21v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"
              fill="none"
              stroke={ink}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </Svg>
    );
  }

  if (tab === 'jobs') {
    return (
      <Svg width={24} height={24} viewBox="0 0 24 24">
        {active ? (
          <>
            <Rect x={3.75} y={4} width={16.5} height={18} rx={2.5} fill={ink} />
            <Rect
              x={7.75}
              y={1.8}
              width={8.5}
              height={4.4}
              rx={1.6}
              fill={ink}
              stroke={cutout}
              strokeWidth={1.5}
            />
            <Path
              d="M8.2 11.5h.01M11.5 11.5h4.5M8.2 16h.01M11.5 16h4.5"
              stroke={cutout}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <Rect x={8} y={2} width={8} height={4} rx={1.2} fill="none" stroke={ink} strokeWidth={1.9} />
            <Path
              d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
              fill="none"
              stroke={ink}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M8.2 11.5h.01M11.5 11.5h4.5M8.2 16h.01M11.5 16h4.5"
              stroke={ink}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        )}
      </Svg>
    );
  }

  return (
    <Svg width={24} height={24} viewBox="0 0 24 24">
      <Path
        d="M3 11.2 21 3l-8.2 18-2.2-7.6L3 11.2Z"
        fill={active ? ink : 'none'}
        stroke={ink}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BottomTabBar() {
  const { activeTab, switchTab, activeJobCount, setDockHeight } = useNavigation();
  const insets = useSafeAreaInsets();
  const { styles, colors } = useThemedStyles(createStyles);
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

          return (
            <Pressable
              key={tab.value}
              onPress={() => handleTabPress(tab.value)}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.tabBtn,
                pressed && styles.tabBtnPressed,
              ]}
            >
              <View style={styles.iconSlot}>
                <TabGlyph
                  tab={tab.value}
                  active={isActive}
                  ink={colors.textPrimary}
                  cutout={colors.surface}
                />
                {tab.value === 'jobs' && activeJobCount > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="caption" color="#ffffff" style={styles.badgeText}>
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
}> = [
  { label: 'Home', value: 'home' },
  { label: 'Jobs', value: 'jobs' },
  { label: 'Transport', value: 'transport' },
];

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      paddingHorizontal: 18,
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
    /** Alert count badge unified with header notifications. */
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
      backgroundColor: colors.danger,
      borderWidth: 1.5,
      borderColor: colors.surface,
    },
    badgeText: {
      fontWeight: '800',
      fontSize: 11,
      lineHeight: 13,
      color: '#ffffff',
    },
    safeArea: {
      backgroundColor: colors.surface,
    },
  });