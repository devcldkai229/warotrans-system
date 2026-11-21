import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { RobotResponse } from '../../types/contracts';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { ThemeColors } from '../../theme/colors';
import { ThemeShadows } from '../../theme/shadows';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import { Text } from '../../ui';
import { MapAnchor } from '../MapAnchor';
import { mapHeading } from '../mapModel';
import { mapRobotState, type MapUpdateMode } from '../mapTelemetry';
import { worldToBase, type MapFrame, type MapPoint } from '../mapTransform';
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

interface RobotMarkerProps {
  robot: RobotResponse;
  point: MapPoint;
  heading: number;
  tone: string;
  isSelected: boolean;
  isError: boolean;
  lastReported: boolean;
  stateLabel: string;
  isDark: boolean;
  camera: MapCameraController;
  onSelect: (code: string) => void;
}

const RobotMarker = memo(function RobotMarker({
  robot,
  point,
  heading,
  tone,
  isSelected,
  isError,
  lastReported,
  stateLabel,
  isDark,
  camera,
  onSelect,
}: RobotMarkerProps) {
  const styles = useThemedStyles(createStyles);

  const chassisFill = isDark ? '#ffffff' : '#1e293b';
  const chassisStroke = isDark ? '#0b0f17' : '#ffffff';
  const deckFill = isDark ? '#dbe2ec' : '#334155';
  const deckStroke = isDark ? '#94a3b8' : '#475569';

  return (
    <MapAnchor point={point} camera={camera} width={BOX} height={BOX + 12}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Robot ${robot.code}, ${robot.status}, ${stateLabel}`}
        accessibilityState={{ selected: isSelected }}
        onPress={() => {
          if (Date.now() - camera.lastGestureAt > 200) onSelect(robot.code);
        }}
        style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
      >
        <View style={styles.svgBox}>
          <Svg width={BOX} height={BOX} viewBox={`${-BOX / 2} ${-BOX / 2} ${BOX} ${BOX}`}>
            <Circle
              r={isSelected ? 17.5 : 14}
              fill={isError ? ROBOT_COLOR.ERROR : tone}
              opacity={isSelected ? (isDark ? 0.28 : 0.2) : isDark ? 0.18 : 0.12}
            />
            {isSelected ? (
              <Circle
                r={17.5}
                fill="none"
                stroke={tone}
                strokeWidth={1.5}
                strokeDasharray="3.5 2.5"
              />
            ) : isError ? (
              <Circle r={16.5} fill="none" stroke={ROBOT_COLOR.ERROR} strokeWidth={1.4} />
            ) : null}
            <G transform={`rotate(${heading})`}>
              <Path d="M0 -15.5 L4 -10.5 L-4 -10.5 Z" fill={tone} />
              <Rect
                x={-7}
                y={-9.5}
                width={14}
                height={19}
                rx={3.8}
                fill={chassisFill}
                stroke={lastReported ? tone : chassisStroke}
                strokeWidth={1.5}
                strokeDasharray={lastReported ? '3 2' : undefined}
              />
              <Rect x={-5.8} y={-8.7} width={11.6} height={3.5} rx={1.4} fill={tone} />
              <Rect
                x={-4}
                y={-3}
                width={8}
                height={8.8}
                rx={1.5}
                fill={deckFill}
                stroke={deckStroke}
                strokeWidth={0.8}
              />
              <Rect x={-2} y={0.4} width={4} height={2} rx={0.8} fill={tone} opacity={0.45} />
            </G>
          </Svg>
        </View>
        <View
          style={[
            styles.tag,
            styles.tagDefault,
            isSelected && { backgroundColor: tone, borderColor: tone },
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
            maxFontSizeMultiplier={1.2}
            style={[styles.tagText, isSelected && styles.tagTextSelected]}
          >
            {robot.code}
          </Text>
        </View>
      </Pressable>
    </MapAnchor>
  );
});

/**
 * OTTO-inspired precision top-down industrial AMR chassis sized for compact warehouse maps,
 * maintaining a >= 48pt interactive touch target.
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
            <RobotMarker
              key={robot.id}
              robot={robot}
              point={point}
              heading={heading}
              tone={tone}
              isSelected={isSelected}
              isError={isError}
              lastReported={state.lastReported}
              stateLabel={state.label}
              isDark={isDark}
              camera={camera}
              onSelect={onSelect}
            />
          );
        })}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    hit: { flex: 1, alignItems: 'center' },
    hitPressed: { opacity: 0.84, transform: [{ scale: 0.95 }] },
    svgBox: { width: BOX, height: BOX, alignItems: 'center', justifyContent: 'center' },
    tag: {
      marginTop: -9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 5,
      borderWidth: 1,
    },
    tagDefault: {
      backgroundColor: colors.mapLabelBg,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : colors.mapHudBorder,
    },
    tagDot: { width: 4.5, height: 4.5, borderRadius: 2.25 },
    tagText: { fontSize: 9.5, lineHeight: 12, color: colors.textPrimary },
    tagTextSelected: { color: '#ffffff' },
  });
