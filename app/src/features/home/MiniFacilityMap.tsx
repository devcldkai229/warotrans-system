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
  User,
} from 'lucide-react-native';
import Svg, { Line, Defs, Pattern, Rect, Path } from 'react-native-svg';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

export const ROBOT_HEADING_ARROW_PATH = 'M12 1.5 L20.75 18.25 L12 16.25 L3.25 18.25 Z';

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
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    a.start();
    return () => a.stop();
  }, [isSelected, waveAnim]);

  if (!isSelected) {
    return <View style={styles.robotPulseDefault} />;
  }

  const scale = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });
  const opacity = waveAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.7, 0.25, 0],
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
        duration: 8000,
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
      return { left: '24%', top: '78%', name: 'Dock 01' };
    }
    if (currentZone.includes('Zone B')) {
      return { left: '65%', top: '34%', name: 'Zone B' };
    }
    if (currentZone.includes('Outbound') || currentZone.includes('Shipping') || currentZone.includes('Dock 04')) {
      return { left: '76%', top: '78%', name: 'Dock Out' };
    }
    return { left: '26%', top: '30%', name: 'Zone A' };
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
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="facility-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="28" y2="0" stroke="rgba(33, 34, 38, 0.07)" strokeWidth="1" />
            <Line x1="0" y1="0" x2="0" y2="28" stroke="rgba(33, 34, 38, 0.07)" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#facility-grid)" />
      </Svg>

      {/* 2. Concentric Sonar Radar Rings */}
      <View style={styles.sonarCenter} pointerEvents="none">
        <View style={[styles.sonarRing, styles.ringLarge]} />
        <View style={[styles.sonarRing, styles.ringMedium]} />
        <View style={[styles.sonarRing, styles.ringSmall]} />
      </View>

      {/* 2b. Rotating Radar Sweep */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.radarSweep,
          {
            transform: [{ rotate: spin }],
          },
          isWeb ? ({
            backgroundImage: 'conic-gradient(from 0deg, transparent 70%, rgba(21, 87, 208, 0.12) 100%)',
          } as any) : undefined,
        ]}
      />


      {/* 4. Active Robot Telemetry Badge */}
      {selectedRobot && (
        <View style={styles.telemetryBadge}>
          <View style={styles.telemetryDot} />
          <Text style={styles.telemetryId}>{selectedRobot.id}</Text>
          <View style={styles.onlinePill}>
            <Text style={styles.onlinePillText}>Online</Text>
          </View>
          <View style={styles.batteryGroup}>
            <BatteryMedium size={14} color={colors.textSecondary} />
            <Text style={styles.batteryText}>{selectedRobot.battery}%</Text>
          </View>
        </View>
      )}

      {/* 5. Locate Me GPS Button */}
      <Pressable
        onPress={handleLocateMe}
        style={({ pressed }) => [
          styles.locateButton,
          pressed && styles.locateButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Locate current position"
      >
        <LocateFixed size={18} color={colors.primaryText} />
      </Pressable>

      {/* 6. Storage Zone A Card */}
      <View style={styles.zoneCardA}>
        <Text style={styles.zoneTitle}>Zone A · Storage</Text>
        <View style={styles.rackGridA}>
          {Array.from({ length: 12 }).map((_, i) => (
            <View key={i} style={styles.rackPill} />
          ))}
        </View>
      </View>

      {/* 7. Storage Zone B Card */}
      <View style={styles.zoneCardB}>
        <Text style={styles.zoneTitle}>Zone B · Storage</Text>
        <View style={styles.rackGridB}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={styles.rackPill} />
          ))}
        </View>
      </View>

      {/* 8. Loading Docks Area */}
      <View style={styles.docksContainer}>
        <Text style={styles.zoneTitle}>Loading Docks</Text>
        <View style={styles.docksRow}>
          <View style={styles.dockSlot}>
            <Text style={styles.dockSlotText}>Dock 01</Text>
          </View>
          <View style={styles.dockSlot}>
            <Text style={styles.dockSlotText}>Dock 02</Text>
          </View>
          <View style={styles.dockSlot}>
            <Text style={styles.dockSlotText}>Dock 03</Text>
          </View>
        </View>
      </View>

      {/* 9. Dynamic Trajectory Wayline */}
      <View pointerEvents="none" style={styles.trajectoryStrip} />

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
          >
            <RobotSelectionRadarWave isSelected={isSelected} />

            <View
              style={[
                styles.robotPuck,
                isSelected && styles.robotPuckSelected,
                isMoving && styles.robotPuckMoving,
              ]}
            >
              <View
                style={{
                  transform: [{ rotate: `${robot.headingDeg}deg` }],
                  width: 20,
                  height: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Svg width="18" height="18" viewBox="0 0 24 24">
                  <Path
                    d={ROBOT_HEADING_ARROW_PATH}
                    fill={isMoving ? '#ffffff' : colors.primaryText}
                  />
                </Svg>
              </View>
            </View>

            <View style={styles.robotLabelPill}>
              <View
                style={[
                  styles.robotDot,
                  { backgroundColor: isMoving ? colors.primaryText : colors.success },
                ]}
              />
              <Text style={styles.robotLabelText} numberOfLines={1}>{robot.id}</Text>
              <Text style={styles.robotSpeedText} numberOfLines={1}>{robot.speed}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    backgroundColor: '#eef1f6',
    position: 'relative',
    overflow: 'hidden',
  },
  sonarCenter: {
    position: 'absolute',
    left: '50%',
    top: '45%',
    alignItems: 'center',
    justifyContent: 'center',
    width: 0,
    height: 0,
  },
  sonarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(21, 87, 208, 0.08)',
  },
  ringSmall: {
    width: 140,
    height: 140,
    marginLeft: -70,
    marginTop: -70,
  },
  ringMedium: {
    width: 260,
    height: 260,
    marginLeft: -130,
    marginTop: -130,
  },
  ringLarge: {
    width: 380,
    height: 380,
    marginLeft: -190,
    marginTop: -190,
  },
  radarSweep: {
    position: 'absolute',
    left: '50%',
    top: '45%',
    width: 320,
    height: 320,
    marginLeft: -160,
    marginTop: -160,
    borderRadius: 160,
    borderWidth: 1,
    borderColor: 'rgba(21, 87, 208, 0.10)',
    backgroundColor: 'transparent',
  },
  telemetryBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
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
    fontWeight: '700',
    color: colors.textPrimary,
  },
  onlinePill: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  onlinePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.successText,
  },
  batteryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  batteryText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  locateButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  locateButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
    transform: [{ scale: 0.94 }],
  },
  zoneCardA: {
    position: 'absolute',
    left: '6%',
    top: '12%',
    height: '24%',
    width: '40%',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 8,
  },
  zoneCardB: {
    position: 'absolute',
    right: '6%',
    top: '14%',
    height: '22%',
    width: '38%',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 8,
  },
  zoneTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  rackGridA: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'space-between',
  },
  rackGridB: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    justifyContent: 'space-between',
  },
  rackPill: {
    width: '30%',
    height: 10,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  docksContainer: {
    position: 'absolute',
    left: '6%',
    bottom: 220,
    width: '88%',
    height: 68,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 12,
    padding: 8,
  },
  docksRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  dockSlot: {
    flex: 1,
    height: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockSlotText: {
    fontSize: 12,
    fontWeight: '600',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(21, 87, 208, 0.18)',
  },
  workerPulseActive: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(21, 87, 208, 0.35)',
    transform: [{ scale: 1.2 }],
  },
  workerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.textPrimary,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  trajectoryStrip: {
    position: 'absolute',
    left: '40%',
    top: '28%',
    height: '34%',
    width: 3,
    transform: [{ rotate: '14deg' }],
    backgroundColor: 'rgba(21, 87, 208, 0.22)',
    borderRadius: 2,
    zIndex: 15,
  },
  workerLabelWrap: {
    position: 'absolute',
    top: 32,
    left: -24,
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    gap: 4,
    elevation: 2,
  },
  workerBlueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primaryText,
  },
  workerLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  robotWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -18 }, { translateY: -18 }],
    zIndex: 26,
  },
  robotPulseDefault: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(21, 87, 208, 0.12)',
  },
  robotPulseWave: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(21, 87, 208, 0.25)',
  },
  robotPuck: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  robotPuckSelected: {
    borderColor: colors.primaryText,
    borderWidth: 2.5,
  },
  robotPuckMoving: {
    backgroundColor: colors.primaryText,
  },
  robotLabelPill: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexWrap: 'nowrap',
  },
  robotDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  robotLabelText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 0,
  },
  robotSpeedText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    flexShrink: 0,
  },
});
