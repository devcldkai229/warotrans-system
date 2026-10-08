import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  robots: MapRobot[];
}

export function MiniFacilityMap({
  currentZone,
  selectedRobotId,
  onSelectRobot,
  onLocateUser,
  robots,
}: MiniFacilityMapProps) {
  const selectedRobot = robots.find((r) => r.id === selectedRobotId) || robots[0];

  const getWorkerCoords = () => {
    if (currentZone.includes('Inbound')) return { left: '25%', top: '80%', name: 'Dock 01' };
    if (currentZone.includes('Zone B')) return { left: '72%', top: '32%', name: 'Zone B' };
    if (currentZone.includes('Outbound')) return { left: '75%', top: '80%', name: 'Dock Out' };
    return { left: '26%', top: '32%', name: 'Zone A' };
  };

  const workerCoords = getWorkerCoords();

  return (
    <View style={styles.mapContainer}>
      {/* Background Grid Accent */}
      <View style={styles.gridOverlay} />

      {/* Facility Zones Outline */}
      {/* Zone A */}
      <View style={[styles.facilityZone, styles.zoneA]}>
        <Text style={styles.zoneLabel}>ZONE A (RACKS A01-A12)</Text>
        <View style={styles.rackGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.rackPill} />
          ))}
        </View>
      </View>

      {/* Zone B */}
      <View style={[styles.facilityZone, styles.zoneB]}>
        <Text style={styles.zoneLabel}>ZONE B (BULK)</Text>
        <View style={styles.rackGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.rackPill} />
          ))}
        </View>
      </View>

      {/* Loading Docks */}
      <View style={[styles.facilityZone, styles.zoneDocks]}>
        <Text style={styles.zoneLabel}>INBOUND / OUTBOUND DOCKS</Text>
        <View style={styles.docksRow}>
          <View style={styles.dockItem}>
            <Text style={styles.dockText}>DOCK 01</Text>
          </View>
          <View style={styles.dockItem}>
            <Text style={styles.dockText}>DOCK 02</Text>
          </View>
          <View style={styles.dockItem}>
            <Text style={styles.dockText}>DOCK 04</Text>
          </View>
        </View>
      </View>

      {/* Worker Position Pin */}
      <View
        style={[
          styles.workerMarker,
          {
            left: workerCoords.left as any,
            top: workerCoords.top as any,
          },
        ]}
      >
        <View style={styles.workerPulseRing} />
        <View style={styles.workerPinCenter}>
          <Text style={styles.workerPinIcon}>👤</Text>
        </View>
        <View style={styles.workerTag}>
          <Text style={styles.workerTagText}>You ({workerCoords.name})</Text>
        </View>
      </View>

      {/* Robot Markers */}
      {robots.map((robot) => {
        const isSelected = robot.id === selectedRobotId;
        return (
          <Pressable
            key={robot.id}
            onPress={() => onSelectRobot(robot.id)}
            style={[
              styles.robotMarker,
              {
                left: `${robot.xPercent}%` as any,
                top: `${robot.yPercent}%` as any,
              },
              isSelected && styles.robotMarkerSelected,
            ]}
          >
            <View
              style={[
                styles.robotBody,
                robot.status === 'EN_ROUTE' ? styles.robotMoving : styles.robotIdle,
              ]}
            >
              <Text style={styles.robotNavArrow}>▲</Text>
            </View>
            <View style={styles.robotTag}>
              <Text style={styles.robotTagText}>
                {robot.id} · {robot.speed}
              </Text>
            </View>
          </Pressable>
        );
      })}

      {/* Active Robot Telemetry HUD Badge (Top Left) */}
      {selectedRobot && (
        <View style={styles.telemetryBadge}>
          <View style={styles.telemetryDot} />
          <Text style={styles.telemetryId}>{selectedRobot.id}</Text>
          <View style={styles.telemetryStatusWrap}>
            <Text style={styles.telemetryStatus}>
              {selectedRobot.status.replace('_', ' ')}
            </Text>
          </View>
          <Text style={styles.telemetryBattery}>🔋 {selectedRobot.battery}%</Text>
        </View>
      )}

      {/* Locate Me Button (Top Right) */}
      <Pressable
        onPress={onLocateUser}
        style={({ pressed }) => [
          styles.locateButton,
          pressed && styles.locateButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Center map on current zone"
      >
        <Text style={styles.locateIcon}>🎯</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  mapContainer: {
    height: 250,
    backgroundColor: '#0f172a', // Deep industrial radar slate
    position: 'relative',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    opacity: 0.1,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  facilityZone: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 6,
  },
  zoneA: {
    left: '5%',
    top: '12%',
    width: '42%',
    height: '42%',
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
  },
  zoneB: {
    right: '5%',
    top: '12%',
    width: '42%',
    height: '42%',
    borderColor: '#818cf8',
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
  },
  zoneDocks: {
    left: '5%',
    bottom: '10%',
    width: '90%',
    height: '30%',
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  zoneLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#cbd5e1',
    letterSpacing: 0.5,
  },
  rackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  rackPill: {
    width: '28%',
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
  },
  docksRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  dockItem: {
    flex: 1,
    height: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockText: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#94a3b8',
  },
  workerMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    transform: [{ translateX: -12 }, { translateY: -12 }],
  },
  workerPulseRing: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(14, 116, 144, 0.4)',
  },
  workerPinCenter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerPinIcon: {
    fontSize: 11,
  },
  workerTag: {
    marginTop: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  workerTagText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#ffffff',
  },
  robotMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    transform: [{ translateX: -14 }, { translateY: -14 }],
  },
  robotMarkerSelected: {
    zIndex: 30,
  },
  robotBody: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  robotMoving: {
    backgroundColor: colors.primary,
  },
  robotIdle: {
    backgroundColor: colors.success,
  },
  robotNavArrow: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '900',
  },
  robotTag: {
    marginTop: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  robotTagText: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#ffffff',
  },
  telemetryBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 6,
    zIndex: 40,
  },
  telemetryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  telemetryId: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#ffffff',
  },
  telemetryStatusWrap: {
    backgroundColor: 'rgba(14, 116, 144, 0.3)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  telemetryStatus: {
    fontSize: 8,
    fontWeight: '700',
    color: '#38bdf8',
  },
  telemetryBattery: {
    fontSize: 9,
    color: '#cbd5e1',
    fontWeight: '600',
  },
  locateButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    elevation: 3,
  },
  locateButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  locateIcon: {
    fontSize: 16,
  },
});
