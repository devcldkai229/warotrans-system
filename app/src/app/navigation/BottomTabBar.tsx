import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../shared/theme/colors';
import { MainTab, useNavigation } from './NavigationContext';

interface TabItem {
  key: MainTab;
  label: string;
  icon: string;
  showBadge?: boolean;
}

export function BottomTabBar() {
  const { activeTab, switchTab, activeJobCount } = useNavigation();

  const tabs: TabItem[] = [
    { key: 'home', label: 'Home', icon: '🏠' },
    { key: 'jobs', label: 'Jobs', icon: '📋', showBadge: activeJobCount > 0 },
    { key: 'transport', label: 'Transport', icon: '📦' },
  ];

  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => switchTab(tab.key)}
            style={({ pressed }) => [
              styles.tabBtn,
              pressed && styles.tabBtnPressed,
            ]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View style={styles.iconWrapper}>
              <Text style={styles.icon}>{tab.icon}</Text>
              {tab.showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{activeJobCount}</Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.label,
                isActive ? styles.labelActive : styles.labelInactive,
              ]}
            >
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 16,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    position: 'relative',
  },
  tabBtnPressed: {
    opacity: 0.7,
  },
  iconWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  icon: {
    fontSize: 20,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.primary,
  },
  labelInactive: {
    color: colors.textMuted,
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 32,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.primary,
  },
});
