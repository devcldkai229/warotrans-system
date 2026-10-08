import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BatteryMedium,
  LocateFixed,
  Navigation,
  Search,
  User,
} from 'lucide-react-native';
import Svg, { Line, Defs, Pattern, Rect } from 'react-native-svg';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

export interface MapRobot {
  id: string;
  xPercent: number;
  yPercent: number;
  headingDeg: number;
  status: 'EN_ROUTE' | 'STANDBY' | 'CHARGING';
  battery: number;
  speed: string;
}

interface MiniFacilityMapProps {
  currentZone: string;
  selectedRobotId: string;
  onSelectRobot: (robotId: string) => void;
  onLocateUser: () => void;
  onSearch?: () => void;
  robots: MapRobot[];
}

export function MiniFacilityMap({
  currentZone,
  selectedRobotId,
  onSelectRobot,
  onLocateUser,
  onSearch,
  robots,
}: MiniFacilityMapProps) {
  const [isLocating, setIsLocating] = useState(false);
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const selectedRobot = robots.find((r) => r.id === selectedRobotId) || robots[0];

  const getWorkerPosition = () => {
    if (currentZone.includes('Inbound') || currentZone.includes('Dock 01')) {
      return { left: '22%', top: '82%', name: 'Dock 01' };
    }
    if (currentZone.includes('Zone B')) {
      return { left: '76%', top: '38%', name: 'Zone B' };
    }
    if (currentZone.includes('Outbound') || currentZone.includes('Shipping')) {
      return { left: '78%', top: '82%', name: 'Dock Out' };
    }
    return { left: '24%', top: '38%', name: 'Zone A' };
  };

  const workerPos = getWorkerPosition();

  const handleLocateMe = () => {
    triggerHaptic('tap');
    setIsLocating(true);
    onLocateUser();
    setTimeout(() => setIsLocating(false), 1200);
  };

  const isWeb = Platform.OS === 'web';

  return (
    <View style={styles.mapContainer}>
      {/* 1. Blueprint Grid Background via SVG Pattern */}
      <Svg style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="24" y2="0" stroke="#bae6fd" strokeWidth="1" strokeOpacity="0.75" />
            <Line x1="0" y1="0" x2="0" y2="24" stroke="#bae6fd" strokeWidth="1" strokeOpacity="0.75" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
      </Svg>

      {/* 2. Concentric Sonar Radar Rings */}
      <View style={styles.sonarCenter}>
        <View style={[styles.sonarRing, styles.ringLarge]} />
        <View style={[styles.sonarRing, styles.ringMedium]} />
        <View style={[styles.sonarRing, styles.ringSmall]} />
      </View>

      {/* 2b. Rotating Radar Sweep (Conic gradient on web, sweeping indicator) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.radarSweep,
          {
            transform: [{ rotate: spin }],
          },
          isWeb ? ({
            backgroundImage: 'conic-gradient(from 0deg, transparent 65%, rgba(0, 92, 209, 0.22) 100%)',
          } as any) : undefined,
        ]}
      />

      {/* 3. Floating Search Bar (Top) */}
      <View style={styles.searchBarWrapper}>
        <Pressable
          onPress={onSearch}
          style={({ pressed }) => [
            styles.searchBar,
            pressed && styles.searchBarPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Search inventory or locations"
        >
          <Search size={18} color={colors.primary} />
          <Text style={styles.searchPlaceholder}>Search inventory or locations...</Text>
        </Pressable>
      </View>

      {/* 4. Active Robot Telemetry Badge (Top Left under search) */}
      {selectedRobot && (
        <View style={styles.telemetryBadge}>
          <View style={styles.telemetryDot} />
          <Text style={styles.telemetryId}>{selectedRobot.id}</Text>
          <View style={styles.onlinePill}>
            <Text style={styles.onlinePillText}>ONLINE</Text>
          </View>
          <View style={styles.batteryGroup}>
            <BatteryMedium size={12} color={colors.textSecondary} />
            <Text style={styles.batteryText}>{selectedRobot.battery}%</Text>
          </View>
        </View>
      )}

      {/* 5. Locate Me GPS Button (Top Right under search) */}
      <Pressable
        onPress={handleLocateMe}
        style={({ pressed }) => [
          styles.locateButton,
          pressed && styles.locateButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Locate current position"
      >
        <LocateFixed size={18} color={colors.primary} />
      </Pressable>

      {/* 6. Storage Zone A Card */}
      <View style={styles.zoneCardA}>
        <Text style={styles.zoneTitle}>ZONE A</Text>
        <View style={styles.rackGridA}>
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={i} style={styles.rackPill} />
          ))}
        </View>
      </View>

      {/* 7. Storage Zone B Card */}
      <View style={styles.zoneCardB}>
        <Text style={styles.zoneTitle}>ZONE B</Text>
        <View style={styles.rackGridB}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.rackPill} />
          ))}
        </View>
      </View>

      {/* 8. Loading Docks Area (Bottom Dashed Outline) */}
      <View style={styles.docksContainer}>
        <Text style={styles.zoneTitle}>LOADING DOCKS</Text>
        <View style={styles.docksRow}>
          <View style={styles.dockSlot}>
            <Text style={styles.dockSlotText}>DOCK-01</Text>
          </View>
          <View style={styles.dockSlot}>
            <Text style={styles.dockSlotText}>DOCK-02</Text>
          </View>
          <View style={styles.dockSlot}>
            <Text style={styles.dockSlotText}>DOCK-03</Text>
          </View>
        </View>
      </View>

      {/* 9. Dynamic Nav2 Trajectory Wayline */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Line
          x1="32%"
          y1="46%"
          x2="22%"
          y2="82%"
          stroke="#005cd1"
          strokeWidth="2"
          strokeDasharray="4,4"
          strokeOpacity="0.45"
        />
      </Svg>

      {/* 10. Dynamic Worker Position Marker */}
      <View
        style={[
          styles.workerMarker,
          {
            left: workerPos.left as any,
            top: workerPos.top as any,
          },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.workerPulse,
            isLocating && styles.workerPulseActive,
          ]}
        />
        <View style={styles.workerAvatar}>
          <User size={13} color="#ffffff" />
        </View>
        <View style={styles.workerLabelWrap}>
          <View style={styles.workerBlueDot} />
          <Text style={styles.workerLabelText}>You ({workerPos.name})</Text>
        </View>
      </View>

      {/* 11. AMR Fleet Markers */}
      {robots.map((robot) => {
        const isSelected = selectedRobotId === robot.id;
        const isMoving = robot.status === 'EN_ROUTE';

        return (
          <Pressable
            key={robot.id}
            onPress={() => {
              triggerHaptic('tap');
              onSelectRobot(robot.id);
            }}
            style={[
              styles.robotWrapper,
              {
                left: `${robot.xPercent}%` as any,
                top: `${robot.yPercent}%` as any,
              },
            ]}
          >
            {/* Pulsing Distance Ring */}
            <View
              style={[
                styles.robotPulseRing,
                isSelected ? styles.robotPulseSelected : styles.robotPulseDefault,
              ]}
            />

            {/* Directional Robot Marker with Sharp SVG Navigation Arrow */}
            <View
              style={[
                styles.robotMarker,
                isMoving ? styles.robotMoving : styles.robotIdle,
                isSelected && styles.robotSelectedGlow,
              ]}
            >
              <View
                style={{
                  transform: [{ rotate: `${robot.headingDeg}deg` }],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Navigation size={18} color="#ffffff" fill="#ffffff" />
              </View>
            </View>

            {/* Speed & ID Floating Tag (Refined Light Pill matching prototype) */}
            <View style={styles.robotTag}>
              <View
                style={[
                  styles.tagDot,
                  { backgroundColor: isMoving ? colors.primary : colors.success },
                ]}
              />
              <Text style={styles.robotTagText}>
                {robot.id} · {robot.speed}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 400,
    backgroundColor: '#e0f2fe', // Blueprint paper background
    position: 'relative',
    overflow: 'hidden',
  },
  sonarCenter: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  sonarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.12)',
  },
  ringLarge: {
    width: 380,
    height: 380,
  },
  ringMedium: {
    width: 250,
    height: 250,
  },
  ringSmall: {
    width: 130,
    height: 130,
  },
  radarSweep: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    width: 580,
    height: 580,
    marginLeft: -290,
    marginTop: -290,
    borderRadius: 290,
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.12)',
    backgroundColor: 'transparent',
  },
  searchBarWrapper: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    zIndex: 35,
  },
  searchBar: {
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(215, 223, 233, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  searchBarPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  searchPlaceholder: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    flex: 1,
    fontFamily: typography.fontSans,
  },
  telemetryBadge: {
    position: 'absolute',
    top: 72,
    left: 14,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 5,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  telemetryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  telemetryId: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  onlinePill: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  onlinePillText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  batteryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  batteryText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  locateButton: {
    position: 'absolute',
    top: 72,
    right: 14,
    zIndex: 30,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  locateButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
    transform: [{ scale: 0.92 }],
  },
  zoneCardA: {
    position: 'absolute',
    left: '6%',
    top: 124,
    width: '42%',
    height: 106,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 2,
    borderColor: '#7dd3fc',
    borderRadius: 8,
    padding: 7,
  },
  zoneCardB: {
    position: 'absolute',
    right: '6%',
    top: 126,
    width: '40%',
    height: 102,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 2,
    borderColor: '#7dd3fc',
    borderRadius: 8,
    padding: 7,
  },
  zoneTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    fontFamily: typography.fontSans,
  },
  rackGridA: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  rackGridB: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  rackPill: {
    width: '30%',
    height: 14,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  docksContainer: {
    position: 'absolute',
    left: '6%',
    bottom: 14,
    width: '88%',
    height: 78,
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#7dd3fc',
    borderRadius: 8,
    padding: 7,
  },
  docksRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  dockSlot: {
    flex: 1,
    height: 38,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockSlotText: {
    fontSize: 8,
    fontFamily: typography.fontMono,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  workerMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -14 }, { translateY: -14 }],
    zIndex: 25,
  },
  workerPulse: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 92, 209, 0.22)',
  },
  workerPulseActive: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(0, 92, 209, 0.45)',
    transform: [{ scale: 1.25 }],
  },
  workerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#071523',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  workerLabelWrap: {
    position: 'absolute',
    top: 32,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  workerBlueDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  workerLabelText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  robotWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    zIndex: 26,
  },
  robotPulseRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  robotPulseSelected: {
    borderWidth: 2,
    borderColor: 'rgba(0, 92, 209, 0.75)',
  },
  robotPulseDefault: {
    borderWidth: 1,
    borderColor: 'rgba(84, 101, 125, 0.3)',
  },
  robotMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  robotMoving: {
    backgroundColor: colors.primary, // Rich cobalt blue marker
  },
  robotIdle: {
    backgroundColor: colors.success, // Rich forest green standby marker
  },
  robotSelectedGlow: {
    borderColor: '#bae6fd',
    borderWidth: 3.5,
  },
  robotTag: {
    position: 'absolute',
    top: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  robotTagText: {
    color: colors.textPrimary,
    fontSize: 8,
    fontWeight: '900',
    fontFamily: typography.fontMono,
  },
});
