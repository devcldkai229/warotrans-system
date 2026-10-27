import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { getApiBaseUrl } from '../api/client';
import type { MapVersionDetailDto } from '../api/navigationApi';
import type { RobotResponse } from '../types/contracts';
import { mapRobotSnapshots } from '../maps/mapModel';
import { zoneColor } from '../maps/mapPresentation';
import { fitMapViewport, hasMapCalibration, resolveMapPreviewUri, worldToMapPercent } from '../utils/mapCoordinates';
import { Button, Text } from '../ui';
import { colors } from '../theme/colors';
import { MapViewport } from '../maps/MapViewport';
import { interactiveMapEnabled } from '../maps/mapFeatures';
import { mapRobotState, type MapUpdateMode } from '../maps/mapTelemetry';

interface Props {
  map: MapVersionDetailDto | null;
  robots: RobotResponse[];
  selectedRobot: string;
  onSelectRobot: (code: string) => void;
  loading?: boolean;
  contentInsets?: { top: number; bottom: number };
  updateMode?: MapUpdateMode;
}

/** Actual map raster and surveyed geometry. Robot poses use the map's origin, rotation and resolution. */
export function WarehouseMapLayer(props: Props) {
  return interactiveMapEnabled && props.map && hasMapCalibration(props.map) ? <MapViewport map={props.map} robots={props.robots}
    selectedRobot={props.selectedRobot} onSelectRobot={props.onSelectRobot} updateMode={props.updateMode} contentInsets={props.contentInsets} title="Job Map"/> : <LegacyWarehouseMapLayer {...props}/>;
}

