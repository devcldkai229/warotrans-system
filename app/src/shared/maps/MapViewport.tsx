import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type PointerEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import {
  AlertTriangle,
  BatteryMedium,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  Focus,
  Grid3X3,
  Layers,
  MapPin,
  Navigation,
  Route,
  Scan,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react-native';
import type { EndpointDto, MapVersionDetailDto } from '../api/navigationApi';
import type { RobotResponse } from '../types/contracts';
import { useAuth } from '../../features/auth/authContext';
import { PERMISSIONS, sessionCan } from '../auth/permissions';
import { formatBattery } from '../formatBattery';
import { t } from '../i18n';
import { ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { ThemeShadows } from '../theme/shadows';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { typography } from '../theme/typography';
import { Button, SegmentedControl, StatusPill, Text } from '../ui';
import { BottomSheet } from '../ui/BottomSheet';
import { BatteryIndicator, OnlineBadge } from '../ui/RobotBadges';
import { triggerHaptic } from '../utils/haptics';
import { worldToMapPercent } from '../utils/mapCoordinates';
import { EndpointIcon, EndpointTile } from './EndpointGlyph';
import { useMapCamera } from './hooks/useMapCamera';
import { useMapEnvironment } from './hooks/useMapEnvironment';
import { useMapPreviewSource } from './hooks/useMapPreviewSource';
import { useMapTraffic } from './hooks/useMapTraffic';
import { BaseMapLayer } from './layers/BaseMapLayer';
import { GridLabels } from './layers/GridLabels';
import { InfrastructureLayer } from './layers/InfrastructureLayer';
import { RobotLayer } from './layers/RobotLayer';
import { StationArchitectureLayer } from './layers/StationArchitectureLayer';
import { MapAnchor } from './MapAnchor';
import {
  MapCameraCluster,
  MapControl,
  MapOrientationBox,
  MapToolCluster,
  MapTopStatusPill,
} from './MapHud';
import { MapLegendContent } from './MapLegendSheet';
import { robotFootprintPx } from './mapArchitecture';
import { hitTestInfrastructure, type MapInspectTarget } from './mapHitTest';
import {
  endpointJobRole,
  endpointPriority,
  selectKeyAreaWatermarks,
  selectVisibleEndpointLabels,
  zoneShortBadge,
  type MapJobContext,
} from './mapLabels';
import { findMapModel, mapHeading, spacedLocations } from './mapModel';
import { zoneColor, zoneLabel } from './mapPresentation';
import {
  JOB_HIGHLIGHT_COLOR,
  LANE_BLUE,
  ROBOT_COLOR,
  ZONE_DESCRIPTION,
} from './mapStyle';
import {
  mapRobotState,
  mapUpdateLabel,
  sampleAgeLabel,
  type MapUpdateMode,
} from './mapTelemetry';
import {
  baseToWorld,
  createMapFrame,
  screenToWorld,
  worldToBase,
  type MapFrame,
  type MapPoint,
} from './mapTransform';
import { robotStatusLabel } from './robotLabels';
import { RobotLocalizePanel } from './RobotLocalizePanel';

interface Props {
  map: MapVersionDetailDto;
  robots: RobotResponse[];
  selectedRobot: string;
  onSelectRobot: (code: string) => void;
  contentInsets?: { top: number; bottom: number };
  title?: string;
  updateMode?: MapUpdateMode;
  showHeader?: boolean;
  fullBleed?: boolean;
  jobContext?: MapJobContext;
  compact?: boolean;
  /** Given when the user may localize robots (robot.localize): adds "Localize Robot Here" to the robot panel. */
  onLocalizeRobot?: (robotId: string, endpointId: string) => Promise<void>;
  /** Pick mode: tapping a station hands it to the caller instead of opening its detail panel. */
  onPickEndpoint?: (endpoint: EndpointDto) => void;
  /** Given when the user may manually drive robots (robot.manual.drive). */
  onManualDrive?: (robotId: string) => void;
}

type LayerKey = 'stations' | 'labels' | 'zones' | 'lanes' | 'paths' | 'grid' | 'scan';

interface LayerItemConfig {
  key: LayerKey;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  bg: string;
  tint: string;
}

function getLayerItems(
  colors: ThemeColors,
  isDark: boolean,
  canReadTraffic: boolean,
): LayerItemConfig[] {
  const items: LayerItemConfig[] = [
    {
      key: 'stations',
      label: 'Stations & Docks',
      desc: 'Pick, drop & charging points',
      icon: MapPin,
      bg: colors.primaryLight,
      tint: colors.primaryText,
    },
    {
      key: 'labels',
      label: 'Labels & Identifiers',
      desc: 'Station & zone code tags',
      icon: Tag,
      bg: colors.surfaceMuted,
      tint: colors.textSecondary,
    },
    {
      key: 'zones',
      label: 'Operational Zones',
      desc: 'Speed, keep-out & single-AMR areas',
      icon: Layers,
      bg: isDark ? 'rgba(139, 92, 246, 0.22)' : '#ede9fe',
      tint: isDark ? '#c4b5fd' : '#7c3aed',
    },
    {
      key: 'lanes',
      label: 'Lane Directions',
      desc: 'Movement corridor paths',
      icon: Navigation,
      bg: colors.infoBg,
      tint: colors.infoText,
    },
  ];

  if (canReadTraffic) {
    items.push({
      key: 'paths',
      label: 'Live Nav2 Paths',
      desc: 'Real-time robot traffic routes',
      icon: Route,
      bg: isDark ? 'rgba(0, 210, 255, 0.16)' : '#e0f2fe',
      tint: isDark ? '#00d2ff' : '#0284c7',
    });
  }

  items.push(
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
      bg: colors.warningBg,
      tint: colors.warningText,
    },
  );

  return items;
}

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
  const styles = useThemedStyles(createStyles);
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

function SheetContainer({
  inline,
  onClose,
  accessibilityLabel,
  children,
}: {
  inline: boolean;
  onClose: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  if (!inline) {
    return (
      <BottomSheet onClose={onClose} accessibilityLabel={accessibilityLabel} autoHeight={true}>
        {children}
      </BottomSheet>
    );
  }
  return (
    <View style={styles.inlineSheetBackdrop}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss ${accessibilityLabel}`}
      />
      <View style={styles.inlineSheetCard} accessibilityViewIsModal>
        {children}
      </View>
    </View>
  );
}

/** Shared presentation only: screens own API, auth, map identity and navigation. */
export function MapViewport({
  contentInsets = { top: 0, bottom: 0 },
  title = 'Warehouse Overview',
  showHeader = true,
  fullBleed = false,
  compact = false,
  ...props
}: Props) {
  const styles = useThemedStyles(createStyles);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [headerHeight, setHeaderHeight] = useState(showHeader ? 68 : 0);
  const { map, robots, selectedRobot, updateMode = 'polling' } = props;
  const onlineRobots = useMemo(() => robots.filter(r => r.isOnline), [robots]);
  const robot = onlineRobots.find(r => r.currentMapVersionId === map.id && r.code === selectedRobot);
  const effectiveHeaderHeight = showHeader ? headerHeight : 0;
  const topOffset = contentInsets.top + (showHeader ? effectiveHeaderHeight + 8 : 12);
  const available = Math.max(0, bounds.height - topOffset - contentInsets.bottom - 36);
  const horizontal = !fullBleed && available < 270;
  const frameInsets = useMemo(
    () =>
      fullBleed
        ? compact
          ? {
              top: contentInsets.top + 46,
              right: 32,
              bottom: contentInsets.bottom + 40,
              left: 32,
            }
          : {
              top: contentInsets.top + 56,
              right: 34,
              bottom: contentInsets.bottom + 52,
              left: 34,
            }
        : undefined,
    [fullBleed, compact, contentInsets.top, contentInsets.bottom],
  );
  const stageHeight = fullBleed ? (bounds.height || 680) : Math.max(0, available - (horizontal ? 56 : 0));
  const stageWidth = fullBleed ? (bounds.width || 390) : Math.max(0, bounds.width - (horizontal ? 24 : 80));
  const frame = useMemo(
    () => createMapFrame(map, stageWidth, stageHeight, frameInsets),
    [map, stageWidth, stageHeight, frameInsets],
  );

  return (
    <View style={styles.root} onLayout={event => setBounds(event.nativeEvent.layout)}>
      {showHeader ? (
        <View
          style={[styles.heading, { top: contentInsets.top }]}
          onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          <Text variant="headline">{title}</Text>
          <Text variant="caption">
            {map.code} · V{map.versionNo}
          </Text>
          <Text variant="caption">
            {robot
              ? `${robot.code} · ${robot.isOnline ? 'Online' : 'Offline'} · ${mapUpdateLabel(updateMode)}`
              : onlineRobots.some(r => r.currentMapVersionId === map.id)
              ? `${mapUpdateLabel(updateMode)} · Select A Robot`
              : 'No Robot Linked To This Map'}
          </Text>
        </View>
      ) : null}
      {frame && (fullBleed || stageHeight >= 96) ? (
        <MapCanvas
          {...props}
          robots={onlineRobots}
          key={map.id}
          frame={frame}
          horizontal={horizontal}
          top={topOffset}
          fullBleed={fullBleed}
          compact={compact}
          topInset={contentInsets.top}
          bottomInset={contentInsets.bottom}
        />
      ) : (
        <View style={[styles.smallState, { top: topOffset, bottom: contentInsets.bottom }]}>
          <Text variant="caption" textAlign="center">
            {frame ? 'Collapse the panel to explore the map.' : 'Map Calibration Unavailable'}
          </Text>
        </View>
      )}
    </View>
  );
}

function MapCanvas({
  map,
  robots,
  selectedRobot,
  onSelectRobot,
  frame,
  horizontal,
  top,
  updateMode = 'polling',
  fullBleed = false,
  compact = false,
  topInset = 0,
  bottomInset = 0,
  jobContext,
  onLocalizeRobot,
  onPickEndpoint,
  onManualDrive,
}: Omit<Props, 'contentInsets' | 'title'> & {
  frame: MapFrame;
  horizontal: boolean;
  top: number;
  topInset?: number;
  bottomInset?: number;
}) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { session } = useAuth();
  const canReadTraffic = !onPickEndpoint && sessionCan(session, PERMISSIONS.trafficRead);
  const layerItems = useMemo(
    () => getLayerItems(colors, isDark, canReadTraffic),
    [colors, isDark, canReadTraffic],
  );
  const { now, active, reducedMotion } = useMapEnvironment();
  const [following, setFollowing] = useState(false);
  const stopFollowing = useCallback(() => setFollowing(false), []);
  const identity = [
    map.id,
    map.resolution,
    map.originX,
    map.originY,
    map.originYaw,
    map.imageWidthPixels,
    map.imageHeightPixels,
  ].join(':');

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    stations: true,
    labels: true,
    zones: true,
    lanes: true,
    paths: true,
    grid: false,
    scan: false,
  });
  const [sheet, setSheet] = useState<'layers' | 'legend' | 'endpoint' | 'robot' | null>(null);
  const [endpointId, setEndpointId] = useState<string | null>(null);
  const [labelsDetailed, setLabelsDetailed] = useState(false);
  const [inspected, setInspected] = useState<MapInspectTarget | null>(null);
  const [cursorWorld, setCursorWorld] = useState<MapPoint | null>(null);
  const [tappedWorld, setTappedWorld] = useState<MapPoint | null>(null);
  const lastCursorKeyRef = useRef('');

  const lastEntityPressRef = useRef(0);
  const tapContextRef = useRef({
    map,
    frame,
    zoom: 1,
    zones: layers.zones,
    lanes: layers.lanes,
    sheet,
    lastGestureAt: 0,
  });

  const handleSingleTap = useCallback((_screenPoint: MapPoint, basePoint: MapPoint) => {
    const ctx = tapContextRef.current;
    if (ctx.sheet !== null) return;
    if (Date.now() - lastEntityPressRef.current < 240) return;
    if (Date.now() - ctx.lastGestureAt < 220) return;

    const worldPt = baseToWorld(basePoint, ctx.map, ctx.frame);
    if (worldPt) {
      setTappedWorld(worldPt);
    }

    const hit = hitTestInfrastructure(basePoint, ctx.map, ctx.frame, ctx.zoom, {
      zones: ctx.zones,
      lanes: ctx.lanes,
    });
    if (hit) {
      triggerHaptic('tap');
      setInspected(hit);
    } else {
      setInspected(null);
    }
  }, []);

  const camera = useMapCamera(frame, identity, reducedMotion, stopFollowing, handleSingleTap);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const ev = event as unknown as {
        currentTarget?: { getBoundingClientRect?: () => { left: number; top: number } };
        nativeEvent?: { locationX?: number; locationY?: number; clientX?: number; clientY?: number };
        clientX?: number;
        clientY?: number;
      };
      let sx = ev.nativeEvent?.locationX;
      let sy = ev.nativeEvent?.locationY;
      const clientX = ev.clientX ?? ev.nativeEvent?.clientX;
      const clientY = ev.clientY ?? ev.nativeEvent?.clientY;
      if (
        typeof clientX === 'number' &&
        typeof clientY === 'number' &&
        typeof ev.currentTarget?.getBoundingClientRect === 'function'
      ) {
        const rect = ev.currentTarget.getBoundingClientRect();
        sx = clientX - rect.left;
        sy = clientY - rect.top;
      }
      if (typeof sx !== 'number' || typeof sy !== 'number') return;

      const world = screenToWorld(
        { x: sx, y: sy },
        map,
        frame,
        { zoom: camera.zoom.get(), x: camera.x.get(), y: camera.y.get() },
      );
      if (!world) {
        if (lastCursorKeyRef.current !== '') {
          lastCursorKeyRef.current = '';
          setCursorWorld(null);
        }
        return;
      }
      const key = `${world.x.toFixed(2)},${world.y.toFixed(2)}`;
      if (key !== lastCursorKeyRef.current) {
        lastCursorKeyRef.current = key;
        setCursorWorld(world);
      }
    },
    [camera.zoom, camera.x, camera.y, map, frame],
  );

  const handlePointerLeave = useCallback(() => {
    if (lastCursorKeyRef.current !== '') {
      lastCursorKeyRef.current = '';
      setCursorWorld(null);
    }
  }, []);

  useEffect(() => {
    tapContextRef.current = {
      map,
      frame,
      zoom: camera.settledZoom,
      zones: layers.zones,
      lanes: layers.lanes,
      sheet,
      lastGestureAt: camera.lastGestureAt,
    };
  }, [map, frame, camera.settledZoom, camera.lastGestureAt, layers.zones, layers.lanes, sheet]);

  useEffect(() => {
    setInspected(null);
    setCursorWorld(null);
    setTappedWorld(null);
    lastCursorKeyRef.current = '';
  }, [identity]);

  useEffect(() => {
    setInspected(prev => {
      if (!prev) return null;
      if (prev.kind === 'zone' && !layers.zones) return null;
      if (prev.kind === 'lane' && !layers.lanes) return null;
      return prev;
    });
  }, [layers.zones, layers.lanes]);

  const { plannedPaths } = useMapTraffic({
    enabled: canReadTraffic && layers.paths && active,
    robots,
    mapId: map.id,
  });

  const model = useMemo(() => findMapModel(map), [map]);
  const raster = !model || layers.scan;
  const preview = useMapPreviewSource(map.id, map.previewImageUri, raster);
  const robot = robots.find(r => r.code === selectedRobot && r.currentMapVersionId === map.id);
  const state = robot ? mapRobotState(robot, map, now, updateMode) : null;
  const endpoint = map.endpoints.find(
    e => e.id === endpointId && e.isEnabled && e.mapVersionId === map.id,
  );
  const mapCenterWorld = useMemo(
    () => baseToWorld({ x: frame.left + frame.mapWidth / 2, y: frame.top + frame.mapHeight / 2 }, map, frame),
    [map, frame],
  );
  const readoutCoord: MapPoint | null =
    cursorWorld ??
    tappedWorld ??
    (endpoint ? { x: endpoint.x, y: endpoint.y } : null) ??
    (robot && state?.showPose ? { x: robot.poseX, y: robot.poseY } : null) ??
    mapCenterWorld;

  const endpoints = useMemo(
    () =>
      map.endpoints
        .filter(e => e.isEnabled && e.mapVersionId === map.id)
        .flatMap(ep => {
          const percent = worldToMapPercent(ep.x, ep.y, map);
          const p = worldToBase(ep, map, frame);
          return p && percent && percent.x >= 0 && percent.x <= 100 && percent.y >= 0 && percent.y <= 100
            ? [{ ...p, endpoint: ep }]
            : [];
        }),
    [map, frame],
  );

  const visibleEndpoints = useMemo(() => {
    const ordered = [...endpoints].sort(
      (a, b) =>
        endpointPriority(a.endpoint, endpointId, jobContext)
        - endpointPriority(b.endpoint, endpointId, jobContext),
    );
    return spacedLocations(ordered, [], 26 / camera.settledZoom);
  }, [endpoints, endpointId, jobContext, camera.settledZoom]);

  const robotPoints = useMemo(
    () =>
      robots
        .filter(r => r.currentMapVersionId === map.id && r.isOnline)
        .flatMap(r => {
          const p = worldToBase({ x: r.poseX, y: r.poseY }, map, frame);
          return p ? [p] : [];
        }),
    [robots, map, frame],
  );

  const labelObstacles = useMemo(() => {
    const footprint = robotFootprintPx(map, frame);
    const tagOffsetY = footprint.length * 0.56 + 14 / Math.max(1, camera.settledZoom);
    return [
      ...robotPoints.flatMap(p => [p, { x: p.x, y: p.y + tagOffsetY }]),
      ...visibleEndpoints.map(e => ({ x: e.x, y: e.y })),
    ];
  }, [map, frame, robotPoints, visibleEndpoints, camera.settledZoom]);

  const visibleEndpointLabels = useMemo(
    () =>
      layers.labels && layers.stations
        ? selectVisibleEndpointLabels(
            visibleEndpoints,
            camera.settledZoom,
            endpointId,
            jobContext,
            labelsDetailed,
            labelObstacles,
            labelsDetailed || Boolean(onPickEndpoint) ? 3 : 1,
          )
        : [],
    [
      layers.labels,
      layers.stations,
      visibleEndpoints,
      camera.settledZoom,
      endpointId,
      jobContext,
      labelsDetailed,
      labelObstacles,
      onPickEndpoint,
    ],
  );

  const areaWatermarks = useMemo(
    () =>
      layers.labels && layers.stations && !labelsDetailed && !onPickEndpoint
        ? selectKeyAreaWatermarks(
            visibleEndpoints,
            labelObstacles,
            new Set(visibleEndpointLabels.map(l => l.endpoint.id)),
          )
        : [],
    [
      layers.labels,
      layers.stations,
      labelsDetailed,
      onPickEndpoint,
      visibleEndpoints,
      labelObstacles,
      visibleEndpointLabels,
    ],
  );

  const floorAreaLabels = useMemo(() => {
    if (!model || layers.scan || !layers.labels || !labelsDetailed) return [];
    return (model.floorPaint || [])
      .filter(area => area.name === 'inbound' || area.name === 'outbound')
      .flatMap(area => {
        const p = worldToBase(
          { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 },
          map,
          frame,
        );
        return p
          ? [
              {
                key: area.name,
                label: area.name === 'inbound' ? 'Inbound' : 'Outbound',
                point: p,
              },
            ]
          : [];
      });
  }, [model, layers.scan, layers.labels, labelsDetailed, map, frame]);

  const shelfLabels = useMemo(() => {
    if (!model || layers.scan || !layers.labels || (!labelsDetailed && camera.settledZoom < 1.4)) {
      return [];
    }
    return (model.shelves || []).flatMap(rack => {
      const p = worldToBase({ x: rack.x, y: rack.y }, map, frame);
      return p ? [{ code: rack.code, point: p }] : [];
    });
  }, [model, layers.scan, layers.labels, labelsDetailed, camera.settledZoom, map, frame]);

  useEffect(() => {
    setLabelsDetailed(value =>
      value ? camera.settledZoom >= 2.0 : camera.settledZoom >= 2.2,
    );
  }, [camera.settledZoom]);

  useEffect(() => {
    setFollowing(false);
  }, [selectedRobot, identity]);

  useEffect(() => {
    if (!following) return;
    if (!active || !robot || !state?.canFollow) {
      setFollowing(false);
      return;
    }
    const p = worldToBase({ x: robot.poseX, y: robot.poseY }, map, frame);
    if (p) camera.center(p);
  }, [
    following,
    active,
    robot?.poseX,
    robot?.poseY,
    robot?.lastTelemetryAt,
    state?.canFollow,
    frame,
    camera.center,
    map,
  ]);

  const selectRobot = (code: string) => {
    lastEntityPressRef.current = Date.now();
    setInspected(null);
    triggerHaptic('tap');
    onSelectRobot(code);
    setSheet('robot');
  };

  const selectEndpoint = (item: EndpointDto) => {
    lastEntityPressRef.current = Date.now();
    if (Date.now() - camera.lastGestureAt > 200) {
      setInspected(null);
      triggerHaptic('tap');
      if (onPickEndpoint) {
        onPickEndpoint(item);
        return;
      }
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

  const activeZones = useMemo(
    () => (map.zones || []).filter(z => z.mapVersionId === map.id && z.isActive),
    [map],
  );
  const mapRobots = useMemo(
    () => robots.filter(r => r.currentMapVersionId === map.id),
    [robots, map.id],
  );
  const enabledEndpoints = useMemo(
    () => map.endpoints.filter(e => e.isEnabled && e.mapVersionId === map.id),
    [map],
  );
  const [directoryExpanded, setDirectoryExpanded] = useState(false);

  const activePreset = useMemo(() => {
    if (
      layers.stations &&
      layers.labels &&
      layers.zones &&
      layers.lanes &&
      layers.paths &&
      !layers.grid &&
      !layers.scan
    ) {
      return 'operations';
    }
    if (
      layers.stations &&
      !layers.labels &&
      !layers.zones &&
      layers.lanes &&
      layers.paths &&
      !layers.grid &&
      !layers.scan
    ) {
      return 'minimal';
    }
    if (
      layers.stations &&
      layers.labels &&
      layers.zones &&
      layers.lanes &&
      layers.paths &&
      layers.grid &&
      layers.scan
    ) {
      return 'technical';
    }
    return '';
  }, [layers]);

  const applyPreset = (preset: string) => {
    triggerHaptic('tap');
    if (preset === 'operations') {
      setLayers({
        stations: true,
        labels: true,
        zones: true,
        lanes: true,
        paths: true,
        grid: false,
        scan: false,
      });
    } else if (preset === 'minimal') {
      setLayers({
        stations: true,
        labels: false,
        zones: false,
        lanes: true,
        paths: true,
        grid: false,
        scan: false,
      });
    } else if (preset === 'technical') {
      setLayers({
        stations: true,
        labels: true,
        zones: true,
        lanes: true,
        paths: true,
        grid: true,
        scan: true,
      });
    }
  };

  const compactHud = horizontal || (fullBleed && frame.height - topInset - bottomInset < 230);
  const hudTop = fullBleed ? topInset + 10 : top;
  const scaleBottom = fullBleed ? bottomInset + 10 : undefined;
  const scaleTop = fullBleed ? undefined : top + (horizontal ? 56 : 0) + frame.height + 6;
  const inspectBottom = fullBleed ? bottomInset + 10 : 12;

  return (
    <>
      <View
        style={
          fullBleed
            ? [StyleSheet.absoluteFill, { backgroundColor: colors.mapVoid }]
            : {
                position: 'absolute',
                left: 12,
                top: top + (horizontal ? 56 : 0),
                width: frame.width,
                height: frame.height,
                overflow: 'hidden',
                borderRadius: 12,
                backgroundColor: colors.mapVoid,
              }
        }
      >
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern
              id={`void-dots-${map.id}`}
              width="22"
              height="22"
              patternUnits="userSpaceOnUse"
            >
              <Circle
                cx="1"
                cy="1"
                r="0.8"
                fill={colors.borderStrong}
                opacity={isDark ? 0.14 : 0.35}
              />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill={colors.mapVoid} />
          <Rect width="100%" height="100%" fill={`url(#void-dots-${map.id})`} />
        </Svg>

        <GestureDetector gesture={camera.gesture} touchAction="none">
          <View
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Interactive warehouse map"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          >
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { transformOrigin: '0px 0px' }, camera.sceneStyle]}
            >
              <BaseMapLayer
                map={map}
                frame={frame}
                model={model}
                scan={layers.scan}
                grid={layers.grid}
                zoom={camera.settledZoom}
                uri={preview.uri}
                imageAttempt={preview.imageAttempt}
                onImageLoad={preview.onImageLoad}
                onImageError={preview.onImageError}
              />
              <InfrastructureLayer
                map={map}
                frame={frame}
                zones={layers.zones}
                lanes={layers.lanes}
                zoom={camera.settledZoom}
                isDark={isDark}
                selectedZoneId={inspected?.kind === 'zone' ? inspected.zone.id : null}
                selectedEdgeId={inspected?.kind === 'lane' ? inspected.edge.id : null}
                plannedPaths={plannedPaths}
                showPaths={canReadTraffic && layers.paths}
              />
              {layers.stations ? (
                <StationArchitectureLayer
                  map={map}
                  frame={frame}
                  endpoints={endpoints}
                  zoom={camera.settledZoom}
                  isDark={isDark}
                  showWallShelves={!model || layers.scan}
                />
              ) : null}
            </Animated.View>

            {layers.grid ? <GridLabels map={map} frame={frame} camera={camera} /> : null}

            {floorAreaLabels.map(area => (
              <MapAnchor
                key={`area-${area.key}`}
                point={area.point}
                camera={camera}
                width={96}
                height={24}
                passThrough
              >
                <View style={styles.floorAreaPill}>
                  <Text variant="caption" fontWeight="700" color="textSecondary" numberOfLines={1}>
                    {area.label}
                  </Text>
                </View>
              </MapAnchor>
            ))}

            {shelfLabels.map(rack => (
              <MapAnchor
                key={`rack-${rack.code}`}
                point={rack.point}
                camera={camera}
                width={76}
                height={20}
                passThrough
              >
                <View style={styles.shelfPill}>
                  <Text
                    variant="caption"
                    fontWeight="700"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={styles.shelfText}
                  >
                    {rack.code}
                  </Text>
                </View>
              </MapAnchor>
            ))}

            {layers.stations
              ? visibleEndpoints.map(({ x, y, endpoint: item }) => (
                  <MapAnchor key={item.id} point={{ x, y }} camera={camera} width={44} height={44}>
                    <MapControl
                      label={`${item.name}, ${item.code}, ${item.endpointType}`}
                      onPress={() => selectEndpoint(item)}
                      selected={endpointId === item.id}
                      width={44}
                      height={44}
                      style={styles.station}
                    >
                      <EndpointTile
                        type={item.endpointType}
                        code={item.code}
                        name={item.name}
                        headingDeg={mapHeading(item.yaw, map.originYaw, frame.rotated) - 90}
                        selected={endpointId === item.id}
                        isDark={isDark}
                        surface={colors.surface}
                        jobRole={endpointJobRole(item, jobContext)}
                      />
                    </MapControl>
                  </MapAnchor>
                ))
              : null}

            {visibleEndpointLabels.map(({ x, y, endpoint: item, displayText, role, placement }) => {
              const roleAccent = role ? JOB_HIGHLIGHT_COLOR[role] : null;
              return (
                <MapAnchor
                  key={`label-${item.id}`}
                  point={{ x, y }}
                  camera={camera}
                  width={126}
                  height={66}
                  passThrough
                >
                  <View
                    style={
                      placement === 'above' ? styles.stationLabelAbove : styles.stationLabelBelow
                    }
                  >
                    {role ? (
                      <View style={[styles.jobRolePill, { backgroundColor: roleAccent! }]}>
                        <Text
                          variant="caption"
                          fontWeight="700"
                          maxFontSizeMultiplier={1.15}
                          style={styles.jobRoleText}
                        >
                          {role === 'pickup' ? 'Pickup' : 'Destination'}
                        </Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.stationLabelPill,
                        roleAccent ? { borderColor: roleAccent } : null,
                      ]}
                    >
                      <Text
                        variant="caption"
                        fontWeight="600"
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.2}
                        style={styles.stationLabelText}
                      >
                        {displayText}
                      </Text>
                    </View>
                  </View>
                </MapAnchor>
              );
            })}

            {areaWatermarks.map(area => (
              <MapAnchor
                key={`watermark-${area.id}`}
                point={{ x: area.x, y: area.y }}
                camera={camera}
                width={108}
                height={62}
                passThrough
              >
                <View
                  style={
                    area.placement === 'above'
                      ? styles.areaWatermarkAbove
                      : styles.areaWatermarkBelow
                  }
                >
                  <Text
                    variant="caption"
                    fontWeight="600"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.15}
                    style={styles.areaWatermarkText}
                  >
                    {area.label}
                  </Text>
                </View>
              </MapAnchor>
            ))}

            {!onPickEndpoint ? (
              <RobotLayer
                map={map}
                frame={frame}
                robots={robots}
                camera={camera}
                selected={selectedRobot}
                now={now}
                updateMode={updateMode}
                onSelect={selectRobot}
              />
            ) : null}
          </View>
        </GestureDetector>

        {preview.isLoading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} pointerEvents="none" />
        ) : null}
        {preview.hasError ? (
          <View style={styles.imageError}>
            <Text variant="caption" color="warningText">
              {preview.hasPreviewAsset
                ? 'Map Image Could Not Be Loaded'
                : 'No Preview Image · Geometry Only'}
            </Text>
            {preview.hasPreviewAsset ? (
              <Button title="Retry Image" variant="outline" size="sm" onPress={preview.retry} />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Top-Left: Live / Map Version Status Pill */}
      <View style={[styles.topLeftHud, { top: hudTop }]} pointerEvents="box-none">
        <MapTopStatusPill
          mapCode={map.code}
          versionNo={map.versionNo}
          updateMode={updateMode}
          zonesVisible={layers.zones}
          onPressZonesHidden={() => setSheet('layers')}
        />
      </View>

      {/* Top-Right: Tool Cluster (Layers, Map Legend, Follow) */}
      <View
        style={
          compactHud
            ? { position: 'absolute', right: 12, top: hudTop, zIndex: 12 }
            : { position: 'absolute', right: 12, top: hudTop, zIndex: 12 }
        }
        pointerEvents="box-none"
      >
        <MapToolCluster
          horizontal={compactHud}
          legendOpen={sheet === 'legend'}
          showFollow={!onPickEndpoint && !compact}
          following={following}
          canFollow={!!state?.canFollow && active}
          onLayers={() => {
            triggerHaptic('tap');
            setInspected(null);
            setSheet('layers');
          }}
          onLegend={() => {
            triggerHaptic('tap');
            setInspected(null);
            setSheet(prev => (prev === 'legend' ? null : 'legend'));
          }}
          onFollow={() => {
            triggerHaptic('tap');
            setFollowing(value => !value);
          }}
        />
      </View>

      {/* Bottom-Right: Camera Cluster (+, -, Fit) */}
      <View
        style={{
          position: 'absolute',
          right: 12,
          bottom: fullBleed ? bottomInset + 10 : 12,
          zIndex: 12,
        }}
        pointerEvents="box-none"
      >
        <MapCameraCluster
          horizontal={compactHud}
          zoom={camera.settledZoom}
          onFit={() => {
            triggerHaptic('tap');
            camera.fit();
          }}
          onZoom={factor => {
            triggerHaptic('tap');
            camera.zoomBy(factor);
          }}
        />
      </View>

      {/* Quick-Inspect Banner for Zones & Lanes */}
      {inspected && !sheet ? (
        <View
          style={[
            styles.inspectCard,
            {
              bottom: inspectBottom,
              right: compact ? 66 : 74,
            },
          ]}
        >
          {inspected.kind === 'zone' ? (
            <>
              <View
                style={[
                  styles.inspectAccent,
                  { backgroundColor: zoneColor(inspected.zone.zoneType) },
                ]}
              />
              <View style={styles.inspectBody}>
                <View style={styles.inspectHeader}>
                  <Text variant="bodyMedium" fontWeight="700" numberOfLines={1} style={styles.inspectTitle}>
                    {inspected.zone.name || inspected.zone.code}
                  </Text>
                  <View
                    style={[
                      styles.inspectBadge,
                      { backgroundColor: `${zoneColor(inspected.zone.zoneType)}22` },
                    ]}
                  >
                    <Text
                      variant="caption"
                      fontWeight="700"
                      style={{ color: zoneColor(inspected.zone.zoneType), fontSize: 11 }}
                    >
                      {zoneLabel(inspected.zone.zoneType)}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" color="textSecondary" numberOfLines={2}>
                  {ZONE_DESCRIPTION[inspected.zone.zoneType] ?? zoneShortBadge(inspected.zone)}
                  {inspected.zone.maxSpeed != null ? ` · Max ${inspected.zone.maxSpeed} m/s` : ''}
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.inspectAccent, { backgroundColor: LANE_BLUE }]} />
              <View style={styles.inspectBody}>
                <View style={styles.inspectHeader}>
                  <Text variant="bodyMedium" fontWeight="700" numberOfLines={1} style={styles.inspectTitle}>
                    {inspected.edge.name || inspected.edge.code}
                  </Text>
                  <View style={[styles.inspectBadge, { backgroundColor: colors.infoBg }]}>
                    <Text variant="caption" fontWeight="700" color="infoText" style={{ fontSize: 11 }}>
                      {inspected.edge.direction === 'ONE_WAY' ? 'One-way lane' : 'Two-way lane'}
                    </Text>
                  </View>
                </View>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  Width {(inspected.edge.widthMeters || 1).toFixed(1)} m
                  {inspected.edge.maxSpeed != null ? ` · Max ${inspected.edge.maxSpeed} m/s` : ''}
                </Text>
              </View>
            </>
          )}
          <Pressable
            onPress={() => setInspected(null)}
            accessibilityRole="button"
            accessibilityLabel="Close inspection"
            hitSlop={10}
            style={({ pressed }) => [styles.inspectClose, pressed && styles.btnPressed]}
          >
            <X size={15} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Bottom-Left: OTTO Orientation Crosshair & Metric Coordinate Readout */}
      {!(inspected && !sheet) ? (
        <View
          pointerEvents="none"
          style={[
            styles.footer,
            scaleBottom !== undefined ? { bottom: scaleBottom } : { top: scaleTop },
            { right: compact ? 68 : 74 },
          ]}
        >
          <MapOrientationBox
            x={readoutCoord?.x ?? null}
            y={readoutCoord?.y ?? null}
            compact={compact}
          />

          {state && (following || state.lastReported) ? (
            <View style={styles.telemetryChip}>
              <Text
                variant="caption"
                color={state.lastReported ? 'warningText' : 'textSecondary'}
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
              >
                {`${following ? 'Following · ' : ''}${state.label} · ${sampleAgeLabel(state.ageSeconds)}`}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {sheet ? (
        <SheetContainer inline={compact} onClose={close} accessibilityLabel="map details">
          {/* Header */}
          <View style={styles.sheetHeader}>
            {sheet !== 'layers' && sheet !== 'legend' ? (
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
                {sheet === 'legend' ? (
                  <BookOpen size={18} color={colors.primary} strokeWidth={2.2} />
                ) : (
                  <Layers size={18} color={colors.primary} strokeWidth={2.2} />
                )}
              </View>
            )}
            <View style={styles.sheetHeaderTitleGroup}>
              <Text variant="title" numberOfLines={1}>
                {sheet === 'layers'
                  ? 'Map Layers & View'
                  : sheet === 'legend'
                  ? 'Map Legend'
                  : sheet === 'endpoint'
                  ? endpoint?.name || 'Station Details'
                  : robot?.code || 'Robot Telemetry'}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {sheet === 'layers' || sheet === 'legend'
                  ? `${map.code} · V${map.versionNo} · ${map.resolution} m/px`
                  : sheet === 'endpoint'
                  ? `${endpoint?.code} · ${endpoint?.endpointType}`
                  : robot?.isOnline
                  ? `${t(robotStatusLabel(robot.status))} · ${t('Online')}`
                  : 'Offline'}
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
            {sheet === 'legend' ? (
              <>
                <MapLegendContent map={map} isDark={isDark} showLivePaths={canReadTraffic} />
                <Button
                  title="Done"
                  variant="secondary"
                  size="md"
                  fullWidth
                  onPress={close}
                  style={styles.doneBtn}
                />
              </>
            ) : sheet === 'layers' ? (
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

                {/* 2. Inset Grouped Layers */}
                <View style={styles.sectionBlock}>
                  <Text variant="caption" color="textSecondary" style={styles.sectionHeaderTitle}>
                    DISPLAY LAYERS
                  </Text>
                  <View style={styles.groupedCard}>
                    {layerItems.map((item, idx) => {
                      const isLast = idx === layerItems.length - 1;
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
                              <Text variant="bodyMedium" fontWeight="600">
                                {item.label}
                              </Text>
                              <Text variant="caption" color="textSecondary">
                                {item.desc}
                              </Text>
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
                        <Text variant="caption" color="textSecondary">
                          {activeZones.length}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {layers.zones ? (
                    activeZones.length === 0 ? (
                      <Text variant="caption" color="textMuted">
                        No zones configured for this map.
                      </Text>
                    ) : (
                      <View style={styles.zonesLegendCard}>
                        <View style={styles.zonesWrap}>
                          {activeZones.map(z => (
                            <View key={z.id} style={styles.zoneChip}>
                              <View
                                style={[styles.zoneDot, { backgroundColor: zoneColor(z.zoneType) }]}
                              />
                              <Text
                                variant="caption"
                                fontWeight="600"
                                style={{ fontFamily: typography.fontMono }}
                              >
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
                      <Text variant="caption" color="warningText">
                        Zones layer is currently hidden on the map.
                      </Text>
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
                        <Text variant="bodyMedium" fontWeight="600">
                          Locations & Fleet Directory
                        </Text>
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
                          <Text variant="caption" color="textMuted">
                            No AMR currently operating on this map.
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.cardList}>
                          {mapRobots.map(r => {
                            const rState = mapRobotState(r, map, now, updateMode);
                            const isSelected = selectedRobot === r.code;
                            return (
                              <View
                                key={r.id}
                                style={[styles.robotCard, isSelected && styles.robotCardSelected]}
                              >
                                <View style={styles.robotIconBox}>
                                  <Bot
                                    size={18}
                                    color={r.isOnline ? colors.primaryText : colors.textMuted}
                                  />
                                </View>
                                <View style={styles.robotInfo}>
                                  <View style={styles.robotHeaderRow}>
                                    <Text
                                      variant="bodyMedium"
                                      fontWeight="700"
                                      style={{ fontFamily: typography.fontMono }}
                                    >
                                      {r.code}
                                    </Text>
                                    <View
                                      style={[
                                        styles.statusDot,
                                        {
                                          backgroundColor: r.isOnline
                                            ? colors.success
                                            : colors.textMuted,
                                        },
                                      ]}
                                    />
                                    <Text
                                      variant="caption"
                                      color={r.isOnline ? 'successText' : 'textMuted'}
                                      fontWeight="600"
                                    >
                                      {r.isOnline ? 'Online' : 'Offline'}
                                    </Text>
                                  </View>
                                  <View style={styles.robotSubRow}>
                                    <Text variant="caption" color="textSecondary">
                                      {rState.label}
                                    </Text>
                                    <Text variant="caption" color="textMuted">
                                      ·
                                    </Text>
                                    <View style={styles.batteryInline}>
                                      <BatteryMedium
                                        size={12}
                                        color={
                                          r.batteryPercent === null
                                            ? colors.textSecondary
                                            : r.batteryPercent > 20
                                            ? colors.successText
                                            : colors.dangerText
                                        }
                                      />
                                      <Text variant="caption" color="textSecondary">
                                        {formatBattery(r.batteryPercent)}
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                                <Button
                                  title={
                                    following && isSelected
                                      ? 'Following'
                                      : rState.canFollow
                                      ? 'Track'
                                      : 'Inspect'
                                  }
                                  variant={isSelected ? 'primary' : 'outline'}
                                  size="sm"
                                  icon={Navigation}
                                  onPress={() => {
                                    triggerHaptic('tap');
                                    selectRobot(r.code);
                                    if (rState.canFollow && active) {
                                      setFollowing(true);
                                      close();
                                    }
                                  }}
                                />
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Stations */}
                      <Text
                        variant="caption"
                        color="textSecondary"
                        style={[styles.subSectionTitle, { marginTop: 12 }]}
                      >
                        STATIONS & DOCKS ({enabledEndpoints.length})
                      </Text>
                      <View style={styles.groupedCard}>
                        {enabledEndpoints.map((e, idx) => {
                          const isLast = idx === enabledEndpoints.length - 1;
                          const isSelected = endpointId === e.id;
                          return (
                            <View key={e.id}>
                              <View
                                style={[styles.stationItem, isSelected && styles.stationItemSelected]}
                              >
                                <View style={styles.stationIconBox}>
                                  <EndpointIcon
                                    type={e.endpointType}
                                    code={e.code}
                                    name={e.name}
                                    size={16}
                                    isDark={isDark}
                                  />
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
                                    <Text variant="bodyMedium" fontWeight="700">
                                      {e.name || e.code}
                                    </Text>
                                    <View style={styles.typeTag}>
                                      <Text variant="caption" color="textSecondary">
                                        {e.endpointType}
                                      </Text>
                                    </View>
                                  </View>
                                  <Text
                                    variant="caption"
                                    color="textMuted"
                                    style={{ fontFamily: typography.fontMono }}
                                  >
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
                    <EndpointIcon
                      type={endpoint.endpointType}
                      code={endpoint.code}
                      name={endpoint.name}
                      size={22}
                      isDark={isDark}
                    />
                  </View>
                  <View style={styles.detailHeroText}>
                    <Text variant="title">{endpoint.name}</Text>
                    <Text
                      variant="caption"
                      color="textSecondary"
                      style={{ fontFamily: typography.fontMono }}
                    >
                      {endpoint.code} · {endpoint.endpointType}
                    </Text>
                  </View>
                  <StatusPill
                    status={endpoint.isEnabled ? 'ACTIVE' : 'OFFLINE'}
                    label={endpoint.isEnabled ? 'Operational' : 'Disabled'}
                    dot
                  />
                </View>

                <View style={styles.specBox}>
                  <View style={styles.specRow}>
                    <Text variant="caption" color="textSecondary">
                      Position X
                    </Text>
                    <Text
                      variant="bodyMedium"
                      fontWeight="700"
                      style={{ fontFamily: typography.fontMono }}
                    >
                      {endpoint.x.toFixed(3)} m
                    </Text>
                  </View>
                  <View style={styles.specRow}>
                    <Text variant="caption" color="textSecondary">
                      Position Y
                    </Text>
                    <Text
                      variant="bodyMedium"
                      fontWeight="700"
                      style={{ fontFamily: typography.fontMono }}
                    >
                      {endpoint.y.toFixed(3)} m
                    </Text>
                  </View>
                  <View style={styles.specRow}>
                    <Text variant="caption" color="textSecondary">
                      Orientation Yaw
                    </Text>
                    <Text
                      variant="bodyMedium"
                      fontWeight="700"
                      style={{ fontFamily: typography.fontMono }}
                    >
                      {((endpoint.yaw * 180) / Math.PI).toFixed(1)}° ({endpoint.yaw.toFixed(3)} rad)
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
                <View
                  style={[
                    styles.robotHero,
                    { borderColor: robot.isOnline ? colors.successBorder : colors.borderStrong },
                  ]}
                >
                  <View style={styles.robotHeroTop}>
                    <View
                      style={[
                        styles.robotAvatar,
                        { backgroundColor: (ROBOT_COLOR[robot.status] ?? colors.textMuted) + '22' },
                      ]}
                    >
                      <Bot
                        size={24}
                        color={
                          robot.isOnline
                            ? ROBOT_COLOR[robot.status] ?? colors.primaryText
                            : colors.textMuted
                        }
                      />
                    </View>
                    <View style={styles.detailHeroText}>
                      <Text
                        variant="title"
                        numberOfLines={1}
                        style={{ fontFamily: typography.fontMono }}
                      >
                        {robot.code}
                      </Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>
                        {robot.name || robot.code}
                      </Text>
                    </View>
                    <OnlineBadge online={robot.isOnline} />
                  </View>
                  <View style={styles.robotStats}>
                    <View style={styles.robotStat}>
                      <Text variant="caption" color="textSecondary">
                        Battery
                      </Text>
                      <BatteryIndicator
                        percent={robot.batteryPercent}
                        charging={robot.status === 'CHARGING'}
                        size="lg"
                        bar
                      />
                    </View>
                    <View style={styles.robotStat}>
                      <Text variant="caption" color="textSecondary">
                        Status
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: ROBOT_COLOR[robot.status] ?? colors.textMuted,
                          }}
                        />
                        <Text variant="bodyMedium" fontWeight="700" numberOfLines={1}>
                          {robotStatusLabel(robot.status)}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {onLocalizeRobot ? (
                  <RobotLocalizePanel
                    key={robot.id}
                    robotCode={robot.code}
                    isOnline={robot.isOnline}
                    localizationStatus={robot.localizationStatus}
                    mapVersionId={map.id}
                    endpoints={map.endpoints}
                    onLocalize={epId => onLocalizeRobot(robot.id, epId)}
                  />
                ) : null}

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
                  {onManualDrive ? (
                    <Button
                      title="Manual Drive"
                      variant="outline"
                      size="md"
                      icon={SlidersHorizontal}
                      fullWidth
                      onPress={() => {
                        triggerHaptic('tap');
                        close();
                        onManualDrive(robot.id);
                      }}
                    />
                  ) : null}
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
                <Text variant="bodyMedium" color="textMuted">
                  The selected object is no longer available on this map.
                </Text>
                <Button
                  title="Back to Layers"
                  variant="outline"
                  icon={ChevronLeft}
                  onPress={backToLayers}
                />
              </View>
            )}
          </ScrollView>
        </SheetContainer>
      ) : null}
    </>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    root: { ...StyleSheet.absoluteFill, backgroundColor: colors.mapVoid, overflow: 'hidden' },
    heading: {
      position: 'absolute',
      left: 16,
      right: 16,
      gap: 3,
      paddingTop: 8,
      paddingBottom: 6,
    },
    smallState: { position: 'absolute', left: 24, right: 24, justifyContent: 'center' },
    station: { backgroundColor: 'transparent', borderColor: 'transparent', borderRadius: 20 },
    robotHero: {
      borderWidth: 1.5,
      borderRadius: 18,
      padding: 14,
      gap: 14,
      backgroundColor: colors.surface,
    },
    robotHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    robotAvatar: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    robotStats: { flexDirection: 'row', gap: 8 },
    robotStat: {
      flex: 1,
      gap: 6,
      padding: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceSubtle,
    },

    topLeftHud: {
      position: 'absolute',
      left: 12,
      zIndex: 12,
    },

    floorAreaPill: {
      alignSelf: 'center',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: 'rgba(128, 138, 154, 0.14)',
    },
    shelfPill: {
      alignSelf: 'center',
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
      backgroundColor: colors.mapLabelBg,
      borderColor: colors.mapHudBorder,
    },
    shelfText: {
      fontSize: 9.5,
      lineHeight: 12,
      fontFamily: typography.fontMono,
      color: colors.textSecondary,
    },

    stationLabelBelow: {
      position: 'absolute',
      top: 44,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 2,
    },
    stationLabelAbove: {
      position: 'absolute',
      bottom: 44,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 2,
    },
    jobRolePill: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    jobRoleText: {
      fontSize: 9,
      lineHeight: 11,
      color: '#ffffff',
    },
    stationLabelPill: {
      paddingHorizontal: 5,
      paddingVertical: 1.5,
      borderRadius: 5,
      borderWidth: 1,
      backgroundColor: colors.mapLabelBg,
      borderColor: colors.mapHudBorder,
    },
    stationLabelText: {
      fontSize: 9.5,
      lineHeight: 12.5,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    areaWatermarkBelow: {
      position: 'absolute',
      top: 42,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    areaWatermarkAbove: {
      position: 'absolute',
      bottom: 42,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    areaWatermarkText: {
      fontSize: 10,
      lineHeight: 13,
      fontWeight: '600',
      letterSpacing: 0.35,
      color: isDark ? 'rgba(226, 232, 240, 0.78)' : 'rgba(30, 41, 59, 0.74)',
      textShadowColor: isDark ? 'rgba(5, 7, 10, 0.90)' : 'rgba(255, 255, 255, 0.92)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      textAlign: 'center',
    },

    inspectCard: {
      position: 'absolute',
      left: 12,
      zIndex: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radii.lg,
      borderWidth: 1,
      backgroundColor: colors.mapHudBg,
      borderColor: colors.mapHudBorder,
      ...shadows.md,
    },
    inspectAccent: {
      width: 4,
      alignSelf: 'stretch',
      borderRadius: 2,
    },
    inspectBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    inspectHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    inspectTitle: {
      flexShrink: 1,
    },
    inspectBadge: {
      paddingHorizontal: 7,
      paddingVertical: 1.5,
      borderRadius: 6,
    },
    inspectClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSubtle,
    },

    footer: {
      position: 'absolute',
      left: 12,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      zIndex: 10,
    },
    telemetryChip: {
      flexShrink: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      borderWidth: 1,
      backgroundColor: colors.mapHudBg,
      borderColor: colors.mapHudBorder,
      ...shadows.sm,
    },

    loading: { position: 'absolute', left: 12, top: 60 },
    imageError: {
      position: 'absolute',
      left: 12,
      right: 76,
      top: 60,
      gap: 8,
      padding: 10,
      backgroundColor: colors.warningBg,
      borderRadius: 8,
    },

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

    // Grouped Card
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

    // Tactile Switch
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
      backgroundColor: isDark ? colors.borderStrong : '#dcdfe4',
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
    inlineSheetBackdrop: {
      ...StyleSheet.absoluteFill,
      zIndex: 40,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    inlineSheetCard: {
      maxHeight: '88%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      overflow: 'hidden',
      paddingTop: 8,
    },
  });
