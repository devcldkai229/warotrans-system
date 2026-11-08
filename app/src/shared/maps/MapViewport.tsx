import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import {
  AlertTriangle,
  BatteryMedium,
  Bot,
  ChevronDown,
  ChevronLeft,
  Focus,
  Grid3X3,
  Layers,
  MapPin,
  Navigation,
  ParkingSquare,
  Scan,
  Tag,
  X,
  Zap,
} from 'lucide-react-native';
import type { EndpointDto, MapVersionDetailDto } from '../api/navigationApi';
import { getApiBaseUrl } from '../api/client';
import type { RobotResponse } from '../types/contracts';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';
import { shadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { Button, SegmentedControl, StatusPill, Text } from '../ui';
import { BottomSheet } from '../ui/BottomSheet';
import { triggerHaptic } from '../utils/haptics';
import { resolveMapPreviewUri, worldToMapPercent } from '../utils/mapCoordinates';
import { BaseMapLayer } from './layers/BaseMapLayer';
import { InfrastructureLayer } from './layers/InfrastructureLayer';
import { RobotLayer } from './layers/RobotLayer';
import { GridLabels } from './layers/GridLabels';
import { MapAnchor } from './MapAnchor';
import { MapControl, MapHud } from './MapHud';
import { findMapModel, spacedLocations } from './mapModel';
import { mapRobotState, mapUpdateLabel, sampleAgeLabel, type MapUpdateMode } from './mapTelemetry';
import { createMapFrame, metricScale, worldToBase, type MapFrame } from './mapTransform';
import { zoneColor, zoneLabel } from './mapPresentation';
import { useMapCamera } from './hooks/useMapCamera';
import { useMapEnvironment } from './hooks/useMapEnvironment';

interface Props {
  map:MapVersionDetailDto; robots:RobotResponse[]; selectedRobot:string; onSelectRobot:(code:string)=>void;
  contentInsets?:{top:number;bottom:number}; title?:string;
  updateMode?:MapUpdateMode;
  showHeader?:boolean;
  fullBleed?:boolean;
}
type LayerKey='stations'|'labels'|'zones'|'lanes'|'grid'|'scan';

interface LayerItemConfig {
  key: LayerKey;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  bg: string;
  tint: string;
}

const LAYER_ITEMS: LayerItemConfig[] = [
  {
    key: 'stations',
    label: 'Stations & Docks',
    desc: 'Pick, drop & charging points',
    icon: MapPin,
    bg: colors.primaryLight,
    tint: colors.primary,
  },
  {
    key: 'labels',
    label: 'Labels & Identifiers',
    desc: 'Station & rack code tags',
    icon: Tag,
    bg: colors.surfaceMuted,
    tint: colors.textSecondary,
  },
  {
    key: 'zones',
    label: 'Operational Zones',
    desc: 'Staging, buffer & storage areas',
    icon: Layers,
    bg: '#ede9fe',
    tint: '#7c3aed',
  },
  {
    key: 'lanes',
    label: 'Lane Directions',
    desc: 'Movement corridor paths',
    icon: Navigation,
    bg: '#e0f2fe',
    tint: '#0284c7',
  },
  {
    key: 'grid',
    label: '1m Metric Grid',
    desc: 'Floor measurement overlay',
    icon: Grid3X3,
    bg: colors.surfaceMuted,
    tint: colors.textSecondary,
  },
  {
    key: 'scan',
    label: 'SLAM Occupancy Scan',
    desc: 'Raw laser sensor footprint',
    icon: Scan,
    bg: '#fef3c7',
    tint: '#d97706',
  },
];

const PRESET_OPTIONS = [
  { label: 'Operations', value: 'operations' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'SLAM / Grid', value: 'technical' },
] as const;

function AppleSwitch({
  value,
  onToggle,
  accessibilityLabel,
}: {
  value: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.switchTrack,
        value ? styles.switchTrackActive : styles.switchTrackInactive,
      ]}
    >
      <View
        style={[
          styles.switchThumb,
          value ? styles.switchThumbActive : styles.switchThumbInactive,
        ]}
      />
    </Pressable>
  );
}

