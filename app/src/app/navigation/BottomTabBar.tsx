import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Home,
  PackageCheck,
  Rocket,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { MainTab, useNavigation } from './NavigationContext';

export function BottomTabBar() {
  const { activeTab, switchTab, activeJobCount } = useNavigation();

  const handleTabPress = (tab: MainTab) => {
    triggerHaptic('tap');
    switchTab(tab);
  };

  const isHome = activeTab === 'home';
  const isJobs = activeTab === 'jobs';
  const isTransport = activeTab === 'transport';

  return (
    <View style={styles.dockWrapper} pointerEvents="box-none">
      <View style={styles.dockPill}>
        {/* 1. HOME TAB */}
        <Pressable
          onPress={() => handleTabPress('home')}
          style={({ pressed }) => [
            styles.tabBtn,
            pressed && styles.tabBtnPressed,
            isHome && styles.tabBtnActive,
          ]}
          accessibilityRole="tab"
          accessibilityLabel="Home"
          accessibilityState={{ selected: isHome }}
        >
          <Home
            size={23}
            color={isHome ? colors.primary : colors.textSecondary}
            strokeWidth={isHome ? 2.8 : 2.2}
          />
        </Pressable>

        {/* 2. JOB TAB */}
        <Pressable
          onPress={() => handleTabPress('jobs')}
          style={({ pressed }) => [
            styles.tabBtn,
            pressed && styles.tabBtnPressed,
            isJobs && styles.tabBtnActive,
          ]}
          accessibilityRole="tab"
          accessibilityLabel="Jobs"
          accessibilityState={{ selected: isJobs }}
        >
          <View style={styles.iconContainer}>
            <PackageCheck
              size={23}
              color={isJobs ? colors.primary : colors.textSecondary}
              strokeWidth={isJobs ? 2.8 : 2.2}
            />
            {activeJobCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeJobCount}</Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* 3. TRANSPORT TAB */}
        <Pressable
          onPress={() => handleTabPress('transport')}
          style={({ pressed }) => [
            styles.tabBtn,
            pressed && styles.tabBtnPressed,
            isTransport && styles.tabBtnActive,
          ]}
          accessibilityRole="tab"
          accessibilityLabel="Transport"
          accessibilityState={{ selected: isTransport }}
        >
          <Rocket
            size={23}
            color={isTransport ? colors.primary : colors.textSecondary}
            strokeWidth={isTransport ? 2.8 : 2.2}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dockWrapper: {
    position: 'absolute',
    bottom: Platform.select({ android: 16, default: 24 }),
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 90,
  },
  dockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
    shadowColor: '#071523',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 10,
    gap: 10,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(0, 92, 209, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.22)',
  },
  tabBtnPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.85,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.danger,
    borderRadius: 99,
    minWidth: 17,
    height: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    lineHeight: 11,
  },
});
