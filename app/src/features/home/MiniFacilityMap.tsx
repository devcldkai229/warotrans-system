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
  style?: any;
}

/**
 * Animated radiating radar wave ring when a robot is actively selected
 * Matches prototype `animate-ping` / radar wave radiation effect
 */
function RobotSelectionRadarWave({ isSelected }: { isSelected: boolean }) {
  const waveAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isSelected) {
      waveAnim.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.timing(waveAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    a.start();
    return () => a.stop();
  }, [isSelected, waveAnim]);

  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.robotPulseRingWeb,
          isSelected ? (styles.robotPulsePingWeb as any) : styles.robotPulseDefault,
        ]}
      />
    );
  }

  if (!isSelected) {
    return <View style={styles.robotPulseDefault} />;
  }

  const scale = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.3],
  });
  const opacity = waveAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.85, 0.35, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.robotPulseWave,
        {
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

export function MiniFacilityMap({
  currentZone,
  selectedRobotId,
  onSelectRobot,
  onLocateUser,
  onSearch,
  robots,
  style,
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
      return { left: '22%', top: '84%', name: 'Dock 01' };
    }
    if (currentZone.includes('Zone B')) {
      return { left: '60%', top: '34%', name: 'Zone B' };
    }
    if (currentZone.includes('Outbound') || currentZone.includes('Shipping') || currentZone.includes('Dock 04')) {
      return { left: '78%', top: '84%', name: 'Dock Out' };
    }
    return { left: '24%', top: '30%', name: 'Zone A' };
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
    <View style={[styles.mapContainer, style]}>
      {/* 1. Blueprint Grid Background */}
      {Platform.OS === 'web' ? (
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <Line x1="0" y1="0" x2="24" y2="0" stroke="#9bb1c4" strokeWidth="1" strokeOpacity="0.5" />
              <Line x1="0" y1="0" x2="0" y2="24" stroke="#9bb1c4" strokeWidth="1" strokeOpacity="0.5" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#grid)" />
        </Svg>
      ) : null}

      {/* 2. Concentric Sonar Radar Rings */}
      <View style={styles.sonarCenter} pointerEvents="none">
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

      {/* 9. Dynamic Nav2 Trajectory Wayline (Matches prototype line 928) */}
      <View
        pointerEvents="none"
        style={styles.trajectoryStrip}
      />

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
          <Text style={styles.workerLabelText} numberOfLines={1}>
            You ({workerPos.name})
          </Text>
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
            accessibilityRole="button"
            accessibilityLabel={`Select ${robot.id}`}
          >
            {/* Directional Sonar Radar Cone on Web */}
            {isWeb && (
              <View
                pointerEvents="none"
                style={[
                  styles.directionalSonarCone,
                  {
                    transform: [{ rotate: `${robot.headingDeg - 45}deg` }],
                    backgroundImage: 'conic-gradient(from 0deg, transparent 75%, rgba(2, 132, 199, 0.40) 100%)',
                  } as any,
                ]}
              />
            )}

            {/* Pulsing Radiating Radar Wave when Selected */}
            <RobotSelectionRadarWave isSelected={isSelected} />

            {/* Directional Robot Marker with Geometrically Centered SVG Navigation Arrow */}
            <View
              style={[
                styles.robotMarker,
                isMoving ? styles.robotMoving : styles.robotIdle,
                isSelected && styles.robotSelectedGlow,
              ]}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ rotate: `${robot.headingDeg}deg` }],
                }}
              >
                <Navigation
                  size={18}
                  color="#ffffff"
                  fill="#ffffff"
                />
              </View>
            </View>

            {/* Speed & ID Floating Tag - Single-line nowrap horizontal pill */}
            <View style={styles.robotTag}>
              <View
                style={[
                  styles.tagDot,
                  { backgroundColor: isMoving ? colors.primary : colors.success },
                ]}
              />
              <Text style={styles.robotTagText} numberOfLines={1}>
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
    backgroundColor: '#dce6ef', // Blueprint paper background
    position: 'relative',
    overflow: 'hidden',
  },
  sonarCenter: {
    position: 'absolute',
    left: '50%',
    top: '52%',
    alignItems: 'center',
    justifyContent: 'center',
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
    top: '10%',
    marginTop: 48,
    height: '27%',
    width: '39%',
    backgroundColor: 'rgba(255, 255, 255, 0.80)',
    borderWidth: 2,
    borderColor: '#9bb1c4',
    borderRadius: 6,
    padding: 8,
  },
  zoneCardB: {
    position: 'absolute',
    right: '6%',
    top: '12%',
    marginTop: 48,
    height: '25%',
    width: '37%',
    backgroundColor: 'rgba(255, 255, 255, 0.80)',
    borderWidth: 2,
    borderColor: '#9bb1c4',
    borderRadius: 6,
    padding: 8,
  },
  zoneTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    fontFamily: typography.fontSans,
  },
  rackGridA: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'space-between',
  },
  rackGridB: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'space-between',
  },
  rackPill: {
    width: '30%',
    height: 16,
    borderRadius: 2,
    backgroundColor: '#b8cbd9',
  },
  docksContainer: {
    position: 'absolute',
    left: '6%',
    bottom: 22,
    width: '88%',
    height: '24%',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#9bb1c4',
    borderRadius: 6,
    padding: 8,
  },
  docksRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  dockSlot: {
    flex: 1,
    height: 40,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.6)',
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockSlotText: {
    fontSize: 9,
    fontFamily: typography.fontMono,
    fontWeight: '700',
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
  trajectoryStrip: {
    position: 'absolute',
    left: '39%',
    top: '26%',
    height: '38%',
    width: 4,
    transform: [{ rotate: '12deg' }],
    backgroundColor: 'rgba(0, 92, 209, 0.20)',
    borderRadius: 2,
    zIndex: 15,
  },
  workerLabelWrap: {
    position: 'absolute',
    top: 32,
    left: -24,
    minWidth: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    ...(Platform.OS === 'web'
      ? ({
          left: '50%',
          transform: [{ translateX: -38 }],
          whiteSpace: 'nowrap',
          width: 'max-content',
        } as any)
      : {}),
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
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
  robotWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    zIndex: 26,
  },
  directionalSonarCone: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    top: -20,
    left: -20,
    opacity: 0.35,
  },
  robotPulseRingWeb: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 26,
    borderWidth: 1.5,
  },
  robotPulsePingWeb: {
    borderColor: 'rgba(0, 92, 209, 0.85)',
    ...({ animation: 'ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite' } as any),
  },
  robotPulseWave: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  robotActiveHalo: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(0, 92, 209, 0.55)',
  },
  robotPulseDefault: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(84, 101, 125, 0.25)',
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
    left: '50%',
    transform: [{ translateX: -42 }],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    ...(Platform.OS === 'web'
      ? ({
          whiteSpace: 'nowrap',
          width: 'max-content',
        } as any)
      : { minWidth: 84 }),
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
    textAlign: 'center',
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
});
