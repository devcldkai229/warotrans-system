import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../api/navigationApi';
import { ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { Text } from '../ui';
import { EndpointTile } from './EndpointGlyph';
import {
  ENDPOINT_NAME,
  JOB_HIGHLIGHT_COLOR,
  LANE_BLUE,
  PLAN_COLORS,
  ROBOT_COLOR,
  ZONE_COLOR,
  ZONE_DESCRIPTION,
  ZONE_FILL_OPACITY,
  ZONE_LABEL,
  laneArrowColor,
  laneBandOpacity,
} from './mapStyle';

const ROBOT_LEGEND_ITEMS = [
  { key: 'EXECUTING', label: 'Executing', color: ROBOT_COLOR.EXECUTING, stale: false },
  { key: 'AVAILABLE', label: 'Available', color: ROBOT_COLOR.AVAILABLE, stale: false },
  { key: 'CHARGING', label: 'Charging', color: ROBOT_COLOR.CHARGING, stale: false },
  { key: 'PAUSED', label: 'Paused', color: ROBOT_COLOR.PAUSED, stale: false },
  { key: 'ERROR', label: 'Error', color: ROBOT_COLOR.ERROR, stale: false },
  { key: 'LAST_REPORTED', label: 'Last Reported', color: ROBOT_COLOR.OFFLINE, stale: true },
] as const;

const CORE_ZONE_TYPES = [
  'KEEP_OUT',
  'SPEED',
  'NO_STOP',
  'SINGLE_OCCUPANCY',
  'JUNCTION',
] as const;

function MiniAmrGlyph({
  tone,
  isDark,
  stale = false,
}: {
  tone: string;
  isDark: boolean;
  stale?: boolean;
}) {
  const chassisFill = isDark ? '#f8fafc' : '#1e293b';
  const chassisStroke = isDark ? '#0f172a' : '#ffffff';
  const deckFill = isDark ? '#cbd5e1' : '#334155';
  const deckStroke = isDark ? '#94a3b8' : '#475569';

  return (
    <Svg width={28} height={28} viewBox="-15 -17 30 34">
      <Path d="M0 -15.5 L4 -10.5 L-4 -10.5 Z" fill={tone} />
      <Rect
        x={-7.5}
        y={-9}
        width={15}
        height={19}
        rx={3.5}
        fill={chassisFill}
        stroke={stale ? tone : chassisStroke}
        strokeWidth={1.5}
        strokeDasharray={stale ? '3 2' : undefined}
      />
      <Rect x={-6.2} y={-8.2} width={12.4} height={3.8} rx={1.5} fill={tone} />
      <Rect
        x={-4.2}
        y={-2.5}
        width={8.4}
        height={9}
        rx={1.5}
        fill={deckFill}
        stroke={deckStroke}
        strokeWidth={0.8}
      />
    </Svg>
  );
}

function MiniZoneSwatch({ type }: { type: string }) {
  const color = ZONE_COLOR[type] ?? ZONE_COLOR.JUNCTION;
  const fillOpacity = ZONE_FILL_OPACITY[type] ?? 0.22;
  const isKeepOut = type === 'KEEP_OUT';
  const patternId = `legend-hatch-${type}`;

  return (
    <Svg width={32} height={22} viewBox="0 0 32 22">
      <Defs>
        <Pattern
          id={patternId}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Line x1={0} y1={0} x2={0} y2={5} stroke={ZONE_COLOR.KEEP_OUT} strokeOpacity={0.65} strokeWidth={1.8} />
        </Pattern>
      </Defs>
      <Rect
        x={1.5}
        y={1.5}
        width={29}
        height={19}
        rx={4}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={1.6}
        strokeDasharray={isKeepOut ? undefined : '4 2.5'}
      />
      {isKeepOut ? (
        <Rect x={1.5} y={1.5} width={29} height={19} rx={4} fill={`url(#${patternId})`} />
      ) : null}
    </Svg>
  );
}

function MiniLaneSwatch({
  kind,
  isDark,
}: {
  kind: 'one-way' | 'two-way' | 'nav2-granted' | 'nav2-waiting';
  isDark: boolean;
}) {
  const arrow = laneArrowColor(isDark);
  const bandOp = Math.min(0.45, laneBandOpacity(isDark) + 0.1);
  const cyan = PLAN_COLORS[0];

  if (kind === 'nav2-granted' || kind === 'nav2-waiting') {
    const granted = kind === 'nav2-granted';
    return (
      <Svg width={36} height={18} viewBox="0 0 36 18">
        {granted ? (
          <>
            <Line x1={3} y1={9} x2={27} y2={9} stroke={cyan} strokeOpacity={0.25} strokeWidth={6} strokeLinecap="round" />
            <Line x1={3} y1={9} x2={27} y2={9} stroke={cyan} strokeWidth={2.5} strokeLinecap="round" />
            <Circle cx={30} cy={9} r={4} fill={cyan} fillOpacity={0.2} stroke={cyan} strokeWidth={1.5} />
            <Circle cx={30} cy={9} r={1.5} fill={cyan} />
          </>
        ) : (
          <Line
            x1={3}
            y1={9}
            x2={33}
            y2={9}
            stroke={cyan}
            strokeOpacity={0.65}
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
          />
        )}
      </Svg>
    );
  }

  return (
    <Svg width={36} height={20} viewBox="0 0 36 20">
      <Rect x={1} y={2} width={34} height={16} rx={3} fill={LANE_BLUE} fillOpacity={bandOp} />
      <Line x1={1} y1={2} x2={35} y2={2} stroke={LANE_BLUE} strokeOpacity={0.6} strokeWidth={1} />
      <Line x1={1} y1={18} x2={35} y2={18} stroke={LANE_BLUE} strokeOpacity={0.6} strokeWidth={1} />
      {kind === 'one-way' ? (
        <>
          <Line x1={3} y1={10} x2={33} y2={10} stroke={arrow} strokeOpacity={0.35} strokeWidth={1} />
          <Path d="M13 8.8 L19 8.8 L19 6 L25 10 L19 14 L19 11.2 L13 11.2 Z" fill={arrow} />
        </>
      ) : (
        <>
          <Line x1={1} y1={10} x2={35} y2={10} stroke={LANE_BLUE} strokeOpacity={0.7} strokeWidth={1} strokeDasharray="3 2.5" />
          <Path d="M12 5 L18 5 L18 3.2 L23 6 L18 8.8 L18 7 L12 7 Z" fill={arrow} />
          <Path d="M24 13 L18 13 L18 11.2 L13 14 L18 16.8 L18 15 L24 15 Z" fill={arrow} />
        </>
      )}
    </Svg>
  );
}

export function MapLegendContent({
  map,
  isDark,
  showLivePaths,
}: {
  map: MapVersionDetailDto;
  isDark: boolean;
  showLivePaths: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const presentZoneTypes = new Set(
    (map.zones || [])
      .filter(z => z.mapVersionId === map.id && z.isActive)
      .map(z => z.zoneType),
  );

  const orderedZoneTypes = [
    ...CORE_ZONE_TYPES.filter(t => presentZoneTypes.has(t)),
    ...CORE_ZONE_TYPES.filter(t => !presentZoneTypes.has(t)),
  ];

  return (
    <View style={styles.root}>
      {/* 1. Robots (AMR) */}
      <View style={styles.section}>
        <Text variant="caption" color="textSecondary" style={styles.sectionTitle}>
          ROBOTS (AMR)
        </Text>
        <Text variant="caption" color="textSecondary">
          Colored front bar and arrow point in the robot's heading direction.
        </Text>
        <View style={styles.grid}>
          {ROBOT_LEGEND_ITEMS.map(item => (
            <View key={item.key} style={styles.gridItem}>
              <MiniAmrGlyph tone={item.color} isDark={isDark} stale={item.stale} />
              <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
                {item.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* 2. Stations & Docks */}
      <View style={styles.section}>
        <Text variant="caption" color="textSecondary" style={styles.sectionTitle}>
          STATIONS & DOCKS
        </Text>
        <Text variant="caption" color="textSecondary">
          Wedge indicates robot arrival direction.
        </Text>
        <View style={styles.grid}>
          {(['WAYPOINT', 'CHARGER', 'PARK'] as const).map(type => (
            <View key={type} style={styles.gridItem}>
              <View style={styles.miniTileBox}>
                <EndpointTile
                  type={type}
                  headingDeg={0}
                  selected={false}
                  isDark={isDark}
                  surface={colors.surface}
                />
              </View>
              <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
                {ENDPOINT_NAME[type]}
              </Text>
            </View>
          ))}
          <View style={styles.gridItem}>
            <View style={styles.miniTileBox}>
              <View style={[styles.roleRing, { borderColor: JOB_HIGHLIGHT_COLOR.pickup, backgroundColor: `${JOB_HIGHLIGHT_COLOR.pickup}22` }]} />
            </View>
            <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
              Pickup
            </Text>
          </View>
          <View style={styles.gridItem}>
            <View style={styles.miniTileBox}>
              <View style={[styles.roleRing, { borderColor: JOB_HIGHLIGHT_COLOR.dropoff, backgroundColor: `${JOB_HIGHLIGHT_COLOR.dropoff}22` }]} />
            </View>
            <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
              Destination
            </Text>
          </View>
        </View>
      </View>

      {/* 3. Traffic Lanes & Paths */}
      <View style={styles.section}>
        <Text variant="caption" color="textSecondary" style={styles.sectionTitle}>
          TRAFFIC LANES & PATHS
        </Text>
        <View style={styles.listCard}>
          <View style={styles.listRow}>
            <MiniLaneSwatch kind="one-way" isDark={isDark} />
            <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
              One-way lane
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.listRow}>
            <MiniLaneSwatch kind="two-way" isDark={isDark} />
            <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
              Two-way lane
            </Text>
          </View>
          {showLivePaths ? (
            <>
              <View style={styles.divider} />
              <View style={styles.listRow}>
                <MiniLaneSwatch kind="nav2-granted" isDark={isDark} />
                <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
                  Live Nav2 Path (Authorized)
                </Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.listRow}>
                <MiniLaneSwatch kind="nav2-waiting" isDark={isDark} />
                <Text variant="caption" fontWeight="600" color="textPrimary" style={styles.flexText}>
                  Waiting for Traffic
                </Text>
              </View>
            </>
          ) : null}
        </View>
      </View>

      {/* 4. Operational Zones */}
      <View style={styles.section}>
        <Text variant="caption" color="textSecondary" style={styles.sectionTitle}>
          OPERATIONAL ZONES
        </Text>
        <View style={styles.listCard}>
          {orderedZoneTypes.map((type, idx) => {
            const onMap = presentZoneTypes.has(type);
            return (
              <View key={type}>
                <View style={styles.zoneRow}>
                  <MiniZoneSwatch type={type} />
                  <View style={styles.zoneTextCol}>
                    <View style={styles.zoneHeaderRow}>
                      <Text variant="caption" fontWeight="700" color="textPrimary">
                        {ZONE_LABEL[type] ?? type}
                      </Text>
                      {onMap ? (
                        <View style={styles.onMapBadge}>
                          <Text variant="caption" color="primaryText" style={styles.onMapBadgeText}>
                            On Map
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text variant="caption" color="textSecondary">
                      {ZONE_DESCRIPTION[type]}
                    </Text>
                  </View>
                </View>
                {idx < orderedZoneTypes.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { gap: 16 },
    section: { gap: 8 },
    sectionTitle: {
      fontWeight: '700',
      letterSpacing: 0.6,
      fontSize: 11,
      color: colors.textSecondary,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    gridItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      width: '48%',
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    miniTileBox: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      transform: [{ scale: 0.78 }],
    },
    roleRing: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2.5,
    },
    flexText: { flex: 1 },
    listCard: {
      backgroundColor: colors.surfaceSubtle,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      overflow: 'hidden',
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    zoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    zoneTextCol: {
      flex: 1,
      gap: 2,
    },
    zoneHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    onMapBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
      backgroundColor: colors.primaryLight,
    },
    onMapBadgeText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '700',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 14,
    },
  });
