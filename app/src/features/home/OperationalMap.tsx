import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { BatteryMedium, Bot, Layers, MapPin, ParkingSquare, X, Zap } from 'lucide-react-native';
import type { EndpointDto, MapVersionDetailDto, ZoneDto } from '../../shared/api/navigationApi';
import type { RobotDto } from '../../shared/api';
import { getApiBaseUrl } from '../../shared/api/client';
import { displayPoint, findMapModel, mapHeading, mapRobotSnapshots, mapViewport, spacedLocations } from '../../shared/maps/mapModel';
import { zoneColor, zoneLabel } from '../../shared/maps/mapPresentation';
import { resolveMapPreviewUri, worldToMapPercent } from '../../shared/utils/mapCoordinates';
import { Button, Text } from '../../shared/ui';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { MapViewport } from '../../shared/maps/MapViewport';
import { interactiveMapEnabled } from '../../shared/maps/mapFeatures';
import { mapRobotState, mapUpdateLabel, type MapUpdateMode } from '../../shared/maps/mapTelemetry';

interface Props {
  map: MapVersionDetailDto;
  fleet: RobotDto[];
  selectedRobotId: string;
  onSelectRobot: (code: string) => void;
  bottomInset: number;
  updateMode?: MapUpdateMode;
}

/** A read-only operational view. All business geometry and robot identity come from this map version. */
export function OperationalMap(props: Props) {
  return interactiveMapEnabled ? <MapViewport map={props.map} robots={props.fleet} selectedRobot={props.selectedRobotId}
    onSelectRobot={props.onSelectRobot} updateMode={props.updateMode} contentInsets={{top:0,bottom:props.bottomInset}}/> : <LegacyOperationalMap {...props}/>;
}

