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
} from 'lucide-react-native';
import Svg, { Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { ROBOT_HEADING_ARROW_PATH } from '../home/MiniFacilityMap';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
// This screen is mid-migration: everything below still uses RN's `Text`, but the
// floating chip added in Phase 2 is new UI, so it uses the primitive.
import { Text as PrimitiveText } from '../../shared/ui';

/** Air between the floating telemetry sheet and the viewport edge. */
const SHEET_GAP = 8;
/** Air between the telemetry sheet and the dock zone stacked above it. */
const DOCK_ZONE_GAP = 12;
/**
 * Used only for the first frame, before `onLayout` reports the real sheet
 * height. Roughly the sheet's height at the default font size — it only has to
 * stop the dock zone flashing under the sheet for one frame.
 */
const SHEET_FALLBACK_HEIGHT = 174;

export function JobLiveMapScreen() {
  const { params, dockHeight } = useNavigation();
  /**
   * The map is edge to edge under the bottom bar, so its floating telemetry
   * sheet has to be lifted by the measured bar height — hardcoding an offset
   * here is how the sheet ends up behind the bar on a device with a taller
   * safe area than the one it was drawn on.
   */
  const dockInset = dockReservedSpace(dockHeight);
  /**
   * The telemetry sheet's measured height.
   *
   * The `LOADING DOCKS` zone used to sit at a hardcoded `bottom: 120`, which
   * only cleared the sheet while the sheet was also at a constant. The moment
   * the sheet moved to the measured bar clearance, the dock zone ended up
   * *behind* it — an opaque 174pt panel over the only label saying where the
   * docks are. Measuring the sheet and stacking the zone on top of it is what
   * keeps both true on an SE and on a Dynamic Island.
   */
  const [sheetHeight, setSheetHeight] = useState(0);
  const sheetBottom = dockInset + SHEET_GAP;
  const dockZoneBottom = sheetBottom + (sheetHeight || SHEET_FALLBACK_HEIGHT) + DOCK_ZONE_GAP;
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
      {/*
        Live Map is a main tab, so the shell `AppHeader` already owns the top of
        the screen. The job being tracked therefore rides as a floating chip on
        the viewport instead of a second header bar.
      */}
      <View style={styles.mapViewport}>
        <View style={styles.trackingChip}>
          <PrimitiveText
            variant="caption"
            color={colors.textPrimary}
            numberOfLines={1}
            style={styles.trackingChipText}
          >
            {jobId} · Tracking {selectedRobot}
          </PrimitiveText>
        </View>

        {toastFeedback && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastFeedback}</Text>
          </View>
        )}

        {/* Background Blueprint Grid Pattern */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="livemap-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <Line x1="0" y1="0" x2="24" y2="0" stroke={colors.mapGrid} strokeWidth="1" strokeOpacity="0.65" />
              <Line x1="0" y1="0" x2="0" y2="24" stroke={colors.mapGrid} strokeWidth="1" strokeOpacity="0.65" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#livemap-grid)" />
        </Svg>

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

        <View style={[styles.zoneDocks, { bottom: dockZoneBottom }]}>
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
          accessibilityRole="button"
          accessibilityLabel="AMR-01, at Rack A-02, 45 seconds to target"
          accessibilityState={{ selected: !isAmr2 }}
        >
          {/* Sonar Radar Cone */}
          {!isAmr2 && <View style={styles.sonarCone} />}
          <View style={[styles.robotCircle, !isAmr2 && styles.robotCircleSelected]}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <G rotation={45} origin="12, 12">
                <Path
                  d={ROBOT_HEADING_ARROW_PATH}
                  fill="#ffffff"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </G>
            </Svg>
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
          accessibilityRole="button"
          accessibilityLabel="AMR-02, at Docking Bay 02, on standby"
          accessibilityState={{ selected: isAmr2 }}
        >
          {isAmr2 && <View style={styles.sonarCone} />}
          <View style={[styles.robotCircle, isAmr2 && styles.robotCircleSelected]}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <G rotation={180} origin="12, 12">
                <Path
                  d={ROBOT_HEADING_ARROW_PATH}
                  fill="#ffffff"
                  stroke="#ffffff"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </G>
            </Svg>
          </View>
          <View style={styles.robotTag}>
            <Text style={styles.robotTagId}>AMR-02 · (18.2m, 14.5m)</Text>
            <Text style={styles.robotTagSub}>θ: 180° · 0.0 m/s (Standby)</Text>
          </View>
        </Pressable>

        {/* Telemetry Bottom Sheet */}
        <View style={[styles.telemetrySheet, { bottom: sheetBottom }]} onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}>
          <View style={styles.sheetTop}>
            <View>
              <Text style={styles.sheetRobotId}>{selectedRobot}</Text>
              <Text style={styles.sheetRoute} numberOfLines={1}>
                {route}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Live Telemetry</Text>
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
  trackingChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 45,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackingChipText: {
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    top: 58,
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
    fontFamily: typography.fontSans,
  },
  mapViewport: {
    flex: 1,
    backgroundColor: colors.mapBackground,
    position: 'relative',
    overflow: 'hidden',
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
  /**
   * Narrower than the rest of the map furniture: stacked above the telemetry
   * sheet it has to live in the left column, which is where `Rack B`'s right
   * edge starts.
   */
  zoneDocks: {
    position: 'absolute',
    left: '7%',
    width: '46%',
    height: 66,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: radii.sm,
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
    left: 12,
    // Below the tracking chip, which now owns the top strip of the viewport.
    top: 60,
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
    right: 12,
    // Sits beside the Nav2 path pill rather than behind the tracking chip.
    top: 54,
    width: 44,
    height: 44,
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
    fontFamily: typography.fontSans,
  },
  statusBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  /**
   * Title Case at the 12pt scale floor, mono. This badge used to be 9pt at
   * weight 900 in ALL-CAPS — below the type scale *and* shouting, while sitting
   * in one of the four main tabs.
   */
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.successText,
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
    fontFamily: typography.fontSans,
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
    fontFamily: typography.fontSans,
  },
});
