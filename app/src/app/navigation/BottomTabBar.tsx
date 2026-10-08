import React from 'react';
import {
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
    <View style={styles.bar}>
      {/* 1. HOME TAB */}
      <Pressable
        onPress={() => handleTabPress('home')}
        style={({ pressed }) => [
          styles.tabBtn,
          pressed && styles.tabBtnPressed,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: isHome }}
      >
        <View style={[styles.iconPill, isHome && styles.iconPillActive]}>
          <Home
            size={20}
            color={isHome ? colors.primary : colors.textMuted}
            strokeWidth={isHome ? 2.8 : 2}
          />
        </View>
        <Text
          style={[
            styles.label,
            isHome ? styles.labelActive : styles.labelInactive,
          ]}
        >
          HOME
        </Text>
      </Pressable>

      {/* 2. JOB TAB */}
      <Pressable
        onPress={() => handleTabPress('jobs')}
        style={({ pressed }) => [
          styles.tabBtn,
          pressed && styles.tabBtnPressed,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: isJobs }}
      >
        <View style={[styles.iconPill, isJobs && styles.iconPillActive]}>
          <PackageCheck
            size={20}
            color={isJobs ? colors.primary : colors.textMuted}
            strokeWidth={isJobs ? 2.8 : 2}
          />
          {activeJobCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeJobCount}</Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.label,
            isJobs ? styles.labelActive : styles.labelInactive,
          ]}
        >
          JOB
        </Text>
      </Pressable>

      {/* 3. TRANSPORT TAB */}
      <Pressable
        onPress={() => handleTabPress('transport')}
        style={({ pressed }) => [
          styles.tabBtn,
          pressed && styles.tabBtnPressed,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: isTransport }}
      >
        <View style={[styles.iconPill, isTransport && styles.iconPillActive]}>
          <Rocket
            size={20}
            color={isTransport ? colors.primary : colors.textMuted}
            strokeWidth={isTransport ? 2.8 : 2}
          />
        </View>
        <Text
          style={[
            styles.label,
            isTransport ? styles.labelActive : styles.labelInactive,
          ]}
        >
          TRANSPORT
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 6,
    paddingBottom: 14,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  tabBtnPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.8,
  },
  iconPill: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 999,
  },
  iconPillActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 8,
    backgroundColor: '#f59e0b',
    borderRadius: 99,
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    lineHeight: 11,
  },
  label: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  labelActive: {
    color: colors.primary,
  },
  labelInactive: {
    color: colors.textMuted,
  },
});
