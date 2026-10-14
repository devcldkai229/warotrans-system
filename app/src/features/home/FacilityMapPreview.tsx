import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { User } from 'lucide-react-native';
import Svg, { Defs, G, Line, Pattern, Path, Rect } from 'react-native-svg';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Text } from '../../shared/ui';
import { ROBOT_HEADING_ARROW_PATH } from './MiniFacilityMap';

export interface MapPreviewRobot {
  id: string;
  xPercent: number;
  yPercent: number;
  headingDeg: number;
  /** Fill of the puck: `primary` in transit, `success` on standby. */
  tone: 'primary' | 'success';
}

/** Puck fill for a robot that is moving through the facility. */
const TONE_MOVING = 'primary';

interface FacilityMapPreviewProps {
  robots: MapPreviewRobot[];
  /** Percentage position of the operator's own marker. */
  workerAt?: { xPercent: number; yPercent: number };
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Non-interactive facility thumbnail for the Home screen.
 *
 * This is a *preview*, not the map: it answers "where is my fleet right now?"
 * in the two seconds it takes to glance at the card, and hands over to the live
 * telemetry screen for everything else. That is why it drops the live map's
 * search bar, sonar sweep and selection radar — at 150pt tall those became
 * unreadable furniture, and the grid plus three labelled zones still reads as
 * "warehouse".
 *
 * Markers reuse `ROBOT_HEADING_ARROW_PATH` from the live map so a robot does not
 * change silhouette when the operator crosses from Home into Live Map.
 */
export function FacilityMapPreview({
  robots,
  workerAt = { xPercent: 20, yPercent: 78 },
  height = 150,
  style,
}: FacilityMapPreviewProps) {
  return (
    <View style={[styles.map, { height }, style]}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="preview-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0" x2="20" y2="0" stroke={colors.mapGrid} strokeWidth="1" />
            <Line x1="0" y1="0" x2="0" y2="20" stroke={colors.mapGrid} strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#preview-grid)" />
      </Svg>

      <View style={styles.zoneA}>
        <Text variant="caption" color={colors.textSecondary} style={styles.zoneLabel}>
          Zone A
        </Text>
        <View style={styles.rackGrid}>
          {RACKS_A.map((rackId) => (
            <View key={rackId} style={styles.rack} />
          ))}
        </View>
      </View>

      <View style={styles.zoneB}>
        <Text variant="caption" color={colors.textSecondary} style={styles.zoneLabel}>
          Zone B
        </Text>
        <View style={styles.rackGrid}>
          {RACKS_B.map((rackId) => (
            <View key={rackId} style={styles.rack} />
          ))}
        </View>
      </View>

      <View style={styles.docks}>
        {DOCKS.map((dockId) => (
          <View key={dockId} style={styles.dock} />
        ))}
      </View>

      {/* Operator position */}
      <View
        pointerEvents="none"
        style={[
          styles.worker,
          { left: `${workerAt.xPercent}%`, top: `${workerAt.yPercent}%` },
        ]}
      >
        <View style={styles.workerAvatar}>
          <User size={12} color={colors.textInverse} />
        </View>
      </View>

      {/* Fleet */}
      {robots.map((robot) => (
        <View
          key={robot.id}
          pointerEvents="none"
          style={[
            styles.robotWrap,
            { left: `${robot.xPercent}%`, top: `${robot.yPercent}%` },
          ]}
        >
          <View
            style={[
              styles.robotPuck,
              robot.tone === TONE_MOVING ? styles.robotPuckMoving : styles.robotPuckIdle,
            ]}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24">
              <G rotation={robot.headingDeg} origin="12, 12">
                <Path d={ROBOT_HEADING_ARROW_PATH} fill={colors.textInverse} />
              </G>
            </Svg>
          </View>
          <Text variant="caption" color={colors.textPrimary} style={styles.robotTag}>
            {robot.id}
          </Text>
        </View>
      ))}
    </View>
  );
}

const RACKS_A = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
const RACKS_B = ['b1', 'b2', 'b3', 'b4'];
const DOCKS = ['d1', 'd2', 'd3'];

const styles = StyleSheet.create({
  map: {
    width: '100%',
    backgroundColor: colors.mapBackground,
    overflow: 'hidden',
  },
  zoneA: {
    position: 'absolute',
    left: '5%',
    top: '8%',
    width: '42%',
    height: '46%',
    padding: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.mapLine,
    backgroundColor: colors.mapZoneBg,
  },
  zoneB: {
    position: 'absolute',
    right: '5%',
    top: '8%',
    width: '42%',
    height: '46%',
    padding: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.mapLine,
    backgroundColor: colors.mapZoneBg,
  },
  zoneLabel: {
    marginBottom: 4,
  },
  rackGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  rack: {
    width: '28%',
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.mapRack,
  },
  docks: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    bottom: '9%',
    height: '18%',
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.mapLine,
    backgroundColor: colors.mapZoneBg,
  },
  dock: {
    flex: 1,
    borderRadius: 3,
    backgroundColor: colors.mapRack,
  },
  worker: {
    position: 'absolute',
    width: 24,
    height: 24,
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workerAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  robotWrap: {
    position: 'absolute',
    width: 56,
    marginLeft: -28,
    marginTop: -14,
    alignItems: 'center',
  },
  robotPuck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  robotPuckMoving: {
    backgroundColor: colors.primary,
  },
  robotPuckIdle: {
    backgroundColor: colors.success,
  },
  robotTag: {
    marginTop: 2,
    fontWeight: '600',
  },
});