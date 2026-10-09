import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BatteryMedium,
  Clock3,
  LocateFixed,
  Navigation,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

export function JobLiveMapScreen() {
  const { goBack, params } = useNavigation();
  const [selectedRobot, setSelectedRobot] = useState<'AMR-01' | 'AMR-02'>(
    params?.robotId === 'AMR-02' ? 'AMR-02' : 'AMR-01'
  );
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  const jobId = params?.jobId || 'JOB-2026-0812';
  const target = params?.target || 'Rack A · Level 2 · Bin 03';
  const route = params?.route || 'Dock 01 ➔ Rack A · Level 2 · Bin 03';

  const isAmr2 = selectedRobot === 'AMR-02';

  const handleCenter = () => {
    setToastFeedback(`Centered view on ${selectedRobot} Nav2 telemetry coordinates`);
    setTimeout(() => setToastFeedback(null), 3000);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={`SCR-STF-25 · ${jobId}`}
        title={`Tracking ${selectedRobot}`}
        onBack={goBack}
      />

      {toastFeedback && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastFeedback}</Text>
        </View>
      )}

      {/* Blueprint Radar Telemetry Viewport */}
      <View style={styles.mapViewport}>
        {/* Background Grid Pattern */}
        <View style={styles.gridOverlay} />

        {/* Dynamic Nav2 Route Wayline */}
        <View
          style={[
            styles.routeWayline,
            isAmr2 ? styles.routeWaylineAmr2 : styles.routeWaylineAmr1,
          ]}
        />

        {/* Rack Zones */}
        <View style={styles.zoneRackA}>
          <Text style={styles.zoneLabel}>RACK A (MULTI-SKU)</Text>
          <View style={styles.rackGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={styles.rackCell} />
            ))}
          </View>
        </View>

        <View style={styles.zoneRackB}>
          <Text style={styles.zoneLabel}>RACK B / QA ZONE</Text>
          <View style={styles.rackCellBulk} />
        </View>

        <View style={styles.zoneDocks}>
          <Text style={styles.zoneLabel}>LOADING DOCKS</Text>
          <View style={styles.docksRow}>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>DOCK-01</Text>
            </View>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>DOCK-02</Text>
            </View>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>DOCK-03</Text>
            </View>
          </View>
        </View>

        {/* Active Nav2 Path Badge */}
        <View style={styles.statusPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusPillText}>Active Nav2 Path · {selectedRobot}</Text>
        </View>

        {/* Viewport Centering Button */}
        <Pressable
          onPress={handleCenter}
          style={({ pressed }) => [
            styles.locateBtn,
            pressed && styles.locateBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Center viewport"
        >
          <LocateFixed size={18} color={colors.primary} />
        </Pressable>

        {/* Robot AMR-01 Marker */}
        <Pressable
          onPress={() => setSelectedRobot('AMR-01')}
          style={[
            styles.robotWrapper,
            { left: '42%', top: '44%' },
            !isAmr2 && styles.robotWrapperActive,
          ]}
        >
          {/* Sonar Radar Cone */}
          {!isAmr2 && <View style={styles.sonarCone} />}
          <View style={[styles.robotCircle, !isAmr2 && styles.robotCircleSelected]}>
            <View style={{ transform: [{ rotate: '45deg' }] }}>
              <Navigation size={20} color="#ffffff" fill="#ffffff" />
            </View>
          </View>
          <View style={styles.robotTag}>
            <Text style={styles.robotTagId}>AMR-01 · (12.4m, 8.2m)</Text>
            <Text style={styles.robotTagSub}>θ: 45° · 1.2 m/s</Text>
          </View>
        </Pressable>

        {/* Robot AMR-02 Marker */}
        <Pressable
          onPress={() => setSelectedRobot('AMR-02')}
          style={[
            styles.robotWrapper,
            { left: '65%', top: '35%' },
            isAmr2 && styles.robotWrapperActive,
          ]}
        >
          {isAmr2 && <View style={styles.sonarCone} />}
          <View style={[styles.robotCircle, isAmr2 && styles.robotCircleSelected]}>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <Navigation size={20} color="#ffffff" fill="#ffffff" />
            </View>
          </View>
          <View style={styles.robotTag}>
            <Text style={styles.robotTagId}>AMR-02 · (18.2m, 14.5m)</Text>
            <Text style={styles.robotTagSub}>θ: 180° · 0.0 m/s (Standby)</Text>
          </View>
        </Pressable>

        {/* Telemetry Bottom Sheet */}
        <View style={styles.telemetrySheet}>
          <View style={styles.sheetTop}>
            <View>
              <Text style={styles.sheetRobotId}>{selectedRobot}</Text>
              <Text style={styles.sheetRoute} numberOfLines={1}>
                {route}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>LIVE TELEMETRY</Text>
            </View>
          </View>

          {/* Metric Columns */}
          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>{isAmr2 ? '92%' : '85%'}</Text>
              <Text style={styles.metricLabel}>Battery</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>{isAmr2 ? '0m' : '8m'}</Text>
              <Text style={styles.metricLabel}>To Target</Text>
            </View>
            <View style={[styles.metricCol, { borderRightWidth: 0 }]}>
              <Text style={[styles.metricVal, { color: colors.primary }]}>
                {isAmr2 ? 'Standby' : '45s'}
              </Text>
              <Text style={styles.metricLabel}>ETA</Text>
            </View>
          </View>

          {/* Target Location Banner */}
          <View style={styles.targetBanner}>
            <Clock3 size={15} color={colors.primary} />
            <Text style={styles.targetBannerText} numberOfLines={1}>
              Target: {target}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toast: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 50,
    ...shadows.float,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  mapViewport: {
    flex: 1,
    backgroundColor: colors.mapBackground,
    position: 'relative',
    overflow: 'hidden',
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  routeWayline: {
    position: 'absolute',
    width: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(37, 99, 235, 0.45)',
  },
  routeWaylineAmr1: {
    left: '31%',
    top: '33%',
    height: '38%',
    transform: [{ rotate: '-45deg' }],
  },
  routeWaylineAmr2: {
    right: '35%',
    top: '25%',
    height: '38%',
    transform: [{ rotate: '45deg' }],
  },
  zoneRackA: {
    position: 'absolute',
    left: '7%',
    top: '9%',
    width: '38%',
    height: '28%',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.mapLine,
    padding: 8,
  },
  zoneRackB: {
    position: 'absolute',
    right: '7%',
    top: '38%',
    width: '38%',
    height: '25%',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.mapLine,
    padding: 8,
  },
  zoneDocks: {
    position: 'absolute',
    left: '7%',
    bottom: 120,
    width: '86%',
    height: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.mapLine,
    padding: 8,
  },
  zoneLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  rackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  rackCell: {
    width: '28%',
    height: 18,
    backgroundColor: colors.mapRack,
    borderRadius: 3,
  },
  rackCellBulk: {
    width: '100%',
    height: 40,
    backgroundColor: colors.mapRack,
    borderRadius: 4,
    marginTop: 6,
  },
  docksRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  dockBox: {
    flex: 1,
    height: 28,
    backgroundColor: colors.mapRack,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  statusPill: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.panel,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.success,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  locateBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.float,
  },
  locateBtnPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  robotWrapper: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -20 }, { translateY: -20 }],
    zIndex: 20,
  },
  robotWrapperActive: {
    zIndex: 25,
  },
  sonarCone: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 999,
    backgroundColor: 'rgba(2, 132, 199, 0.25)',
    transform: [{ scale: 1.4 }],
  },
  robotCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  robotCircleSelected: {
    borderColor: '#ffffff',
    borderWidth: 4,
    transform: [{ scale: 1.1 }],
  },
  robotTag: {
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
    ...shadows.panel,
  },
  robotTagId: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  robotTagSub: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  telemetrySheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.float,
  },
  sheetTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetRobotId: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  sheetRoute: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 220,
  },
  statusBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  metricRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 12,
    paddingTop: 10,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
  },
  targetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  targetBannerText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    flex: 1,
  },
});
