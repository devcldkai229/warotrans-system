import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { RobotResponse } from '../../types/contracts';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { ThemeColors } from '../../theme/colors';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { Text } from '../../ui';
import { MapAnchor } from '../MapAnchor';
import { mapHeading } from '../mapModel';
import { mapRobotState, type MapUpdateMode } from '../mapTelemetry';
import { worldToBase, type MapFrame } from '../mapTransform';
import type { MapCameraController } from '../hooks/useMapCamera';
import { ROBOT_COLOR } from '../mapStyle';

const BOX = 48;

interface Props {
  map: MapVersionDetailDto;
  frame: MapFrame;
  robots: RobotResponse[];
  camera: MapCameraController;
  selected: string;
  now: number;
  updateMode?: MapUpdateMode;
  onSelect: (code: string) => void;
}

/**
 * OTTO-inspired top-down industrial AMR chassis:
 * rounded rectangular platform with recessed cargo deck, status-colored front bumper & heading arrow,
 * and a clean code pill below. Maintains a 48pt minimum touch target.
 */
export function RobotLayer({
  map,
  frame,
  robots,
  camera,
  selected,
  now,
  updateMode = 'polling',
  onSelect,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

  const chassisFill = isDark ? '#f8fafc' : '#1e293b';
  const chassisStroke = isDark ? '#0f172a' : '#ffffff';
  const deckFill = isDark ? '#cbd5e1' : '#334155';
  const deckStroke = isDark ? '#94a3b8' : '#475569';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {robots
        .filter(robot => robot.currentMapVersionId === map.id && robot.isOnline)
        .map(robot => {
          const state = mapRobotState(robot, map, now, updateMode);
          const point = worldToBase({ x: robot.poseX, y: robot.poseY }, map, frame);
          if (!state.showPose || !point) return null;

          const tone = state.lastReported
            ? colors.textMuted
            : ROBOT_COLOR[robot.status] ?? colors.primary;
          const isSelected = selected === robot.code;
          const isError = robot.status === 'ERROR';
          const heading = mapHeading(robot.poseYaw, map.originYaw, frame.rotated);

          return (
            <MapAnchor key={robot.id} point={point} camera={camera} width={BOX} height={BOX + 16}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Robot ${robot.code}, ${robot.status}, ${state.label}`}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  if (Date.now() - camera.lastGestureAt > 200) onSelect(robot.code);
                }}
                style={styles.hit}
              >
                <View style={{ width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' }}>
                  <Svg width={BOX} height={BOX} viewBox={`${-BOX / 2} ${-BOX / 2} ${BOX} ${BOX}`}>
                    <Circle
                      r={isSelected ? 22 : 18}
                      fill={isError ? ROBOT_COLOR.ERROR : tone}
                      opacity={isSelected ? 0.22 : 0.14}
                    />
                    {isSelected ? (
                      <Circle
                        r={22}
                        fill="none"
                        stroke={tone}
                        strokeWidth={1.6}
                        strokeDasharray="4 3"
                      />
                    ) : isError ? (
                      <Circle r={21} fill="none" stroke={ROBOT_COLOR.ERROR} strokeWidth={1.5} />
                    ) : null}
                    <G transform={`rotate(${heading})`}>
                      <Path d="M0 -21 L5.5 -14 L-5.5 -14 Z" fill={tone} />
                      <Rect
                        x={-9.5}
                        y={-12}
                        width={19}
                        height={24}
                        rx={4.5}
                        fill={chassisFill}
                        stroke={state.lastReported ? tone : chassisStroke}
                        strokeWidth={1.8}
                        strokeDasharray={state.lastReported ? '3 2' : undefined}
                      />
                      <Rect x={-8} y={-11} width={16} height={4.5} rx={2} fill={tone} />
                      <Rect
                        x={-5.5}
                        y={-4}
                        width={11}
                        height={11.5}
                        rx={2}
                        fill={deckFill}
                        stroke={deckStroke}
                        strokeWidth={0.9}
                      />
                      <Rect x={-2.5} y={0.5} width={5} height={2.5} rx={1} fill={tone} opacity={0.5} />
                    </G>
                  </Svg>
                </View>
                <View
                  style={[
                    styles.tag,
                    {
                      backgroundColor: isSelected ? tone : colors.mapLabelBg,
                      borderColor: isSelected ? tone : colors.mapHudBorder,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.tagDot,
                      { backgroundColor: isSelected ? '#ffffff' : tone },
                    ]}
                  />
                  <Text
                    variant="caption"
                    fontWeight="700"
                    numberOfLines={1}
                    style={[styles.tagText, isSelected && { color: '#ffffff' }]}
                  >
                    {robot.code}
                  </Text>
                </View>
              </Pressable>
            </MapAnchor>
          );
        })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    hit: { flex: 1, alignItems: 'center' },
    tag: {
      marginTop: -5,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: 6,
      borderWidth: 1,
    },
    tagDot: { width: 5, height: 5, borderRadius: 2.5 },
    tagText: { fontSize: 10, lineHeight: 13, color: colors.textPrimary },
  });