function LegacyWarehouseMapLayer({ map, robots, selectedRobot, onSelectRobot, loading = false, contentInsets = { top: 0, bottom: 0 }, updateMode = 'polling' }: Props) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const geometry = map;
  const valid = hasMapCalibration(geometry);
  const availableHeight = Math.max(0, bounds.height - contentInsets.top - contentInsets.bottom);
  const { width, height } = valid ? fitMapViewport(geometry, Math.max(0, bounds.width - 24), availableHeight) : { width: 0, height: 0 };
  const uri = resolveMapPreviewUri(map?.previewImageUri, getApiBaseUrl());
  const source = uri ? { uri } : null;
  const [imageAttempt, setImageAttempt] = useState(0);
  const imageKey = `${map?.id}:${uri}:${imageAttempt}`;
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const runtimeMap = map;
  const endpoints = runtimeMap?.endpoints.filter(endpoint => endpoint.mapVersionId === map?.id && endpoint.isEnabled) || [];
  return <View style={styles.root} onLayout={event => setBounds(event.nativeEvent.layout)}>
    {!valid ? <View style={styles.empty}>{loading ? <ActivityIndicator color={colors.primary} /> : null}<Text variant="body">{loading ? 'Loading Map…' : 'Map Unavailable'}</Text></View> :
      <View style={{ position: 'absolute', left: (bounds.width - width) / 2, top: contentInsets.top + (availableHeight - height) / 2, width, height }}>
        {source && <Image key={imageKey} source={source} accessibilityLabel={`Map ${map?.code}`}
          onLoad={() => setLoadedImage(imageKey)} onError={() => setFailedImage(imageKey)} resizeMode="stretch" style={[StyleSheet.absoluteFill, { width, height }]} />}
        {source && loadedImage !== imageKey && failedImage !== imageKey ? <ActivityIndicator style={styles.imageLoading} color={colors.primary} /> : null}
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          {(runtimeMap?.zones || []).filter(zone => zone.mapVersionId === map?.id && zone.isActive && zone.geometry.type === 'Polygon').map(zone => {
            const rings = zone.geometry.coordinates.map(ring => ring.map(p => worldToMapPercent(p[0],p[1],geometry)));
            if (!rings.length || rings.some(ring => ring.length < 4 || ring.some(p => !p))) return null;
            const path = rings.map(ring => ring.map((p,i) => `${i ? 'L' : 'M'} ${p!.x} ${p!.y}`).join(' ') + ' Z').join(' ');
            return <Path key={zone.id} d={path} fill={zoneColor(zone.zoneType)} fillOpacity={0.08} fillRule="evenodd"
              stroke={zoneColor(zone.zoneType)} strokeWidth={0.3} strokeDasharray="1 1" />;
          })}
          {(runtimeMap?.edges || []).filter(edge => edge.mapVersionId === map?.id && edge.isActive && edge.geometry.type === 'LineString').map(edge => {
            const points = edge.geometry?.coordinates?.map(point => worldToMapPercent(point[0], point[1], geometry));
            return points.length >= 2 && points.every(Boolean) ? <Path key={edge.id} d={points.map((point, index) => `${index ? 'L' : 'M'} ${point!.x} ${point!.y}`).join(' ')}
              fill="none" stroke="rgba(21,87,208,0.35)" strokeWidth={0.5} /> : null;
          })}
          {endpoints.map(endpoint => {
            const point = worldToMapPercent(endpoint.x, endpoint.y, geometry);
            return point && <Circle key={endpoint.id} cx={point.x} cy={point.y} r={0.7} fill={colors.primary} />;
          })}
        </Svg>
        {endpoints.map(endpoint => {
          const point = worldToMapPercent(endpoint.x, endpoint.y, geometry);
          return point && <View key={endpoint.id} pointerEvents="none" style={{ position: 'absolute', left: `${point.x}%`, top: `${point.y}%` }}>
            <Text variant="caption" style={styles.endpoint}>{endpoint.code}</Text>
          </View>;
        })}
        {mapRobotSnapshots(robots, runtimeMap?.id || '').map(robot => {
          const pose = robot;
          const state = mapRobotState(robot,runtimeMap!,Date.now(),updateMode);
          if (!state.showPose) return null;
          const point = worldToMapPercent(pose.poseX, pose.poseY, geometry);
          if (!point || point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) return null;
          return <Pressable key={robot.id} accessibilityRole="button" accessibilityLabel={`Track robot ${robot.code}`}
            onPress={() => onSelectRobot(robot.code)} style={[styles.marker, { left: `${point.x}%`, top: `${point.y}%` }, selectedRobot === robot.code && styles.selected,
              state.lastReported && styles.lastKnown]}>
            <Svg width={22} height={22} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${90 - (pose.poseYaw - geometry.originYaw) * 180 / Math.PI}deg` }] }}>
              <Path d="M12 2 L21 21 L12 17 L3 21 Z" fill={colors.primary} />
            </Svg>
            <Text variant="caption" numberOfLines={1}>{robot.code}</Text>
            {state.lastReported ? <Text variant="caption">Last Reported</Text> : null}
          </Pressable>;
        })}
      </View>}
    {valid && (!source || failedImage === imageKey) ? <View style={[styles.imageError, { top: Math.max(72, contentInsets.top + 4) }]}>
      <Text variant="caption" color={colors.warningText}>{!source ? 'Map Has No Preview Image · Geometry Only' : 'Map Image Could Not Be Loaded'}</Text>
      {source ? <Button title="Retry Image" variant="outline" size="sm" onPress={() => setImageAttempt(attempt => attempt + 1)} /> : null}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.background, overflow: 'hidden' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  imageLoading: { ...StyleSheet.absoluteFill },
  imageError: { position: 'absolute', top: 72, left: 16, right: 16, padding: 10, borderRadius: 8, backgroundColor: colors.warningBg },
  marker: { position: 'absolute', minWidth: 64, minHeight: 48, marginLeft: -32, marginTop: -24, borderRadius: 16,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  selected: { borderColor: colors.primary, borderWidth: 2 },
  lastKnown: { borderStyle: 'dashed', borderColor: colors.textMuted },
  endpoint: { backgroundColor: colors.surface, paddingHorizontal: 3, borderRadius: 4, marginLeft: 4 },
});
