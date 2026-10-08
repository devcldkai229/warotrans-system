import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';

export function JobLiveMapScreen() {
  const { params } = useNavigation();
  const [selectedRobot, setSelectedRobot] = useState<'AMR-01' | 'AMR-02'>('AMR-01');
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  const robotId = params?.robotId || 'AMR-01';
  const jobId = params?.jobId || 'JOB-2026-0881';

  const handleCenter = () => {
    setToastFeedback(`Centered view on ${selectedRobot} Nav2 coordinates.`);
    setTimeout(() => setToastFeedback(null), 3000);
  };

  return (
    <View style={styles.container}>
      {/* Map Viewport Area */}
      <View style={styles.mapViewport}>
        {/* Background Grid Accent */}
        <View style={styles.gridLines} />

        {/* Concentric Sonar Rings */}
        <View style={[styles.sonarRing, styles.ring1]} />
        <View style={[styles.sonarRing, styles.ring2]} />
        <View style={[styles.sonarRing, styles.ring3]} />

        {/* Rack Zones */}
        <View style={styles.zoneRackA}>
          <Text style={styles.zoneTitle}>RACK A (MULTI-SKU)</Text>
          <View style={styles.rackGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={styles.rackCell} />
            ))}
          </View>
        </View>

        <View style={styles.zoneRackB}>
          <Text style={styles.zoneTitle}>RACK B (BULK QA)</Text>
          <View style={styles.rackBulkArea} />
        </View>

        <View style={styles.zoneDocks}>
          <Text style={styles.zoneTitle}>LOADING DOCKS</Text>
          <View style={styles.docksRow}>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>DOCK-01</Text>
            </View>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>DOCK-02</Text>
            </View>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>DOCK-04</Text>
            </View>
          </View>
        </View>

        {/* Dynamic Route Wayline */}
        <View style={styles.routeWayline} />

        {/* Status Pill (Top Left) */}
        <View style={styles.statusPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusPillText}>Active Nav2 Path · {selectedRobot}</Text>
        </View>

        {/* Center Viewport Button (Top Right) */}
        <Pressable
          onPress={handleCenter}
          style={({ pressed }) => [
            styles.locateBtn,
            pressed && styles.locateBtnPressed,
          ]}
        >
          <Text style={styles.locateIcon}>🎯</Text>
        </Pressable>

        {/* AMR-01 Marker */}
        <Pressable
          onPress={() => setSelectedRobot('AMR-01')}
          style={[
            styles.robotMarker,
            { left: '38%', top: '42%' },
            selectedRobot === 'AMR-01' && styles.robotMarkerActive,
          ]}
        >
          <View style={[styles.robotCircle, styles.robotEnRoute]}>
            <Text style={styles.arrowIcon}>▲</Text>
          </View>
          <View style={styles.robotTag}>
            <Text style={styles.robotTagId}>AMR-01 · (12.4m, 8.2m)</Text>
            <Text style={styles.robotTagSub}>θ: 45° · 0.8 m/s · 78%</Text>
          </View>
        </Pressable>

        {/* AMR-02 Marker */}
        <Pressable
          onPress={() => setSelectedRobot('AMR-02')}
          style={[
            styles.robotMarker,
            { left: '72%', top: '34%' },
            selectedRobot === 'AMR-02' && styles.robotMarkerActive,
          ]}
        >
          <View style={[styles.robotCircle, styles.robotStandby]}>
            <Text style={styles.arrowIcon}>▼</Text>
          </View>
          <View style={styles.robotTag}>
            <Text style={styles.robotTagId}>AMR-02 · (18.2m, 14.5m)</Text>
            <Text style={styles.robotTagSub}>θ: 180° · 0.0 m/s · 94%</Text>
          </View>
        </Pressable>

        {/* Feedback Toast */}
        {toastFeedback && (
          <View style={styles.mapToast}>
            <Text style={styles.mapToastText}>{toastFeedback}</Text>
          </View>
        )}
      </View>

      {/* Telemetry Bottom Card */}
      <View style={styles.bottomCard}>
        <View style={styles.bottomTopRow}>
          <View>
            <View style={styles.jobRefRow}>
              <Text style={styles.jobRefText}>{jobId}</Text>
              <View style={styles.nav2Badge}>
                <Text style={styles.nav2Text}>Nav2 Clear 🟢</Text>
              </View>
            </View>
            <Text style={styles.targetHeading}>Target: Rack A · Level 2 · Bin 03</Text>
          </View>
          <View style={styles.batteryCol}>
            <Text style={styles.batteryVal}>🔋 78%</Text>
            <Text style={styles.batterySub}>AMR-01</Text>
          </View>
        </View>

        <Text style={styles.routeDesc}>
          Route: Dock 01 ➔ Transit Corridor ➔ Rack A-02 (ETA 45s)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  mapViewport: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  gridLines: {
    ...StyleSheet.absoluteFill,
    opacity: 0.1,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  sonarRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.15)',
    left: '50%',
    top: '50%',
  },
  ring1: {
    width: 140,
    height: 140,
    marginLeft: -70,
    marginTop: -70,
  },
  ring2: {
    width: 260,
    height: 260,
    marginLeft: -130,
    marginTop: -130,
  },
  ring3: {
    width: 380,
    height: 380,
    marginLeft: -190,
    marginTop: -190,
  },
  zoneRackA: {
    position: 'absolute',
    left: '8%',
    top: '10%',
    width: '40%',
    height: '32%',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    padding: 8,
  },
  zoneRackB: {
    position: 'absolute',
    right: '8%',
    top: '10%',
    width: '38%',
    height: '28%',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#818cf8',
    backgroundColor: 'rgba(129, 140, 248, 0.08)',
    padding: 8,
  },
  zoneDocks: {
    position: 'absolute',
    left: '8%',
    bottom: '8%',
    width: '84%',
    height: '22%',
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#94a3b8',
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    padding: 8,
  },
  zoneTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: '#cbd5e1',
    letterSpacing: 0.5,
  },
  rackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  rackCell: {
    width: '28%',
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 2,
  },
  rackBulkArea: {
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    marginTop: 6,
  },
  docksRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  dockBox: {
    flex: 1,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockText: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#94a3b8',
  },
  routeWayline: {
    position: 'absolute',
    left: '32%',
    top: '32%',
    width: 3,
    height: '30%',
    backgroundColor: 'rgba(14, 116, 144, 0.5)',
    transform: [{ rotate: '-35deg' }],
    borderRadius: 2,
  },
  statusPill: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  locateBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateBtnPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  locateIcon: {
    fontSize: 16,
  },
  robotMarker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    transform: [{ translateX: -16 }, { translateY: -16 }],
  },
  robotMarkerActive: {
    zIndex: 30,
  },
  robotCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  robotEnRoute: {
    backgroundColor: colors.primary,
  },
  robotStandby: {
    backgroundColor: colors.success,
  },
  arrowIcon: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '900',
  },
  robotTag: {
    marginTop: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  robotTagId: {
    fontSize: 8,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#ffffff',
  },
  robotTagSub: {
    fontSize: 7,
    fontFamily: 'monospace',
    color: '#38bdf8',
    marginTop: 1,
  },
  mapToast: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mapToastText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  bottomCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  jobRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  jobRefText: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  nav2Badge: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  nav2Text: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
  },
  targetHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  batteryCol: {
    alignItems: 'flex-end',
  },
  batteryVal: {
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  batterySub: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 1,
  },
  routeDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
