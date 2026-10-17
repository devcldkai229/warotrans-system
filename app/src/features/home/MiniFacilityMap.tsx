import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../shared/api/navigationApi';
import { resolveMapAssetUrl } from '../../shared/api/navigationApi';
import type { RobotResponse } from '../../shared/types/contracts';
import { worldToImagePixel } from '../../shared/map/mapCoordinateTransform';
import { colors } from '../../shared/theme/colors';
import { Text } from '../../shared/ui';
export function MiniFacilityMap({ map, robots, onPress }: { map: MapVersionDetailDto | null; robots: RobotResponse[]; onPress?: () => void }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUri = resolveMapAssetUrl(map?.previewImageUri ?? map?.mapUri);
  React.useEffect(() => setImageFailed(false), [imageUri]);
  if (!map) return <View style={styles.empty}><Text>No Active Map Available</Text></View>;
  if (map.resolution <= 0 || map.imageWidthPixels <= 0 || map.imageHeightPixels <= 0) return <View style={styles.empty}><Text>Map Coordinate Metadata Is Unavailable</Text></View>;
  const w = map.imageWidthPixels; const h = map.imageHeightPixels;
  const scale = Math.max(w, h) / 360;
  const point = (coords: number[]) => worldToImagePixel(map, { x: coords[0], y: coords[1] });
  const path = (coords: number[][], close = false) => coords.map((coord, index) => { const p = point(coord); return `${index ? 'L' : 'M'}${p.u},${p.v}`; }).join(' ') + (close ? ' Z' : '');
  const positioned = robots.filter(r => r.currentMapVersionId === map.id && r.lastTelemetryAt && Number.isFinite(r.poseX) && Number.isFinite(r.poseY))
    .map(robot => ({ robot, point: point([robot.poseX, robot.poseY]) })).filter(p => p.point.u >= 0 && p.point.u <= w && p.point.v >= 0 && p.point.v <= h);
  return <View style={{ gap: 8 }}>
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={`Facility Map ${map.name}`} style={[styles.map, { aspectRatio: w / h }]}>
      {imageUri && !imageFailed && <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} resizeMode="stretch" onError={() => setImageFailed(true)} />}
      <Svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>

        {map.zones.filter(z => z.isActive).map(zone => <Path key={zone.id} d={zone.geometry.coordinates.map(ring => path(ring, true)).join(' ')}
          fill={colors.primaryLight} fillOpacity={0.5} stroke={colors.primaryBorder} strokeWidth={scale} fillRule="evenodd" />)}
        {map.edges.filter(e => e.isActive).map(edge => <Path key={edge.id} d={path(edge.geometry.coordinates)} stroke={colors.mapLine} strokeWidth={Math.max(2 * scale, edge.widthMeters / map.resolution)} fill="none" />)}
        {map.endpoints.map(endpoint => { const p = point([endpoint.x, endpoint.y]); return <Circle key={endpoint.id} cx={p.u} cy={p.v} r={3 * scale} fill={endpoint.isEnabled ? colors.textPrimary : colors.borderStrong} />; })}
        {positioned.map(({ robot, point: p }) => <React.Fragment key={robot.id}>
          <Circle cx={p.u} cy={p.v} r={6 * scale} fill={robot.isOnline ? colors.primaryText : colors.textSecondary} stroke={colors.surface} strokeWidth={2 * scale} />
          <Path d={`M ${p.u},${p.v} l ${12 * scale * Math.cos(robot.poseYaw - map.originYaw)},${-12 * scale * Math.sin(robot.poseYaw - map.originYaw)}`} stroke={colors.primaryText} strokeWidth={2 * scale} />
        </React.Fragment>)}
      </Svg>
      {positioned.map(({ robot, point: p }) => <View key={robot.id} pointerEvents="none" style={[styles.robotLabel, { left: `${Math.max(0, Math.min(75, p.u / w * 100))}%`, top: `${Math.max(0, Math.min(85, p.v / h * 100))}%` }]}>
        <Text variant="caption">{robot.code}</Text>
      </View>)}
    </Pressable>
    {(!imageUri || imageFailed) && <Text variant="caption">Map Image Unavailable. Showing Server Geometry.</Text>}
    <Text variant="caption">{map.name} · {map.endpoints.length} Endpoints · {map.edges.length} Edges · {map.zones.length} Zones</Text>
    <Text variant="caption">Robot Markers Require A Reported Pose On This Map. Positions May Be Stale While Disconnected.</Text>
  </View>;
}
const styles = StyleSheet.create({
  map: { width: '100%', backgroundColor: colors.mapBackground, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, overflow: 'hidden' },
  empty: { minHeight: 160, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: 12 },
  robotLabel: { position: 'absolute', marginTop: 8, paddingHorizontal: 4, backgroundColor: colors.surface, borderRadius: 4 },
});
