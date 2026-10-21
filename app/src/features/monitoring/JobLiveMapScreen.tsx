import { WarehouseMapLayer } from '../../shared/components/WarehouseMapLayer';
import { getMapVersionDetail, getActiveMapVersion, listWarehouses, type MapVersionDetailDto } from '../../shared/api';
import React, { useEffect, useState } from 'react';
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
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

import { useRealtime } from '../../shared/realtime';
import { getJobDetail, listJobs, listRobots, type RobotDto } from '../../shared/api';
import { mapJobDetailToAppJobItem, type AppJobItem } from '../jobs/jobData';

const SHEET_GAP = 8;
const DOCK_ZONE_GAP = 12;
const SHEET_FALLBACK_HEIGHT = 174;

export function JobLiveMapScreen() {
  const { params, dockHeight, goBack } = useNavigation();
  const { robotTelemetry, lastJobUpdate } = useRealtime();
  const [activeMap, setActiveMap] = useState<MapVersionDetailDto | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [liveJob, setLiveJob] = useState<AppJobItem | null>(null);
  const [fleetRobots, setFleetRobots] = useState<RobotDto[]>([]);
  const dockInset = dockReservedSpace(dockHeight);
  const [sheetHeight, setSheetHeight] = useState(0);
  const sheetBottom = SHEET_GAP;
  const dockZoneBottom = sheetBottom + (sheetHeight || SHEET_FALLBACK_HEIGHT) + DOCK_ZONE_GAP;
  const [selectedRobot, setSelectedRobot] = useState<string>(params?.robotId || '');
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  const jobId = params?.jobId || '';
  const target = params?.target || 'Unknown Destination';
  const route = params?.route || 'No Job Selected';
  const headerJobNo = liveJob?.jobNo || jobId;

  useEffect(() => {
    setLiveJob(null);
  }, [params?.jobId]);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveJob() {
      try {
        const fleet = await listRobots();
        const detail = params?.jobId ? await getJobDetail(params.jobId) : null;
        let mapId = detail?.mapVersionId;
        if (!mapId) {
          const warehouse = (await listWarehouses({ isActive: true })).items[0];
          if (warehouse) mapId = (await getActiveMapVersion(warehouse.id))?.id;
        }
        const map = mapId ? await getMapVersionDetail(mapId) : null;
        if (cancelled) return;
        setFleetRobots(fleet.items); setActiveMap(map); setMapError(null);
        const requested = fleet.items.find(robot => robot.id === params?.robotId || robot.code === params?.robotId);
        const assigned = fleet.items.find(robot => robot.id === detail?.contextValues?.assignedRobotId);
        setSelectedRobot(current => requested?.code || assigned?.code || (fleet.items.some(robot => robot.code === current) ? current : fleet.items.find(robot => robot.currentMapVersionId === map?.id)?.code || ''));
        setLiveJob(detail ? mapJobDetailToAppJobItem(detail) : null);
      } catch (error: any) {
        if (!cancelled) { setMapError(error.message || 'Map could not be loaded.'); setLiveJob(null); setActiveMap(null); }
      }
    }
    void loadLiveJob();
    return () => { cancelled = true; };
  }, [params?.jobId, params?.robotId, lastJobUpdate]);
  const telemetry = robotTelemetry[selectedRobot] || fleetRobots.find(robot => robot.code === selectedRobot);

  const handleCenter = () => {
    triggerHaptic('tap');
    const coords = telemetry ? `(X: ${telemetry.poseX.toFixed(1)}m, Y: ${telemetry.poseY.toFixed(1)}m)` : '';
    setToastFeedback(`Centered view on ${selectedRobot} ${coords}`);
    setTimeout(() => setToastFeedback(null), 3000);
  };

  return (
    <View style={styles.container}>
      {/* Safe-Area Aware Industrial SubScreenHeader with Back & Center Actions */}
      <SubScreenHeader
        label={`Tracking ${selectedRobot}`}
        title={headerJobNo.length === 36 ? 'Live Job' : headerJobNo}
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

        <WarehouseMapLayer map={activeMap} robots={fleetRobots} telemetry={robotTelemetry}
          selectedRobot={selectedRobot} onSelectRobot={setSelectedRobot} />
        {mapError && <View style={styles.toast}><Text style={styles.toastText}>{mapError}</Text></View>}

        {/* Telemetry Bottom Sheet */}
        <View
          style={[styles.telemetrySheet, { bottom: sheetBottom }]}
          onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.sheetTop}>
            <View>
              <Text style={styles.sheetRobotId}>{selectedRobot}</Text>
              <Text style={styles.sheetRoute} numberOfLines={1}>
                {liveJob?.route || route}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{telemetry?.lastTelemetryAt ? 'Telemetry Snapshot' : 'Telemetry Unavailable'}</Text>
            </View>
          </View>

          {/* Metric Columns */}
          <View style={styles.metricRow}>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>
                {telemetry ? `${Math.round(Number(telemetry.batteryPercent))}%` : '—'}
              </Text>
              <Text style={styles.metricLabel}>Battery</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricVal}>
                {telemetry ? `${telemetry.poseX.toFixed(1)}m, ${telemetry.poseY.toFixed(1)}m` : '—'}
              </Text>
              <Text style={styles.metricLabel}>{telemetry ? 'Live Pose' : 'To target'}</Text>
            </View>
            <View style={[styles.metricCol, { borderRightWidth: 0 }]}>
              <Text style={[styles.metricVal, { color: colors.darkAction }]}>
                {telemetry?.navigationStatus || 'Unknown'}
              </Text>
              <Text style={styles.metricLabel}>{telemetry ? 'Nav State' : 'Est. arrival'}</Text>
            </View>
          </View>

          {/* Target Location Banner */}
          <View style={styles.targetBanner}>
            <Clock3 size={15} color={colors.textSecondary} />
            <Text style={styles.targetBannerText} numberOfLines={1}>
              Target: {liveJob?.target || target}
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