/** Shared presentation only: screens own API, auth, map identity and navigation. */
export function MapViewport({contentInsets={top:0,bottom:0},title='Warehouse Overview',showHeader=true,fullBleed=false,...props}:Props) {
  const [bounds,setBounds]=useState({width:0,height:0});
  const [headerHeight,setHeaderHeight]=useState(showHeader ? 68 : 0);
  const {map,robots,selectedRobot,updateMode='polling'}=props;
  const robot=robots.find(r=>r.currentMapVersionId===map.id&&r.code===selectedRobot);
  const effectiveHeaderHeight = showHeader ? headerHeight : 0;
  const topOffset = contentInsets.top + (showHeader ? effectiveHeaderHeight + 8 : 12);
  const available=Math.max(0,bounds.height-topOffset-contentInsets.bottom-36);
  const horizontal=!fullBleed && available<270;
  const frameInsets=useMemo(()=>fullBleed ? {
    top:contentInsets.top+20,
    right:76,
    bottom:contentInsets.bottom+20,
    left:20,
  } : undefined,[fullBleed,contentInsets.top,contentInsets.bottom]);
  const stageHeight=fullBleed ? (bounds.height || 680) : Math.max(0,available-(horizontal?56:0));
  const stageWidth=fullBleed ? (bounds.width || 390) : Math.max(0,bounds.width-(horizontal?24:80));
  const frame=useMemo(()=>createMapFrame(map,stageWidth,stageHeight,frameInsets),[map,stageWidth,stageHeight,frameInsets]);
  return <View style={styles.root} onLayout={event=>setBounds(event.nativeEvent.layout)}>
    {showHeader ? <View style={[styles.heading,{top:contentInsets.top}]} onLayout={event=>setHeaderHeight(event.nativeEvent.layout.height)}>
      <Text variant="headline">{title}</Text><Text variant="caption">{map.code} · V{map.versionNo}</Text>
      <Text variant="caption">{robot?`${robot.code} · ${robot.isOnline?'Online':'Offline'} · ${mapUpdateLabel(updateMode)}`:robots.some(r=>r.currentMapVersionId===map.id)?`${mapUpdateLabel(updateMode)} · Select A Robot`:'No Robot Linked To This Map'}</Text>
    </View> : null}
    {frame&&(fullBleed||stageHeight>=96)?<MapCanvas {...props} key={map.id} frame={frame} horizontal={horizontal} top={topOffset} fullBleed={fullBleed} bottomInset={contentInsets.bottom}/>
      :<View style={[styles.smallState,{top:topOffset,bottom:contentInsets.bottom}]}><Text variant="caption" textAlign="center">{frame?'Collapse the panel to explore the map.':'Map Calibration Unavailable'}</Text></View>}
  </View>;
}