function LegacyOperationalMap({ map, fleet, selectedRobotId, onSelectRobot, bottomInset, updateMode = 'polling' }: Props) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);
  const [layersOpen, setLayersOpen] = useState(false);
  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [showScan, setShowScan] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [loaded, setLoaded] = useState('');
  const [failed, setFailed] = useState('');
  const model = useMemo(() => findMapModel(map), [map]);
  const top = headerHeight + 12;
  const availableHeight = Math.max(0, bounds.height - top - bottomInset - 44);
  const viewport = mapViewport(map, Math.max(0, bounds.width - 52), availableHeight, bounds.height > bounds.width);
  const left = (bounds.width - viewport.width) / 2;
  const sceneTop = top + Math.max(0, (availableHeight - viewport.height) / 2);
  const uri = resolveMapPreviewUri(map.previewImageUri, getApiBaseUrl());
  const imageKey = `${map.id}:${uri}:${imageAttempt}`;
  const raster = !model || showScan;
  const endpoints = map.endpoints.filter(e => e.mapVersionId === map.id && e.isEnabled);
  const zones = (map.zones || []).filter(z => z.mapVersionId === map.id && z.isActive);
  const robots = fleet.filter(robot => robot.currentMapVersionId === map.id);
  const selectedRobot = robots.find(robot => robot.code === selectedRobotId) || robots[0];
  const selectedPose = selectedRobot;
  const endpoint = endpoints.find(e => e.id === endpointId);
  const detailsVisible = viewport.width >= 150 && viewport.height >= 220;
  const sceneVisible = availableHeight >= 140;
  const s = viewport.scale;
  const scaleMeters = s > 0 ? Number((30 / s * map.resolution).toPrecision(1)) : 0;
  const scaleWidth = scaleMeters / map.resolution * s;
  const transform = viewport.rotated ? `translate(${viewport.width} 0) rotate(90) scale(${s})` : `scale(${s})`;
  const point = (x: number, y: number) => displayPoint(x, y, map, viewport);
  const pixel = (x: number, y: number) => {
    const p = worldToMapPercent(x, y, map)!;
    return { x: p.x * map.imageWidthPixels / 100, y: p.y * map.imageHeightPixels / 100 };
  };
  const poseRobots = mapRobotSnapshots(robots, map.id);
  const robotPoints = poseRobots.map(r => point(r.poseX,r.poseY)).filter((p): p is {x:number;y:number} => !!p);
  const locationPoints = endpoints.map(endpoint => { const p = point(endpoint.x,endpoint.y); return p ? { ...p, endpoint } : null; }).filter((p): p is {x:number;y:number;endpoint:EndpointDto} => !!p);
  const visibleLocations = spacedLocations(locationPoints, robotPoints);
  const zonePath = (zone: ZoneDto) => zone.geometry.type === 'Polygon' ? zone.geometry.coordinates.map(ring => {
    const points = ring.map(p => point(p[0], p[1]));
    return points.length >= 4 && points.every(Boolean) ? points.map((p, i) => `${i ? 'L' : 'M'}${p!.x},${p!.y}`).join(' ') + ' Z' : '';
  }).join(' ') : '';

  return <View style={styles.root} onLayout={e => setBounds(e.nativeEvent.layout)}>
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
      <Defs><Pattern id="operational-dots" width="20" height="20" patternUnits="userSpaceOnUse"><Circle cx="1" cy="1" r="0.7" fill={colors.borderStrong} opacity={0.45} /></Pattern></Defs>
      <Rect width="100%" height="100%" fill="url(#operational-dots)" />
    </Svg>
    <View style={styles.heading} onLayout={e => setHeaderHeight(e.nativeEvent.layout.height)}>
      <View style={styles.headingRow}>
        <View style={styles.titleGroup}><Text variant="headline">Warehouse Overview</Text><Text variant="caption">{map.code} · V{map.versionNo}</Text></View>
        <Pressable style={styles.tool} accessibilityRole="button" accessibilityLabel="Map layers and locations" onPress={() => setLayersOpen(true)}><Layers size={19} color={colors.textPrimary} /></Pressable>
      </View>
      {selectedRobot ? <Pressable style={styles.telemetry} accessibilityRole="button" accessibilityLabel={`Robot ${selectedRobot.code} status`} onPress={() => onSelectRobot(selectedRobot.code)}>
        <View style={[styles.dot, { backgroundColor: selectedRobot.isOnline ? colors.success : colors.textMuted }]} /><Text variant="caption" fontWeight="700">{selectedRobot.code}</Text>
        <Text variant="caption" color={selectedRobot.isOnline ? 'successText' : 'textSecondary'}>{selectedRobot.isOnline ? 'Online' : 'Offline'}</Text>
        <BatteryMedium size={14} color={colors.textSecondary} /><Text variant="caption">{typeof selectedPose?.batteryPercent === 'number' ? `${Math.round(selectedPose.batteryPercent)}%` : '—'}</Text>
      </Pressable> : <Text variant="caption">No Robot Linked To This Map</Text>}
    </View>
    {sceneVisible && viewport.width > 0 && viewport.height > 0 ? <View style={[styles.floor, { position: 'absolute', left, top: sceneTop, width: viewport.width, height: viewport.height }]}>
      {raster && uri ? <Image key={imageKey} source={{ uri }} accessibilityLabel={`Published occupancy map ${map.code}`} resizeMode="stretch"
        onLoad={() => setLoaded(imageKey)} onError={() => setFailed(imageKey)}
        style={{ position: 'absolute', width: map.imageWidthPixels * s, height: map.imageHeightPixels * s,
          left: (viewport.width - map.imageWidthPixels * s) / 2, top: (viewport.height - map.imageHeightPixels * s) / 2,
          transform: [{ rotate: viewport.rotated ? '90deg' : '0deg' }], opacity: model ? 0.28 : 0.65 }} /> : null}
      <Svg style={StyleSheet.absoluteFill} width={viewport.width} height={viewport.height} pointerEvents="none" accessibilityLabel={model ? 'Warehouse operational model' : 'Warehouse map geometry'}>
        {model && !showScan ? <G transform={transform}>
          {model.unknown.map(([x,y,w,h], i) => <Rect key={`u${i}`} x={x} y={y} width={w} height={h} fill={colors.surfaceMuted} />)}
          {model.floorPaint?.map(z => {
            const a = pixel(z.x0, z.y1), b = pixel(z.x1, z.y0);
            const fill = z.name === 'inbound' ? colors.successBg : z.name === 'outbound' ? colors.warningBg : colors.primaryLight;
            return <Rect key={z.name} x={a.x} y={a.y} width={b.x-a.x} height={b.y-a.y} rx={2} fill={fill} stroke={colors.borderStrong} strokeWidth={0.3} strokeDasharray="2 2" />;
          })}
          <G transform="translate(1 2)" opacity={0.2}>{model.occupied.map(([x,y,w,h],i) => <Rect key={i} x={x} y={y} width={w} height={h} fill={colors.darkAction} />)}</G>
          {model.occupied.map(([x,y,w,h],i) => <Rect key={i} x={x} y={y} width={w} height={h} fill={colors.mapRack} stroke={colors.borderStrong} strokeWidth={0.35} />)}
          {model.shelves?.map(rack => {
            const a = pixel(rack.x-rack.sx/2, rack.y+rack.sy/2), b = pixel(rack.x+rack.sx/2, rack.y-rack.sy/2);
            return <G key={rack.code}><Rect x={a.x} y={a.y} width={b.x-a.x} height={b.y-a.y} fill={colors.darkAction} stroke={colors.textSecondary} strokeWidth={1} />
              {Array.from({length: rack.levels}, (_,i) => <Rect key={i} x={a.x+1.5} y={a.y+1.5+i*(b.y-a.y)/rack.levels} width={b.x-a.x-3} height={(b.y-a.y)/rack.levels-3} rx={0.7} fill={colors.mapRack} />)}</G>;
          })}
        </G> : null}
        {zones.map(zone => <Path key={zone.id} d={zonePath(zone)} fill={zoneColor(zone.zoneType)} fillOpacity={0.07} stroke={zoneColor(zone.zoneType)} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="4 4" fillRule="evenodd" />)}
        {(map.edges || []).filter(e => e.mapVersionId === map.id && e.isActive && e.geometry?.type === 'LineString').map(edge => {
          const points = edge.geometry.coordinates.map(p => point(p[0],p[1]));
          return points.length >= 2 && points.every(Boolean) ? <Path key={edge.id} d={points.map((p,i) => `${i ? 'L':'M'}${p!.x},${p!.y}`).join(' ')} fill="none" stroke={colors.mapLine} strokeWidth={2} strokeDasharray="3 5" /> : null;
        })}
        {endpoints.map(e => {const p = point(e.x,e.y); return p ? <Circle key={e.id} cx={p.x} cy={p.y} r={3} fill={colors.primaryText} /> : null;})}
      </Svg>
      {detailsVisible && !showScan && model?.floorPaint?.filter(z => ['inbound','outbound'].includes(z.name)).map(z => {
        const p = point((z.x0+z.x1)/2,(z.y0+z.y1)/2);
        return p ? <View key={z.name} pointerEvents="none" style={[styles.areaLabel,{left:p.x-44,top:p.y-10}]}><Text variant="caption" fontWeight="600" color="textSecondary">{z.name === 'inbound' ? 'Inbound' : 'Outbound'}</Text></View> : null;
      })}
      {detailsVisible && !showScan && model?.shelves?.map(rack => {
        const p = point(rack.x,rack.y);
        return p ? <View key={rack.code} pointerEvents="none" style={[styles.rackLabel,{left:p.x-32,top:p.y-10}]}><Text variant="caption" color="textInverse" fontWeight="700">Rack {rack.code}</Text></View> : null;
      })}
      {detailsVisible && visibleLocations.map(({endpoint:e,...p}) => {
        if (!p) return null;
        const Icon = e.endpointType === 'CHARGER' ? Zap : e.endpointType === 'PARK' ? ParkingSquare : MapPin;
        return <Pressable key={e.id} style={[styles.endpoint,{left:p.x-22,top:p.y-22}]} accessibilityRole="button" accessibilityLabel={`Location ${e.name}`} onPress={() => setEndpointId(e.id)}>
          <View style={[styles.pin, e.endpointType === 'CHARGER' && styles.charger]}><Icon size={14} color={e.endpointType === 'CHARGER' ? colors.successText : colors.textSecondary} /></View>
        </Pressable>;
      })}
      {detailsVisible && poseRobots.map(robot => {
        const pose = robot;
        if (!pose.lastTelemetryAt || !Number.isFinite(pose.poseYaw)) return null;
        const p = point(pose.poseX,pose.poseY);
        if (!p) return null;
        const state = mapRobotState(robot,map,Date.now(),updateMode);
        if (!state.showPose) return null;
        const localized = !state.lastReported;
        return <Pressable key={robot.id} style={[styles.robot,{left:p.x-22,top:p.y-22}, selectedRobot?.id === robot.id && styles.selectedRobot,
          (!robot.isOnline || !localized) && styles.lastKnown]} accessibilityRole="button" accessibilityLabel={`Track robot ${robot.code}${localized && robot.isOnline ? '' : ', last reported position'}`} onPress={() => onSelectRobot(robot.code)}>
          <View style={{position:'absolute', top: -9, transform:[{rotate:`${mapHeading(pose.poseYaw,map.originYaw,viewport.rotated)}deg`} ]}}><Svg width={12} height={12} viewBox="0 0 12 12"><Path d="M6 1 L11 11 L6 8 L1 11 Z" fill={localized && robot.isOnline ? colors.primaryText : colors.textMuted} /></Svg></View>
          <Bot size={21} color={localized && robot.isOnline ? colors.primaryText : colors.textMuted} />
        </Pressable>;
      })}
      {raster && uri && loaded !== imageKey && failed !== imageKey ? <ActivityIndicator style={StyleSheet.absoluteFill} color={colors.primary} /> : null}
    </View> : null}
    {sceneVisible ? <View pointerEvents="none" style={[styles.legend,{bottom:bottomInset+6}]}>
      <View style={styles.scale}><View style={[styles.scaleLine,{width:scaleWidth}]} /><Text variant="caption">{scaleMeters} m</Text></View>
      <Text variant="caption" style={styles.legendText}>{selectedPose ? mapRobotState(selectedPose,map,Date.now(),updateMode).label : mapUpdateLabel(updateMode)}{viewport.rotated ? ' · Rotated View' : ''}</Text>
    </View> : null}
    {raster && (!uri || failed === imageKey) ? <View style={[styles.imageError,{top:top+12}]}><Text variant="caption">{uri ? 'Map Image Could Not Be Loaded' : 'Map Preview Is Not Available'}</Text>{uri ? <Button title="Retry Image" variant="outline" size="sm" onPress={() => setImageAttempt(v=>v+1)} /> : null}</View> : null}
    {layersOpen ? <BottomSheet onClose={() => setLayersOpen(false)} accessibilityLabel="map layers">
      <View style={styles.sheetTitle}><Text variant="title" style={styles.flex}>Map Layers</Text><Button title="Close" icon={X} variant="ghost" size="sm" onPress={() => setLayersOpen(false)} /></View>
      <ScrollView contentContainerStyle={styles.sheetContent}>
        <Text variant="headline">{map.name}</Text><Text variant="body">Published · Version {map.versionNo}</Text>
        {model ? <View style={styles.segment}><Button title="Operational" variant={!showScan ? 'primary':'ghost'} onPress={() => setShowScan(false)} /><Button title="Scan" variant={showScan ? 'primary':'ghost'} onPress={() => setShowScan(true)} /></View> : <Text variant="body">The published scan is shown. An operational model has not been linked to this map yet.</Text>}
        <Text variant="headline">Locations · {endpoints.length}</Text>
        {!endpoints.length ? <Text variant="body">No locations have been configured on this map.</Text> : endpoints.map(e => <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Details for ${e.name}`} style={styles.locationRow} onPress={() => {setLayersOpen(false);setEndpointId(e.id);}}><MapPin size={18} color={colors.primaryText} /><View style={styles.flex}><Text variant="bodyMedium">{e.name}</Text><Text variant="caption">{e.code}</Text></View></Pressable>)}
        <Text variant="headline">Zones · {zones.length}</Text>
        {!zones.length ? <Text variant="body">No zones have been configured on this map.</Text> : zones.map(z => <View key={z.id} style={styles.locationRow}><View style={[styles.dot,{backgroundColor:zoneColor(z.zoneType)}]} /><View style={styles.flex}><Text variant="bodyMedium">{z.name}</Text><Text variant="caption">{zoneLabel(z.zoneType)} · Capacity {z.capacity}{z.maxSpeed != null ? ` · ${z.maxSpeed} m/s` : ''}</Text></View></View>)}
      </ScrollView>
    </BottomSheet> : null}
    {endpoint ? <LocationSheet endpoint={endpoint} onClose={() => setEndpointId(null)} /> : null}
  </View>;
}

function LocationSheet({endpoint,onClose}:{endpoint:EndpointDto;onClose:()=>void}) {
  return <BottomSheet onClose={onClose} accessibilityLabel="location details"><View style={styles.sheetTitle}><Text variant="title" style={styles.flex}>Location Details</Text><Button title="Close" icon={X} variant="ghost" size="sm" onPress={onClose} /></View>
    <ScrollView contentContainerStyle={styles.sheetContent}><Text variant="title">{endpoint.name}</Text><Text variant="code">{endpoint.code}</Text><Text variant="body">{endpoint.endpointType}</Text><Text variant="body">X {endpoint.x.toFixed(2)} m · Y {endpoint.y.toFixed(2)} m</Text><Text variant="caption">Configured By Admin</Text></ScrollView>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  root:{...StyleSheet.absoluteFill,backgroundColor:colors.background,overflow:'hidden'},
  heading:{position:'absolute',top:0,left:0,right:0,padding:16,gap:12}, headingRow:{flexDirection:'row',gap:12,alignItems:'center'}, titleGroup:{flex:1,minWidth:0,gap:3},
  tool:{width:44,height:44,borderRadius:radii.md,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,alignItems:'center',justifyContent:'center',...shadows.sm},
  telemetry:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',alignSelf:'flex-start',gap:7,minHeight:44,paddingHorizontal:12,paddingVertical:8,borderRadius:radii.pill,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},dot:{width:6,height:6,borderRadius:3},
  floor:{backgroundColor:colors.surface,borderRadius:8,...shadows.md},
  endpoint:{position:'absolute',width:44,height:44,alignItems:'center',justifyContent:'center'},pin:{width:26,height:26,borderRadius:9,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong,alignItems:'center',justifyContent:'center'},charger:{backgroundColor:colors.successBg,borderColor:colors.successBorder},
  areaLabel:{position:'absolute',width:88,alignItems:'center'},rackLabel:{position:'absolute',width:64,alignItems:'center'},robot:{position:'absolute',width:44,height:44,borderRadius:22,backgroundColor:colors.surface,borderWidth:2,borderColor:colors.borderStrong,alignItems:'center',justifyContent:'center',...shadows.sm},selectedRobot:{borderColor:colors.primary,backgroundColor:colors.primaryLight},lastKnown:{borderStyle:'dashed',borderColor:colors.textMuted,backgroundColor:colors.surfaceSubtle},
  legend:{position:'absolute',left:20,right:20,flexDirection:'row',alignItems:'center',gap:12,justifyContent:'space-between'},legendText:{flex:1,textAlign:'right'},scale:{gap:2},scaleLine:{width:30,height:5,borderWidth:1,borderTopWidth:0,borderColor:colors.textSecondary},
  imageError:{position:'absolute',left:20,right:20,padding:12,gap:8,borderRadius:radii.md,backgroundColor:colors.warningBg},
  flex:{flex:1,minWidth:0,gap:3},sheetTitle:{paddingHorizontal:20,paddingBottom:12,flexDirection:'row',alignItems:'center',gap:8},sheetContent:{padding:20,gap:16},segment:{flexDirection:'row',flexWrap:'wrap',gap:8},locationRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8},
});
