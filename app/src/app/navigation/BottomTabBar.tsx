import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Home,
  Package,
  Rocket,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { MainTab, useNavigation } from './NavigationContext';

export function BottomTabBar() {
  const { activeTab, switchTab, activeJobCount } = useNavigation();

  return (
    <View style={styles.bar}>
      {/* 1. HOME TAB */}
      <Pressable
        onPress={() => switchTab('home')}
        style={({ pressed }) => [
          styles.tabBtn,
          pressed && styles.tabBtnPressed,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'home' }}
      >
        <Home
          size={20}
          color={activeTab === 'home' ? colors.primary : '#94a3b8'}
          strokeWidth={activeTab === 'home' ? 2.5 : 2}
        />
        <Text
          style={[
            styles.label,
            activeTab === 'home' ? styles.labelActive : styles.labelInactive,
          ]}
        >
          HOME
        </Text>
      </Pressable>

      {/* 2. JOB TAB */}
      <Pressable
        onPress={() => switchTab('jobs')}
        style={({ pressed }) => [
          styles.tabBtn,
          pressed && styles.tabBtnPressed,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'jobs' }}
      >
        <View style={styles.iconWrapper}>
          <Package
            size={20}
            color={activeTab === 'jobs' ? colors.primary : '#94a3b8'}
            strokeWidth={activeTab === 'jobs' ? 2.5 : 2}
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
            activeTab === 'jobs' ? styles.labelActive : styles.labelInactive,
          ]}
        >
          JOB
        </Text>
      </Pressable>

      {/* 3. TRANSPORT TAB */}
      <Pressable
        onPress={() => switchTab('transport')}
        style={({ pressed }) => [
          styles.tabBtn,
          pressed && styles.tabBtnPressed,
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'transport' }}
      >
        <Rocket
          size={20}
          color={activeTab === 'transport' ? colors.primary : '#94a3b8'}
          strokeWidth={activeTab === 'transport' ? 2.5 : 2}
        />
        <Text
          style={[
            styles.label,
            activeTab === 'transport' ? styles.labelActive : styles.labelInactive,
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
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
    paddingBottom: 16,
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
    gap: 4,
  },
  tabBtnPressed: {
    opacity: 0.7,
  },
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#f59e0b', // Amber/Yellow pill like prototype
    borderRadius: 7.5,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  labelActive: {
    color: colors.primary,
  },
  labelInactive: {
    color: '#94a3b8',
  },
});
