import React, { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { ThemeColors } from '../../theme/colors';
import { ThemeShadows } from '../../theme/shadows';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';
import type { RobotResponse } from '../../types/contracts';
import { Text } from '../../ui';
import type { MapCameraController } from '../hooks/useMapCamera';
import { MapAnchor } from '../MapAnchor';
import {
  ROBOT_TAG_GAP,
  ROBOT_TAG_HEIGHT,
  ROBOT_TAG_WIDTH,
  resolveRobotTagPlacements,
  robotFootprintPx,
  type RobotTagPlacement,
} from '../mapArchitecture';
import { mapHeading } from '../mapModel';
import { ROBOT_COLOR } from '../mapStyle';
import { mapRobotState, type MapUpdateMode } from '../mapTelemetry';
import { worldToBase, type MapFrame, type MapPoint } from '../mapTransform';

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

interface RobotInteractiveOverlayProps {
  robot: RobotResponse;
  point: MapPoint;
  halfLength: number;
  tone: string;
  isSelected: boolean;
  stateLabel: string;
  camera: MapCameraController;
  hitSize: number;
  placement: RobotTagPlacement;
  tagWidth: number;
  onSelect: (code: string) => void;
}

const RobotInteractiveOverlay = memo(function RobotInteractiveOverlay({
  robot,
  point,
  halfLength,
  tone,
  isSelected,
  stateLabel,
  camera,
  hitSize,
  placement,
  tagWidth,
  onSelect,
}: RobotInteractiveOverlayProps) {
  const styles = useThemedStyles(createStyles);
  const { zoom, x: camX, y: camY } = camera;
  const pointX = point.x;
  const pointY = point.y;

  const tagPos = useAnimatedStyle(
    () => {
      const z = zoom.get();
      const cx = pointX * z + camX.get();
      const cy = pointY * z + camY.get();
      const r = (halfLength + 2) * z;

      let tx = cx - ROBOT_TAG_WIDTH / 2;
      let ty = cy + r + ROBOT_TAG_GAP;

      if (placement === 'above') {
        ty = cy - r - ROBOT_TAG_GAP - ROBOT_TAG_HEIGHT;
      } else if (placement === 'right') {
        tx = cx + r + ROBOT_TAG_GAP + tagWidth / 2 - ROBOT_TAG_WIDTH / 2;
        ty = cy - ROBOT_TAG_HEIGHT / 2;
      } else if (placement === 'left') {
        tx = cx - r - ROBOT_TAG_GAP - tagWidth / 2 - ROBOT_TAG_WIDTH / 2;
        ty = cy - ROBOT_TAG_HEIGHT / 2;
      } else if (placement === 'below-far') {
        ty = cy + r + ROBOT_TAG_GAP + ROBOT_TAG_HEIGHT + 4;
      } else if (placement === 'above-far') {
        ty = cy - r - ROBOT_TAG_GAP - ROBOT_TAG_HEIGHT * 2 - 4;
      }

      return {
        transform: [{ translateX: tx }, { translateY: ty }],
      };
    },
    [pointX, pointY, halfLength, zoom, camX, camY, placement, tagWidth],
  );

  return (
    <>
      <MapAnchor point={point} camera={camera} width={hitSize} height={hitSize}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Robot ${robot.code}, ${robot.status}, ${stateLabel}`}
          accessibilityState={{ selected: isSelected }}
          onPress={() => {
            if (Date.now() - camera.lastGestureAt > 200) onSelect(robot.code);
          }}
          style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
        />
      </MapAnchor>

      <Animated.View
        pointerEvents="none"
        style={[styles.tagAnchor, isSelected && styles.tagAnchorSelected, tagPos]}
      >
        <View
          style={[
            styles.tag,
            styles.tagDefault,
            isSelected && styles.tagSelected,
          ]}
        >
          <View
            style={[
              styles.tagDot,
              { backgroundColor: tone },
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
      </Animated.View>
    </>
  );
});

/**
 * OTTO-inspired top-down AMR sprite rendered in real-world scale (`0.26m × 0.32m`) inside the
 * zoomed camera scene, paired with a screen-sized tap target and crisp tracking code pill.
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
  const footprint = useMemo(() => robotFootprintPx(map, frame), [map, frame]);

  const entries = useMemo(
    () =>
      robots
        .filter(robot => robot.currentMapVersionId === map.id && robot.isOnline)
        .flatMap(robot => {
          const state = mapRobotState(robot, map, now, updateMode);
          const point = worldToBase({ x: robot.poseX, y: robot.poseY }, map, frame);
          if (!state.showPose || !point) return [];
          const tone = state.lastReported
            ? colors.textMuted
            : ROBOT_COLOR[robot.status] ?? colors.primary;
          return [
            {
              robot,
              point,
              state,
              tone,
              isSelected: selected === robot.code,
              isError: robot.status === 'ERROR',
              heading: mapHeading(robot.poseYaw, map.originYaw, frame.rotated),
            },
          ];
        }),
    [robots, map, frame, now, updateMode, selected, colors.textMuted, colors.primary],
  );

  const w = footprint.width;
  const l = footprint.length;
  const hw = w / 2;
  const hl = l / 2;

  const tagLayouts = useMemo(
    () =>
      resolveRobotTagPlacements(
        entries.map(({ robot, point, isSelected }) => ({
          id: robot.id,
          code: robot.code,
          x: point.x,
          y: point.y,
          isSelected,
        })),
        hl,
        camera.settledZoom,
      ),
    [entries, hl, camera.settledZoom],
  );

  if (entries.length === 0) return null;

  const noseH = Math.max(3, l * 0.24);
  const noseW = Math.max(2.6, w * 0.24);
  const strokeUnit = 1 / Math.sqrt(Math.max(1, camera.settledZoom));
  const hitSize = Math.min(96, Math.max(48, Math.round(l * camera.settledZoom)));

  const chassisFill = isDark ? '#ffffff' : '#1e293b';
  const chassisStroke = isDark ? '#0b0f17' : '#ffffff';
  const deckFill = isDark ? '#dbe2ec' : '#334155';
  const deckStroke = isDark ? '#94a3b8' : '#475569';

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transformOrigin: '0px 0px' }, camera.sceneStyle]}
      >
        <Svg
          width={frame.width}
          height={frame.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
          accessibilityLabel="Live robots"
        >
          {entries.map(({ robot, point, tone, isSelected, isError, state, heading }) => (
            <G key={`chassis-${robot.id}`} transform={`translate(${point.x} ${point.y})`}>
              <Circle
                r={l * (isSelected ? 0.68 : 0.58)}
                fill={isError ? ROBOT_COLOR.ERROR : tone}
                opacity={isSelected ? (isDark ? 0.28 : 0.2) : isDark ? 0.18 : 0.12}
              />
              {isSelected ? (
                <Circle
                  r={l * 0.68}
                  fill="none"
                  stroke={tone}
                  strokeWidth={1.35 * strokeUnit}
                  strokeDasharray={`${3 * strokeUnit} ${2.2 * strokeUnit}`}
                />
              ) : isError ? (
                <Circle
                  r={l * 0.65}
                  fill="none"
                  stroke={ROBOT_COLOR.ERROR}
                  strokeWidth={1.35 * strokeUnit}
                />
              ) : null}
              <G transform={`rotate(${heading})`}>
                <Path
                  d={`M0 ${-hl - noseH} L${noseW} ${-hl - 0.5} L${-noseW} ${-hl - 0.5} Z`}
                  fill={tone}
                />
                <Rect
                  x={-hw}
                  y={-hl}
                  width={w}
                  height={l}
                  rx={w * 0.24}
                  fill={chassisFill}
                  stroke={state.lastReported ? tone : chassisStroke}
                  strokeWidth={1.35 * strokeUnit}
                  strokeDasharray={
                    state.lastReported ? `${2.5 * strokeUnit} ${1.8 * strokeUnit}` : undefined
                  }
                />
                <Rect
                  x={-hw * 0.82}
                  y={-hl + l * 0.04}
                  width={w * 0.82}
                  height={l * 0.18}
                  rx={l * 0.07}
                  fill={tone}
                />
                <Rect
                  x={-w * 0.3}
                  y={-l * 0.16}
                  width={w * 0.6}
                  height={l * 0.46}
                  rx={w * 0.12}
                  fill={deckFill}
                  stroke={deckStroke}
                  strokeWidth={0.75 * strokeUnit}
                />
                <Rect
                  x={-w * 0.15}
                  y={l * 0.03}
                  width={w * 0.3}
                  height={l * 0.1}
                  rx={l * 0.04}
                  fill={tone}
                  opacity={0.45}
                />
              </G>
            </G>
          ))}
        </Svg>
      </Animated.View>

      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {entries.map(({ robot, point, tone, isSelected, state }) => {
          const layout = tagLayouts[robot.id];
          return (
            <RobotInteractiveOverlay
              key={robot.id}
              robot={robot}
              point={point}
              halfLength={hl}
              tone={tone}
              isSelected={isSelected}
              stateLabel={state.label}
              camera={camera}
              hitSize={hitSize}
              placement={layout?.placement ?? 'below'}
              tagWidth={layout?.tagWidth ?? ROBOT_TAG_WIDTH}
              onSelect={onSelect}
            />
          );
        })}
      </View>
    </>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    hit: { flex: 1, borderRadius: 24 },
    hitPressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
    tagAnchor: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: ROBOT_TAG_WIDTH,
      alignItems: 'center',
    },
    tagAnchorSelected: {
      zIndex: 2,
    },
    tag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4.5,
      paddingHorizontal: 6.5,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
    },
    tagDefault: {
      backgroundColor: colors.mapLabelBg,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.22)' : colors.mapHudBorder,
    },
    tagSelected: {
      backgroundColor: isDark ? '#F3F4F6' : '#18191B',
      borderColor: isDark ? '#FFFFFF' : 'rgba(255, 255, 255, 0.16)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.36 : 0.18,
      shadowRadius: 4,
      elevation: 3,
    },
    tagDot: { width: 4.5, height: 4.5, borderRadius: 2.25 },
    tagText: {
      fontSize: 9.5,
      lineHeight: 12,
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.15,
      color: colors.textPrimary,
    },
    tagTextSelected: { color: isDark ? '#111317' : '#FFFFFF' },
  });
