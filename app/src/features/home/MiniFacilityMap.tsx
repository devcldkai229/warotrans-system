import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BatteryMedium,
  LocateFixed,
  Search,
  User,
} from 'lucide-react-native';
import Svg, { Circle, Line, Defs, Pattern, Rect } from 'react-native-svg';
import { colors } from '../../shared/theme/colors';

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
            <BatteryMedium size={12} color="#64748b" />
            <Text style={styles.batteryText}>{selectedRobot.battery}%</Text>
          </View>
        </View>
      )}

      {/* 5. Locate Me GPS Button (Top Right under search) */}
      <Pressable
        onPress={onLocateUser}
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
          stroke="#2563eb"
          strokeWidth="2"
          strokeDasharray="4,4"
          strokeOpacity="0.4"
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
        <View style={styles.workerPulse} />
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
            onPress={() => onSelectRobot(robot.id)}
            style={[
              styles.robotWrapper,
              {
                left: `${robot.xPercent}%` as any,
                top: `${robot.yPercent}%` as any,
              },
            ]}
          >
            {/* Pulsing ring */}
            <View
              style={[
                styles.robotPulseRing,
                isSelected ? styles.robotPulseSelected : styles.robotPulseDefault,
              ]}
            />

            {/* Directional Robot Marker */}
            <View
              style={[
                styles.robotMarker,
                isMoving ? styles.robotMoving : styles.robotIdle,
                isSelected && styles.robotSelectedGlow,
                { transform: [{ rotate: `${robot.headingDeg}deg` }] },
              ]}
            >
              <Text style={styles.robotArrow}>▲</Text>
            </View>

            {/* Speed & ID Floating Tag */}
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
    height: 390,
    backgroundColor: '#e0f2fe', // Sky-100 blueprint paper background
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
    borderColor: 'rgba(37, 99, 235, 0.12)',
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
    borderColor: 'rgba(226, 232, 240, 0.85)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
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
    color: '#64748b',
    flex: 1,
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
    borderColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  telemetryDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.success,
  },
  telemetryId: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0f172a',
  },
  onlinePill: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  onlinePillText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#16a34a',
  },
  batteryGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  batteryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  locateButton: {
    position: 'absolute',
    top: 72,
    right: 14,
    zIndex: 30,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  locateButtonPressed: {
    backgroundColor: '#eff6ff',
    transform: [{ scale: 0.92 }],
  },
  zoneCardA: {
    position: 'absolute',
    left: '6%',
    top: 122,
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
    top: 124,
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
    color: '#64748b',
    letterSpacing: 0.5,
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
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#475569',
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
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
  },
  workerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
    borderColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
    shadowColor: '#000',
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
    color: '#0f172a',
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
    borderColor: 'rgba(37, 99, 235, 0.6)',
  },
  robotPulseDefault: {
    borderWidth: 1,
    borderColor: 'rgba(100, 116, 139, 0.3)',
  },
  robotMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  robotMoving: {
    backgroundColor: '#0284c7', // Vibrant Sky/Blue marker
  },
  robotIdle: {
    backgroundColor: '#16a34a', // Green standby marker
  },
  robotSelectedGlow: {
    borderColor: '#bae6fd',
    borderWidth: 3,
  },
  robotArrow: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  robotTag: {
    position: 'absolute',
    top: 38,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  robotTagText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
});
