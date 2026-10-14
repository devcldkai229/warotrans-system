import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Clock3,
  LocateFixed,
} from 'lucide-react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { ROBOT_HEADING_ARROW_PATH } from '../home/MiniFacilityMap';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

const SHEET_GAP = 8;
const DOCK_ZONE_GAP = 12;
const SHEET_FALLBACK_HEIGHT = 174;

export function JobLiveMapScreen() {
  const { params, dockHeight, goBack } = useNavigation();
  const dockInset = dockReservedSpace(dockHeight);
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
    triggerHaptic('tap');
    setToastFeedback(`Centered view on ${selectedRobot} coordinates`);
    setTimeout(() => setToastFeedback(null), 3000);
  };

  return (
    <View style={styles.container}>
      {/* Safe-Area Aware Industrial SubScreenHeader with Back & Center Actions */}
      <SubScreenHeader
        label={`Tracking ${selectedRobot}`}
        title={jobId}
        onBack={goBack}
        rightAction={
          <Pressable
            onPress={handleCenter}
            style={({ pressed }) => [
              styles.headerLocateBtn,
              pressed && styles.headerLocateBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Center viewport"
          >
            <LocateFixed size={20} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <View style={styles.mapViewport}>
        {toastFeedback && (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastFeedback}</Text>
          </View>
        )}

        {/* Blueprint Grid */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="livemap-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <Line x1="0" y1="0" x2="24" y2="0" stroke={colors.mapGrid} strokeWidth="1" strokeOpacity="0.65" />
              <Line x1="0" y1="0" x2="0" y2="24" stroke={colors.mapGrid} strokeWidth="1" strokeOpacity="0.65" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#livemap-grid)" />
        </Svg>

        {/* Concentric Radar Rings */}
        <View style={styles.radarCenter} pointerEvents="none">
          <View style={[styles.radarRing, styles.ringLarge]} />
          <View style={[styles.radarRing, styles.ringMedium]} />
          <View style={[styles.radarRing, styles.ringSmall]} />
        </View>

        {/* Dynamic Nav2 Waypoint Trajectory (SVG Path replacing arbitrary CSS rotated line) */}
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          {/* Planned Nav2 Route Path */}
          <Path
            d={
              isAmr2
                ? 'M 32 58 L 32 50 L 52 50 L 52 30 L 68 30 L 68 22'
                : 'M 16 58 L 16 48 L 46 48 L 46 22 L 28 22'
            }
            stroke="rgba(21, 87, 208, 0.55)"
            strokeWidth="1.2"
            strokeDasharray="2.5, 2.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Origin Waypoint at Dock Bay Exit */}
          <Circle
            cx={isAmr2 ? 32 : 16}
            cy={58}
            r="1.6"
            fill="#ffffff"
            stroke={colors.primaryText}
            strokeWidth="0.8"
          />
          {/* Destination Waypoint at Target Rack Bin */}
          <Circle
            cx={isAmr2 ? 68 : 28}
            cy={isAmr2 ? 22 : 22}
            r="2"
            fill={colors.success}
            stroke="#ffffff"
            strokeWidth="0.8"
          />
        </Svg>

        {/* Rack Zones */}
        <View style={styles.zoneRackA}>
          <Text style={styles.zoneLabel}>Rack A (Multi-SKU)</Text>
          <View style={styles.rackGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <View key={i} style={styles.rackCell} />
            ))}
          </View>
        </View>

        <View style={styles.zoneRackB}>
          <Text style={styles.zoneLabel}>Rack B · QA Zone</Text>
          <View style={styles.rackCellBulk} />
        </View>

        <View style={[styles.zoneDocks, { bottom: dockZoneBottom }]}>
          <Text style={styles.zoneLabel}>Loading Docks</Text>
          <View style={styles.docksRow}>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>Dock 01</Text>
            </View>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>Dock 02</Text>
            </View>
            <View style={styles.dockBox}>
              <Text style={styles.dockText}>Dock 03</Text>
            </View>
          </View>
        </View>

        {/* Active Nav2 Path Badge */}
        <View style={styles.statusPill}>
          <View style={styles.pulseDot} />
          <Text style={styles.statusPillText}>Nav2 active · {selectedRobot}</Text>
        </View>

        {/* Robot AMR-01 Marker (En Route in Central Aisle) */}
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            setSelectedRobot('AMR-01');
          }}
          style={[
            styles.robotWrapper,
            { left: '46%', top: '28%' },
            !isAmr2 && styles.robotWrapperActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="AMR-01, en route"
          accessibilityState={{ selected: !isAmr2 }}
        >
          {!isAmr2 && <View style={styles.sonarCone} />}
          <View style={[styles.robotCircle, !isAmr2 && styles.robotCircleSelected]}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <G rotation={0} origin="12, 12">
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
          <View style={[styles.robotPill, !isAmr2 && styles.robotPillActive]}>
            <View style={[styles.robotDot, { backgroundColor: '#16a34a' }]} />
            <Text style={styles.robotPillId} numberOfLines={1}>AMR-01</Text>
            <Text style={styles.robotPillSub} numberOfLines={1}>1.2 m/s</Text>
          </View>
        </Pressable>

        {/* Robot AMR-02 Marker (Standby Bay - Separate from Rack B) */}
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            setSelectedRobot('AMR-02');
          }}
          style={[
            styles.robotWrapper,
            { left: '72%', top: '16%' },
            isAmr2 && styles.robotWrapperActive,
          ]}
          accessibilityRole="button"
          accessibilityLabel="AMR-02, on standby"
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
          <View style={[styles.robotPill, isAmr2 && styles.robotPillActive]}>
            <View style={[styles.robotDot, { backgroundColor: colors.warning }]} />
            <Text style={styles.robotPillId} numberOfLines={1}>AMR-02</Text>
            <Text style={styles.robotPillSub} numberOfLines={1}>Standby</Text>
          </View>
        </Pressable>

        {/* Telemetry Bottom Sheet */}
        <View
          style={[styles.telemetrySheet, { bottom: sheetBottom }]}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.sheetTop}>
            <View>
              <Text style={styles.sheetRobotId}>{selectedRobot}</Text>
              <Text style={styles.sheetRoute} numberOfLines={1}>
                {route}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>Live telemetry</Text>
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
              <Text style={styles.metricLabel}>To target</Text>
            </View>
            <View style={[styles.metricCol, { borderRightWidth: 0 }]}>
              <Text style={[styles.metricVal, { color: colors.darkAction }]}>
                {isAmr2 ? 'Standby' : '45s'}
              </Text>
              <Text style={styles.metricLabel}>Est. arrival</Text>
            </View>
          </View>

          {/* Target Location Banner */}
          <View style={styles.targetBanner}>
            <Clock3 size={15} color={colors.textSecondary} />
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
  headerLocateBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLocateBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  toast: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: colors.darkAction,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 50,
    ...shadows.float,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: typography.fontSans,
  },
  mapViewport: {
    flex: 1,
    backgroundColor: colors.mapBackground,
    position: 'relative',
    overflow: 'hidden',
  },
  radarCenter: {
    position: 'absolute',
    left: '50%',
    top: '42%',
    alignItems: 'center',
    justifyContent: 'center',
    width: 0,
    height: 0,
  },
  radarRing: {
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
  zoneRackA: {
    position: 'absolute',
    left: '7%',
    top: '11%',
    width: '38%',
    height: '28%',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.mapLine,
    padding: 10,
  },
  zoneRackB: {
    position: 'absolute',
    right: '7%',
    top: '40%',
    width: '38%',
    height: '24%',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.mapLine,
    padding: 10,
  },
  zoneDocks: {
    position: 'absolute',
    left: '7%',
    width: '50%',
    height: 72,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.mapLine,
    padding: 10,
  },
  zoneLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
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
    height: 30,
    backgroundColor: colors.mapRack,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  statusPill: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.panel,
    zIndex: 30,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
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
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(21, 87, 208, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(21, 87, 208, 0.25)',
  },
  robotCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.darkAction,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  robotCircleSelected: {
    borderColor: '#ffffff',
    borderWidth: 4,
    transform: [{ scale: 1.08 }],
  },
  robotPill: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 3,
    ...shadows.panel,
    flexWrap: 'nowrap',
  },
  robotPillActive: {
    borderColor: colors.primaryText,
    borderWidth: 1.5,
  },
  robotDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  robotPillId: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    flexShrink: 0,
  },
  robotPillSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
    flexShrink: 0,
  },
  telemetrySheet: {
    position: 'absolute',
    left: 14,
    right: 14,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.float,
  },
  sheetTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sheetRobotId: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  sheetRoute: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
    maxWidth: 220,
    fontFamily: typography.fontSans,
  },
  statusBadge: {
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontSans,
  },
  metricRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 14,
    paddingTop: 12,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  metricVal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  targetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    fontFamily: typography.fontSans,
  },
});
