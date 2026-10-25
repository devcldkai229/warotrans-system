import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { getApiBaseUrl } from '../api/client';
import type { MapVersionDetailDto } from '../api/navigationApi';
import type { RobotResponse } from '../types/contracts';
import type { RobotTelemetryEvent } from '../realtime/realtimeClient';
import { worldToMapPercent } from '../utils/mapCoordinates';
import { Text } from '../ui';
import { colors } from '../theme/colors';

interface Props {
  map: MapVersionDetailDto | null;
  robots: RobotResponse[];
  telemetry: Record<string, RobotTelemetryEvent>;
  selectedRobot: string;
  onSelectRobot: (code: string) => void;
}

/** Actual map raster and surveyed geometry. Robot poses use the map's origin, rotation and resolution. */
export function WarehouseMapLayer({ map, robots, telemetry, selectedRobot, onSelectRobot }: Props) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const valid = map && map.imageWidthPixels > 0 && map.imageHeightPixels > 0 && map.resolution > 0;
  const scale = valid ? Math.min(bounds.width / map.imageWidthPixels, bounds.height / map.imageHeightPixels) : 0;
  const width = valid ? map.imageWidthPixels * scale : 0;
  const height = valid ? map.imageHeightPixels * scale : 0;
  const uri = map?.previewImageUri;
  return <View style={styles.root} onLayout={event => setBounds(event.nativeEvent.layout)}>
    {!valid ? <View style={styles.empty}><Text variant="body">Published Map Unavailable</Text></View> :
      <View style={{ position: 'absolute', left: (bounds.width - width) / 2, top: (bounds.height - height) / 2, width, height }}>
        {uri && <Image source={{ uri: /^https?:\/\//.test(uri) ? uri : `${getApiBaseUrl()}${uri.startsWith('/') ? '' : '/'}${uri}` }}
          resizeMode="stretch" style={StyleSheet.absoluteFill} />}
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          {(map.edges || []).filter(edge => edge.isActive).map(edge => {
            const points = edge.geometry?.coordinates?.map(point => worldToMapPercent(point[0], point[1], map));
            return points?.length ? <Path key={edge.id} d={points.filter(point => point !== null).map((point, index) => `${index ? 'L' : 'M'} ${point!.x} ${point!.y}`).join(' ')}
              fill="none" stroke="rgba(21,87,208,0.35)" strokeWidth={0.5} /> : null;
          })}
          {map.endpoints.filter(endpoint => endpoint.isEnabled).map(endpoint => {
            const point = worldToMapPercent(endpoint.x, endpoint.y, map);
            return point && <Circle key={endpoint.id} cx={point.x} cy={point.y} r={0.7} fill={colors.primary} />;
          })}
        </Svg>
        {map.endpoints.filter(endpoint => endpoint.isEnabled).map(endpoint => {
          const point = worldToMapPercent(endpoint.x, endpoint.y, map);
          return point && <View key={endpoint.id} pointerEvents="none" style={{ position: 'absolute', left: `${point.x}%`, top: `${point.y}%` }}>
            <Text variant="caption" style={styles.endpoint}>{endpoint.code}</Text>
          </View>;
        })}
        {robots.filter(robot => robot.currentMapVersionId === map.id).map(robot => {
          const pose = telemetry[robot.code] || robot;
          if (!pose.lastTelemetryAt) return null;
          const point = worldToMapPercent(pose.poseX, pose.poseY, map);
          if (!point || point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return null;
          return <Pressable key={robot.id} accessibilityRole="button" accessibilityLabel={`Track robot ${robot.code}`}
            onPress={() => onSelectRobot(robot.code)} style={[styles.marker, { left: `${point.x}%`, top: `${point.y}%` }, selectedRobot === robot.code && styles.selected]}>
            <Svg width={22} height={22} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${90 - (pose.poseYaw - map.originYaw) * 180 / Math.PI}deg` }] }}>
              <Path d="M12 2 L21 21 L12 17 L3 21 Z" fill={colors.primary} />
            </Svg>
            <Text variant="caption" numberOfLines={1}>{robot.code}</Text>
          </Pressable>;
        })}
      </View>}
  </View>;
}
const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.background, overflow: 'hidden' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  marker: { position: 'absolute', minWidth: 64, minHeight: 48, marginLeft: -32, marginTop: -24, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  endpoint: { backgroundColor: colors.surface, paddingHorizontal: 3, borderRadius: 4, marginLeft: 4 },
});