function MapCanvas({map,robots,selectedRobot,onSelectRobot,frame,horizontal,top,updateMode='polling',fullBleed=false,bottomInset=0}:Omit<Props,'contentInsets'|'title'>&{frame:MapFrame;horizontal:boolean;top:number;bottomInset?:number}) {
  const {now,active,reducedMotion}=useMapEnvironment();
  const [following,setFollowing]=useState(false);
  const stopFollowing=useCallback(()=>setFollowing(false),[]);
  const identity=[map.id,map.resolution,map.originX,map.originY,map.originYaw,map.imageWidthPixels,map.imageHeightPixels].join(':');
  const camera=useMapCamera(frame,identity,reducedMotion,stopFollowing);
  const [layers,setLayers]=useState<Record<LayerKey,boolean>>({stations:true,labels:true,zones:true,lanes:true,grid:false,scan:false});
  const [sheet, setSheet] = useState<'layers' | 'endpoint' | 'robot' | null>(null);
  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [labelsDetailed, setLabelsDetailed] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  const [imageLoaded, setImageLoaded] = useState('');
  const [imageFailed, setImageFailed] = useState('');
  const model = useMemo(() => findMapModel(map), [map]);
  const uri = resolveMapPreviewUri(map.previewImageUri, getApiBaseUrl());
  const imageKey = `${map.id}:${uri}:${imageAttempt}`;
  const loaded = useCallback(() => setImageLoaded(imageKey), [imageKey]);
  const failed = useCallback(() => setImageFailed(imageKey), [imageKey]);
  const robot = robots.find(r => r.code === selectedRobot && r.currentMapVersionId === map.id);
  const state = robot ? mapRobotState(robot, map, now, updateMode) : null;
  const endpoint = map.endpoints.find(e => e.id === endpointId && e.isEnabled && e.mapVersionId === map.id);
  const scale = metricScale(map, frame, camera.settledZoom);
  const endpoints = useMemo(() => map.endpoints.filter(e => e.isEnabled && e.mapVersionId === map.id).flatMap(endpoint => {
    const percent = worldToMapPercent(endpoint.x, endpoint.y, map), p = worldToBase(endpoint, map, frame);
    return p && percent && percent.x >= 0 && percent.x <= 100 && percent.y >= 0 && percent.y <= 100 ? [{ ...p, endpoint }] : [];
  }), [map, frame]);
  const visibleEndpoints = useMemo(() => spacedLocations([
    ...endpoints.filter(p => p.endpoint.id === endpointId), ...endpoints.filter(p => p.endpoint.id !== endpointId),
  ], [], 48 / camera.settledZoom), [endpoints, endpointId, camera.settledZoom]);

  useEffect(() => { setLabelsDetailed(value => value ? camera.settledZoom >= 1.7 : camera.settledZoom >= 2); }, [camera.settledZoom]);
  useEffect(() => { setFollowing(false); }, [selectedRobot, identity]);
  useEffect(() => {
    if (!following) return;
    if (!active || !robot || !state?.canFollow) { setFollowing(false); return; }
    const p = worldToBase({ x: robot.poseX, y: robot.poseY }, map, frame);
    if (p) camera.center(p);
  }, [following, active, robot?.poseX, robot?.poseY, robot?.lastTelemetryAt, state?.canFollow, frame, camera.center, map]);

  const selectRobot = (code: string) => {
    triggerHaptic('tap');
    onSelectRobot(code);
    setSheet('robot');
  };
  const selectEndpoint = (item: EndpointDto) => {
    if (Date.now() - camera.lastGestureAt > 200) {
      triggerHaptic('tap');
      setEndpointId(item.id);
      setSheet('endpoint');
    }
  };
  const close = () => {
    triggerHaptic('tap');
    setSheet(null);
  };
  const backToLayers = () => {
    triggerHaptic('tap');
    setSheet('layers');
  };
  const raster = !model || layers.scan;

  const activeZones = useMemo(() => (map.zones || []).filter(z => z.mapVersionId === map.id && z.isActive), [map]);
  const mapRobots = useMemo(() => robots.filter(r => r.currentMapVersionId === map.id), [robots, map.id]);
  const enabledEndpoints = useMemo(() => map.endpoints.filter(e => e.isEnabled && e.mapVersionId === map.id), [map]);
  const [directoryExpanded, setDirectoryExpanded] = useState(false);

  const activePreset = useMemo(() => {
    if (layers.stations && layers.labels && layers.zones && layers.lanes && !layers.grid && !layers.scan) {
      return 'operations';
    }
    if (layers.stations && !layers.labels && !layers.zones && layers.lanes && !layers.grid && !layers.scan) {
      return 'minimal';
    }
    if (layers.stations && layers.labels && layers.zones && layers.lanes && layers.grid && layers.scan) {
      return 'technical';
    }
    return '';
  }, [layers]);

  const applyPreset = (preset: string) => {
    triggerHaptic('tap');
    if (preset === 'operations') {
      setLayers({ stations: true, labels: true, zones: true, lanes: true, grid: false, scan: false });
    } else if (preset === 'minimal') {
      setLayers({ stations: true, labels: false, zones: false, lanes: true, grid: false, scan: false });
    } else if (preset === 'technical') {
      setLayers({ stations: true, labels: true, zones: true, lanes: true, grid: true, scan: true });
    }
  };

  return <>
    <View style={fullBleed ? StyleSheet.absoluteFill : { position: 'absolute', left: 12, top: top + (horizontal ? 56 : 0), width: frame.width, height: frame.height, overflow: 'hidden', borderRadius: 12 }}>
      <GestureDetector gesture={camera.gesture} touchAction="none">
        <View style={StyleSheet.absoluteFill} accessibilityLabel="Interactive warehouse map">
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { transformOrigin: '0px 0px' }, camera.sceneStyle]}>
            <BaseMapLayer map={map} frame={frame} model={model} scan={layers.scan} grid={layers.grid} zoom={camera.settledZoom} uri={uri} imageAttempt={imageAttempt} onImageLoad={loaded} onImageError={failed} />
            <InfrastructureLayer map={map} frame={frame} zones={layers.zones} lanes={layers.lanes} zoom={camera.settledZoom} />
          </Animated.View>
          {layers.grid ? <GridLabels map={map} frame={frame} camera={camera} /> : null}
          {layers.stations ? visibleEndpoints.map(({ x, y, endpoint: item }) => {
            const Icon = item.endpointType === 'CHARGER' ? Zap : ['PARK', 'PARKING'].includes(item.endpointType) ? ParkingSquare : MapPin;
            return <MapAnchor key={item.id} point={{ x, y }} camera={camera}>
              <MapControl label={`${item.name}, ${item.code}, ${item.endpointType}`} onPress={() => selectEndpoint(item)} selected={endpointId === item.id} style={styles.station}>
                <View style={styles.stationGlyph}><Icon size={16} color={colors.primaryText} /></View>
              </MapControl>
            </MapAnchor>;
          }) : null}
          {layers.labels ? visibleEndpoints.filter(p => labelsDetailed || p.endpoint.id === endpointId).map(({ x, y, endpoint: item }) => <MapAnchor key={`label-${item.id}`} point={{ x, y }} camera={camera} width={110} height={24} passThrough>
            <Text variant="caption" fontWeight="600" numberOfLines={1} style={[styles.label, { marginTop: 36 }]}>{item.code}</Text>
          </MapAnchor>) : null}
          <RobotLayer map={map} frame={frame} robots={robots} camera={camera} selected={selectedRobot} now={now} updateMode={updateMode} onSelect={selectRobot} />
        </View>
      </GestureDetector>
      {raster && uri && imageLoaded !== imageKey && imageFailed !== imageKey ? <ActivityIndicator style={styles.loading} color={colors.primary} pointerEvents="none" /> : null}
      {raster && (!uri || imageFailed === imageKey) ? <View style={styles.imageError}><Text variant="caption" color="warningText">{uri ? 'Map Image Could Not Be Loaded' : 'No Preview Image · Geometry Only'}</Text>{uri ? <Button title="Retry Image" variant="outline" size="sm" onPress={() => setImageAttempt(v => v + 1)} /> : null}</View> : null}
    </View>
    <View style={fullBleed ? { position: 'absolute', right: 14, top: top, zIndex: 10 } : (horizontal ? { position: 'absolute', left: 12, top, right: 12 } : { position: 'absolute', right: 12, top })}>
      <MapHud horizontal={horizontal} zoom={camera.settledZoom} following={following} canFollow={!!state?.canFollow && active} onFit={camera.fit} onZoom={camera.zoomBy} onFollow={() => setFollowing(value => !value)} onLayers={() => setSheet('layers')} />
    </View>
    <View pointerEvents="none" style={fullBleed ? [styles.footer, { bottom: bottomInset + 8, zIndex: 5 }] : [styles.footer, { top: top + (horizontal ? 56 : 0) + frame.height + 6 }]}>
      <View style={{ gap: 3 }}><View style={{ width: scale.width, height: 5, borderWidth: 1, borderTopWidth: 0, borderColor: colors.textSecondary }} /><Text variant="caption">{scale.meters} m · {camera.settledZoom.toFixed(1)}×{layers.grid ? ' · World Grid (m)' : ''}</Text></View>
      <Text variant="caption" color={!layers.zones ? 'warningText' : 'textSecondary'} style={{ flex: 1, textAlign: 'right' }}>{!layers.zones ? 'Zones Hidden' : state ? `${following ? 'Following · ' : ''}${state.label} · ${sampleAgeLabel(state.ageSeconds)}` : mapUpdateLabel(updateMode)}</Text>
    </View>
    {sheet ? (
      <BottomSheet onClose={close} accessibilityLabel="map details" autoHeight={true}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          {sheet !== 'layers' ? (
            <Pressable
              onPress={backToLayers}
              accessibilityRole="button"
              accessibilityLabel="Back to layers"
              style={({ pressed }) => [styles.circleBtn, pressed && styles.btnPressed]}
            >
              <ChevronLeft size={18} color={colors.textPrimary} />
            </Pressable>
          ) : (
            <View style={styles.iconWell}>
              <Layers size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
          )}
          <View style={styles.sheetHeaderTitleGroup}>
            <Text variant="title" numberOfLines={1}>
              {sheet === 'layers'
                ? 'Map Layers & View'
                : sheet === 'endpoint'
                ? (endpoint?.name || 'Station Details')
                : (robot?.code || 'Robot Telemetry')}
            </Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {sheet === 'layers'
                ? `${map.code} · V${map.versionNo} · ${map.resolution} m/px`
                : sheet === 'endpoint'
                ? `${endpoint?.code} · ${endpoint?.endpointType}`
                : `${robot?.status ?? 'Offline'} · ${state?.label ?? 'Idle'}`}
            </Text>
          </View>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            style={({ pressed }) => [styles.circleBtn, pressed && styles.btnPressed]}
          >
            <X size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
          {sheet === 'layers' ? (
            <>
              {/* 1. Quick Presets */}
              <View style={styles.sectionBlock}>
                <Text variant="caption" color="textSecondary" style={styles.sectionHeaderTitle}>
                  VIEW PRESETS
                </Text>
                <SegmentedControl
                  options={PRESET_OPTIONS}
                  value={activePreset}
                  onChange={applyPreset}
                  size="sm"
                  accessibilityLabel="Map view presets"
                />
              </View>

              {/* 2. Apple Inset Grouped Layers */}
              <View style={styles.sectionBlock}>
                <Text variant="caption" color="textSecondary" style={styles.sectionHeaderTitle}>
                  DISPLAY LAYERS
                </Text>
                <View style={styles.groupedCard}>
                  {LAYER_ITEMS.map((item, idx) => {
                    const isLast = idx === LAYER_ITEMS.length - 1;
                    const isActive = layers[item.key];
                    const Icon = item.icon;
                    return (
                      <View key={item.key}>
                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            setLayers(prev => ({ ...prev, [item.key]: !prev[item.key] }));
                          }}
                          style={({ pressed }) => [styles.layerRow, pressed && styles.rowPressed]}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: isActive }}
                          accessibilityLabel={`Toggle ${item.label}`}
                        >
                          <View style={[styles.layerIconBox, { backgroundColor: item.bg }]}>
                            <Icon size={16} color={item.tint} />
                          </View>
                          <View style={styles.layerInfo}>
                            <Text variant="bodyMedium" fontWeight="600">{item.label}</Text>
                            <Text variant="caption" color="textSecondary">{item.desc}</Text>
                          </View>
                          <AppleSwitch
                            value={isActive}
                            onToggle={() => {
                              triggerHaptic('tap');
                              setLayers(prev => ({ ...prev, [item.key]: !prev[item.key] }));
                            }}
                            accessibilityLabel={`Toggle ${item.label}`}
                          />
                        </Pressable>
                        {!isLast && <View style={styles.insetDivider} />}
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* 3. Operational Zones Legend */}
              <View style={styles.sectionBlock}>
                <View style={styles.sectionRow}>
                  <Text variant="caption" color="textSecondary" style={styles.sectionHeaderTitle}>
                    OPERATIONAL ZONES
                  </Text>
                  {layers.zones ? (
                    <View style={styles.countBadge}>
                      <Text variant="caption" color="textSecondary">{activeZones.length}</Text>
                    </View>
                  ) : null}
                </View>
                {layers.zones ? (
                  activeZones.length === 0 ? (
                    <Text variant="caption" color="textMuted">No zones configured for this map.</Text>
                  ) : (
                    <View style={styles.zonesLegendCard}>
                      <View style={styles.zonesWrap}>
                        {activeZones.map(z => (
                          <View key={z.id} style={styles.zoneChip}>
                            <View style={[styles.zoneDot, { backgroundColor: zoneColor(z.zoneType) }]} />
                            <Text variant="caption" fontWeight="600" style={{ fontFamily: typography.fontMono }}>
                              {z.code}
                            </Text>
                            <Text variant="caption" color="textSecondary">
                              · {zoneLabel(z.zoneType)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )
                ) : (
                  <View style={styles.noticeBox}>
                    <AlertTriangle size={15} color={colors.warning} />
                    <Text variant="caption" color="warningText">Zones layer is currently hidden on the map.</Text>
                  </View>
                )}
              </View>

              {/* 4. Collapsible Map Directory (AMR & Stations) */}
              <View style={styles.sectionBlock}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setDirectoryExpanded(v => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle locations and fleet directory"
                  style={({ pressed }) => [styles.directoryToggle, pressed && styles.rowPressed]}
                >
                  <View style={styles.directoryToggleLeft}>
                    <View style={styles.directoryIconWell}>
                      <MapPin size={16} color={colors.primary} />
                    </View>
                    <View style={styles.directoryToggleText}>
                      <Text variant="bodyMedium" fontWeight="600">Locations & Fleet Directory</Text>
                      <Text variant="caption" color="textSecondary">
                        {mapRobots.length} AMR · {enabledEndpoints.length} Stations
                      </Text>
                    </View>
                  </View>
                  <ChevronDown
                    size={18}
                    color={colors.textSecondary}
                    style={{ transform: [{ rotate: directoryExpanded ? '180deg' : '0deg' }] }}
                  />
                </Pressable>

                {directoryExpanded ? (
                  <View style={styles.directoryContent}>
                    {/* AMR Fleet */}
                    <Text variant="caption" color="textSecondary" style={styles.subSectionTitle}>
                      ACTIVE AMRs ON MAP ({mapRobots.length})
                    </Text>
                    {mapRobots.length === 0 ? (
                      <View style={styles.emptyCard}>
                        <Text variant="caption" color="textMuted">No AMR currently operating on this map.</Text>
                      </View>
                    ) : (
                      <View style={styles.cardList}>
                        {mapRobots.map(r => {
                          const rState = mapRobotState(r, map, now, updateMode);
                          const isSelected = selectedRobot === r.code;
                          return (
                            <View key={r.id} style={[styles.robotCard, isSelected && styles.robotCardSelected]}>
                              <View style={styles.robotIconBox}>
                                <Bot size={18} color={r.isOnline ? colors.primaryText : colors.textMuted} />
                              </View>
                              <View style={styles.robotInfo}>
                                <View style={styles.robotHeaderRow}>
                                  <Text variant="bodyMedium" fontWeight="700" style={{ fontFamily: typography.fontMono }}>
                                    {r.code}
                                  </Text>
                                  <View style={[styles.statusDot, { backgroundColor: r.isOnline ? colors.success : colors.textMuted }]} />
                                  <Text variant="caption" color={r.isOnline ? 'successText' : 'textMuted'} fontWeight="600">
                                    {r.isOnline ? 'Online' : 'Offline'}
                                  </Text>
                                </View>
                                <View style={styles.robotSubRow}>
                                  <Text variant="caption" color="textSecondary">{rState.label}</Text>
                                  <Text variant="caption" color="textMuted">·</Text>
                                  <View style={styles.batteryInline}>
                                    <BatteryMedium size={12} color={r.batteryPercent > 20 ? colors.successText : colors.dangerText} />
                                    <Text variant="caption" color="textSecondary">{Math.round(r.batteryPercent)}%</Text>
                                  </View>
                                </View>
                              </View>
                              <Button
                                title={following && isSelected ? 'Following' : 'Track'}
                                variant={isSelected ? 'primary' : 'outline'}
                                size="sm"
                                icon={Navigation}
                                onPress={() => {
                                  triggerHaptic('tap');
                                  selectRobot(r.code);
                                  setFollowing(true);
                                  close();
                                }}
                              />
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Stations */}
                    <Text variant="caption" color="textSecondary" style={[styles.subSectionTitle, { marginTop: 12 }]}>
                      STATIONS & DOCKS ({enabledEndpoints.length})
                    </Text>
                    <View style={styles.groupedCard}>
                      {enabledEndpoints.map((e, idx) => {
                        const isLast = idx === enabledEndpoints.length - 1;
                        const isSelected = endpointId === e.id;
                        const Icon = e.endpointType === 'CHARGER' ? Zap : ['PARK', 'PARKING'].includes(e.endpointType) ? ParkingSquare : MapPin;
                        return (
                          <View key={e.id}>
                            <View style={[styles.stationItem, isSelected && styles.stationItemSelected]}>
                              <View style={styles.stationIconBox}>
                                <Icon size={16} color={colors.textPrimary} />
                              </View>
                              <Pressable
                                style={styles.stationInfo}
                                onPress={() => {
                                  triggerHaptic('tap');
                                  setEndpointId(e.id);
                                  setSheet('endpoint');
                                }}
                              >
                                <View style={styles.stationHeaderRow}>
                                  <Text variant="bodyMedium" fontWeight="700">{e.name || e.code}</Text>
                                  <View style={styles.typeTag}>
                                    <Text variant="caption" color="textSecondary">{e.endpointType}</Text>
                                  </View>
                                </View>
                                <Text variant="caption" color="textMuted" style={{ fontFamily: typography.fontMono }}>
                                  {e.code} · X {e.x.toFixed(2)}m · Y {e.y.toFixed(2)}m
                                </Text>
                              </Pressable>
                              <Button
                                title="Locate"
                                variant="ghost"
                                size="sm"
                                icon={Focus}
                                onPress={() => {
                                  triggerHaptic('tap');
                                  const p = worldToBase(e, map, frame);
                                  if (p) {
                                    stopFollowing();
                                    camera.center(p);
                                  }
                                  setEndpointId(e.id);
                                  close();
                                }}
                              />
                            </View>
                            {!isLast && <View style={styles.insetDivider} />}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>

              {/* 5. Done Button */}
              <Button
                title="Done"
                variant="secondary"
                size="md"
                fullWidth
                onPress={close}
                style={styles.doneBtn}
              />
            </>
          ) : sheet === 'endpoint' && endpoint ? (
            /* Station Detail View */
            <View style={styles.detailContainer}>
              <View style={styles.detailHeroCard}>
                <View style={styles.detailHeroIconBox}>
                  {endpoint.endpointType === 'CHARGER' ? (
                    <Zap size={22} color={colors.primary} />
                  ) : ['PARK', 'PARKING'].includes(endpoint.endpointType) ? (
                    <ParkingSquare size={22} color={colors.primary} />
                  ) : (
                    <MapPin size={22} color={colors.primary} />
                  )}
                </View>
                <View style={styles.detailHeroText}>
                  <Text variant="title">{endpoint.name}</Text>
                  <Text variant="caption" color="textSecondary" style={{ fontFamily: typography.fontMono }}>
                    {endpoint.code} · {endpoint.endpointType}
                  </Text>
                </View>
                <StatusPill status={endpoint.isEnabled ? 'ACTIVE' : 'OFFLINE'} label={endpoint.isEnabled ? 'Operational' : 'Disabled'} dot />
              </View>

              <View style={styles.specBox}>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Position X</Text>
                  <Text variant="bodyMedium" fontWeight="700" style={{ fontFamily: typography.fontMono }}>
                    {endpoint.x.toFixed(3)} m
                  </Text>
                </View>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Position Y</Text>
                  <Text variant="bodyMedium" fontWeight="700" style={{ fontFamily: typography.fontMono }}>
                    {endpoint.y.toFixed(3)} m
                  </Text>
                </View>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Orientation Yaw</Text>
                  <Text variant="bodyMedium" fontWeight="700" style={{ fontFamily: typography.fontMono }}>
                    {(endpoint.yaw * 180 / Math.PI).toFixed(1)}° ({endpoint.yaw.toFixed(3)} rad)
                  </Text>
                </View>
              </View>

              <View style={styles.detailActions}>
                <Button
                  title="Focus On Map"
                  variant="primary"
                  size="md"
                  icon={Focus}
                  fullWidth
                  onPress={() => {
                    triggerHaptic('success');
                    const p = worldToBase(endpoint, map, frame);
                    if (p) {
                      stopFollowing();
                      camera.center(p);
                    }
                    close();
                  }}
                />
                <Button
                  title="Back to Layers"
                  variant="ghost"
                  size="md"
                  icon={ChevronLeft}
                  fullWidth
                  onPress={backToLayers}
                />
              </View>
            </View>
          ) : sheet === 'robot' && robot && state ? (
            /* Robot Detail View */
            <View style={styles.detailContainer}>
              <View style={styles.detailHeroCard}>
                <View style={styles.detailHeroIconBox}>
                  <Bot size={22} color={robot.isOnline ? colors.primaryText : colors.textMuted} />
                </View>
                <View style={styles.detailHeroText}>
                  <Text variant="title" style={{ fontFamily: typography.fontMono }}>{robot.code}</Text>
                  <Text variant="caption" color="textSecondary">{state.label}</Text>
                </View>
                <StatusPill status={robot.isOnline ? 'ONLINE' : 'OFFLINE'} label={robot.isOnline ? 'Online' : 'Offline'} dot />
              </View>

              <View style={styles.specBox}>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Battery Level</Text>
                  <Text variant="bodyMedium" fontWeight="700">
                    {Math.round(robot.batteryPercent)}%
                  </Text>
                </View>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Navigation Status</Text>
                  <Text variant="bodyMedium" fontWeight="600">{robot.navigationStatus || 'IDLE'}</Text>
                </View>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Localization</Text>
                  <Text variant="bodyMedium" fontWeight="600">{robot.localizationStatus || 'UNKNOWN'}</Text>
                </View>
                <View style={styles.specRow}>
                  <Text variant="caption" color="textSecondary">Coordinates</Text>
                  <Text variant="bodyMedium" fontWeight="700" style={{ fontFamily: typography.fontMono }}>
                    X {robot.poseX.toFixed(2)}m · Y {robot.poseY.toFixed(2)}m
                  </Text>
                </View>
              </View>

              <View style={styles.detailActions}>
                <Button
                  title={following ? 'Currently Following' : 'Follow Live Robot'}
                  variant="primary"
                  size="md"
                  icon={Navigation}
                  fullWidth
                  disabled={!state.canFollow || !active}
                  onPress={() => {
                    triggerHaptic('success');
                    setFollowing(true);
                    close();
                  }}
                />
                <Button
                  title="Back to Layers"
                  variant="ghost"
                  size="md"
                  icon={ChevronLeft}
                  fullWidth
                  onPress={backToLayers}
                />
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text variant="bodyMedium" color="textMuted">The selected object is no longer available on this map.</Text>
              <Button
                title="Back to Layers"
                variant="outline"
                icon={ChevronLeft}
                onPress={backToLayers}
              />
            </View>
          )}
        </ScrollView>
      </BottomSheet>
    ) : null}
  </>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, overflow: 'hidden' },
  heading: { position: 'absolute', left: 16, right: 16, gap: 3, paddingTop: 8, paddingBottom: 6 },
  smallState: { position: 'absolute', left: 24, right: 24, justifyContent: 'center' },
  station: { backgroundColor: 'transparent', borderColor: 'transparent', borderRadius: 24 },
  stationGlyph: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.borderStrong },
  label: { backgroundColor: colors.surface, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, textAlign: 'center' },
  footer: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loading: { position: 'absolute', left: 12, top: 12 },
  imageError: { position: 'absolute', left: 8, right: 8, top: 8, gap: 8, padding: 10, backgroundColor: colors.warningBg, borderRadius: 8 },

  // Sheet Header
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderTitleGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.6,
  },

  // Sheet Content
  sheetScroll: {
    flexShrink: 1,
  },
  sheetContent: {
    padding: 20,
    gap: 16,
    paddingBottom: 28,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderTitle: {
    fontWeight: '700',
    letterSpacing: 0.6,
    fontSize: 11,
    color: colors.textSecondary,
  },
  subSectionTitle: {
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  countBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Grouped Card (Apple Inset Table)
  groupedCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  layerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  insetDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 58,
  },

  // Apple-style Tactile Switch
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: colors.primary,
  },
  switchTrackInactive: {
    backgroundColor: '#dcdfe4',
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 2.5,
    elevation: 2,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },

  // Operational Zones Legend
  zonesLegendCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  zonesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: colors.warningBg,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },

  // Directory Collapsible Accordion
  directoryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  directoryToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  directoryIconWell: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directoryToggleText: {
    gap: 1,
  },
  directoryContent: {
    marginTop: 8,
    gap: 8,
  },

  // Robot Card List
  cardList: {
    gap: 8,
  },
  robotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  robotCardSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  robotIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  robotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  robotSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batteryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },

  // Grouped Station List Items
  stationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    minHeight: 52,
  },
  stationItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  stationIconBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stationInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Empty Card
  emptyCard: {
    padding: 16,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Done Button
  doneBtn: {
    marginTop: 4,
  },

  // Detail Views
  detailContainer: {
    gap: 16,
  },
  detailHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailHeroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeroText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  specBox: {
    backgroundColor: colors.surfaceSubtle,
    padding: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailActions: {
    gap: 10,
    marginTop: 8,
  },
});
