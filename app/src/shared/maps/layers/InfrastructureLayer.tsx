import React, { memo } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Pattern, Polyline, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { LANE_ARROW_PATH, laneGlyphs, type DrawPoint } from '../laneGlyphs';
import {
  jobRouteColor,
  laneArrowColor,
  laneBandColor,
  laneBandOpacity,
  laneEdgeColor,
  trailColor,
  zoneColorOf,
  zoneFillOpacity,
  zoneStrokeColor,
} from '../mapStyle';
import type { MapPlannedPath } from '../mapTraffic';
import type { MapJobMovement } from '../mapTrails';
import { worldToBase, type MapFrame, type MapPoint } from '../mapTransform';

interface Props {
  map: MapVersionDetailDto;
  frame: MapFrame;
  zones: boolean;
  lanes: boolean;
  zoom: number;
  isDark: boolean;
  selectedZoneId?: string | null;
  selectedEdgeId?: string | null;
  plannedPaths?: MapPlannedPath[];
  showPaths?: boolean;
  jobMovement?: MapJobMovement | null;
  trailSegments?: readonly MapPoint[][];
  showJobRoute?: boolean;
}

const toPoints = (line: DrawPoint[]) => line.map(p => `${p.x},${p.y}`).join(' ');

function ringsToPathD(rings: readonly MapPoint[][]): string {
  return rings
    .map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z')
    .join(' ');
}

/**
 * Zones, traffic corridors and (when traffic.read is granted) live Nav2 planned paths,
 * tuned with airy opacities and capped arrow sizes for compact maps.
 */
export const InfrastructureLayer = memo(function InfrastructureLayer({
  map,
  frame,
  zones,
  lanes,
  zoom,
  isDark,
  selectedZoneId = null,
  selectedEdgeId = null,
  plannedPaths = [],
  showPaths = false,
  jobMovement = null,
  trailSegments = [],
  showJobRoute = false,
}: Props) {
  const clip = `infrastructure-${map.id}`;
  const hatch = `hatch-${map.id}`;
  const pxPerMetre = frame.scale / (map.resolution || 0.05);
  const hair = 1 / Math.max(1, zoom);
  const arrowColor = laneArrowColor(isDark);
  const bandColor = laneBandColor(isDark);
  const edgeColor = laneEdgeColor(isDark);
  const keepOutStroke = zoneStrokeColor('KEEP_OUT', isDark);
  const bandOpacity = laneBandOpacity(isDark);
  const point = (p: number[]) => worldToBase({ x: p[0], y: p[1] }, map, frame);

  return (
    <Svg
      width={frame.width}
      height={frame.height}
      style={{ position: 'absolute' }}
      pointerEvents="none"
      accessibilityLabel="Configured lanes and zones"
    >
      <Defs>
        <ClipPath id={clip}>
          <Rect x={frame.left} y={frame.top} width={frame.mapWidth} height={frame.mapHeight} />
        </ClipPath>
        <Pattern
          id={hatch}
          width={6 * hair}
          height={6 * hair}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <Line
            x1={0}
            y1={0}
            x2={0}
            y2={6 * hair}
            stroke={keepOutStroke}
            strokeOpacity={isDark ? 0.65 : 0.5}
            strokeWidth={1.6 * hair}
          />
        </Pattern>
      </Defs>

      <G clipPath={`url(#${clip})`}>
        {zones
          ? (map.zones || [])
              .filter(z => z.mapVersionId === map.id && z.isActive && z.geometry.type === 'Polygon')
              .map(zone => {
                const rings = zone.geometry.coordinates.map(ring => ring.map(point));
                if (!rings.length || rings.some(ring => ring.length < 4 || ring.some(p => !p))) return null;
                const validRings = rings as MapPoint[][];
                const d = ringsToPathD(validRings);
                const color = zoneColorOf(zone.zoneType);
                const strokeColor = zoneStrokeColor(zone.zoneType, isDark);
                const isSelected = selectedZoneId === zone.id;
                const isKeepOut = zone.zoneType === 'KEEP_OUT';
                const baseOpacity = zoneFillOpacity(zone.zoneType, isDark);
                const fillOpacity = isSelected ? Math.min(0.36, baseOpacity + 0.14) : baseOpacity;

                return (
                  <G key={zone.id}>
                    <Path
                      d={d}
                      fillRule="evenodd"
                      fill={color}
                      fillOpacity={fillOpacity}
                      stroke={strokeColor}
                      strokeOpacity={isSelected ? 0.96 : isDark ? 0.72 : 0.60}
                      strokeWidth={(isSelected ? 2 : isDark ? 1.05 : 1.1) * hair}
                      strokeDasharray={isKeepOut || isSelected ? undefined : `${4 * hair} ${3 * hair}`}
                      strokeLinejoin="round"
                    />
                    {isKeepOut ? <Path d={d} fillRule="evenodd" fill={`url(#${hatch})`} /> : null}
                  </G>
                );
              })
          : null}

        {lanes
          ? (map.edges || [])
              .filter(e => e.mapVersionId === map.id && e.isActive && e.geometry.type === 'LineString')
              .map(edge => {
                const points = edge.geometry.coordinates.map(point);
                if (points.length < 2 || points.some(p => !p)) return null;
                const stage = points as MapPoint[];
                const width = Math.max((edge.widthMeters || 1) * pxPerMetre, 6 * hair);
                const glyphs = laneGlyphs(
                  stage,
                  width,
                  edge.direction === 'ONE_WAY' ? 'ONE_WAY' : 'BIDIRECTIONAL',
                );
                const arrowScale = glyphs.chevronSize;
                const isSelected = selectedEdgeId === edge.id;
                const activeBandOpacity = isSelected ? Math.min(0.38, bandOpacity + 0.14) : bandOpacity;

                return (
                  <G key={edge.id}>
                    {isSelected ? (
                      <Polyline
                        points={toPoints(stage)}
                        fill="none"
                        stroke={arrowColor}
                        strokeOpacity={0.32}
                        strokeWidth={width + 3.5 * hair}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : null}
                    <Polyline
                      points={toPoints(stage)}
                      fill="none"
                      stroke={bandColor}
                      strokeOpacity={activeBandOpacity}
                      strokeWidth={width}
                      strokeLinejoin="miter"
                      strokeLinecap="butt"
                    />
                    {glyphs.sides.map((side, index) => (
                      <Polyline
                        key={index}
                        points={toPoints(side)}
                        fill="none"
                        stroke={edgeColor}
                        strokeOpacity={isDark ? 0.44 : 0.34}
                        strokeWidth={0.85 * hair}
                      />
                    ))}
                    {glyphs.divider ? (
                      <Polyline
                        points={toPoints(glyphs.divider)}
                        fill="none"
                        stroke={edgeColor}
                        strokeOpacity={isDark ? 0.42 : 0.42}
                        strokeWidth={0.85 * hair}
                        strokeDasharray={`${4 * hair} ${3.5 * hair}`}
                      />
                    ) : (
                      <Polyline
                        points={toPoints(stage)}
                        fill="none"
                        stroke={edgeColor}
                        strokeOpacity={isDark ? 0.18 : 0.16}
                        strokeWidth={0.8 * hair}
                      />
                    )}
                    {glyphs.chevrons.map((c, index) => (
                      <Path
                        key={index}
                        d={LANE_ARROW_PATH}
                        fill={arrowColor}
                        fillOpacity={isDark ? 0.72 : 0.72}
                        transform={`translate(${c.x} ${c.y}) rotate(${c.angle}) scale(${arrowScale})`}
                      />
                    ))}
                  </G>
                );
              })
          : null}

        {showJobRoute && jobMovement
          ? (() => {
              const a = point([jobMovement.from.x, jobMovement.from.y]);
              const b = point([jobMovement.to.x, jobMovement.to.y]);
              if (!a || !b) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy);
              if (dist <= 26 * hair) return null;
              const ux = dx / dist;
              const uy = dy / dist;
              const trim = 12 * hair;
              const start = { x: a.x + ux * trim, y: a.y + uy * trim };
              const end = { x: b.x - ux * trim, y: b.y - uy * trim };
              const tipBack = { x: end.x - ux * (4.5 * hair), y: end.y - uy * (4.5 * hair) };
              const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
              const stroke = jobRouteColor(isDark);

              return (
                <G key={`job-route-${jobMovement.pickupId}-${jobMovement.dropoffId}`}>
                  <Line
                    x1={start.x}
                    y1={start.y}
                    x2={tipBack.x}
                    y2={tipBack.y}
                    stroke={stroke}
                    strokeOpacity={isDark ? 0.72 : 0.68}
                    strokeWidth={1.6 * hair}
                    strokeDasharray={`${5 * hair} ${4 * hair}`}
                    strokeLinecap="round"
                  />
                  <Path
                    d="M0 0 L-7 -3.4 L-7 3.4 Z"
                    fill={stroke}
                    fillOpacity={isDark ? 0.88 : 0.84}
                    transform={`translate(${end.x} ${end.y}) rotate(${angle}) scale(${hair})`}
                  />
                </G>
              );
            })()
          : null}

        {showJobRoute && trailSegments.length > 0
          ? (() => {
              const projectedSegments = trailSegments
                .map(seg => seg.map(worldPt => point([worldPt.x, worldPt.y])).filter((p): p is MapPoint => !!p))
                .filter(seg => seg.length >= 2);
              if (projectedSegments.length === 0) return null;

              const color = trailColor(isDark);
              const firstPoint = projectedSegments[0][0];

              return (
                <G key="job-trail">
                  {projectedSegments.slice(1).map((seg, gapIdx) => {
                    const prevSeg = projectedSegments[gapIdx];
                    const lastPrev = prevSeg[prevSeg.length - 1];
                    const firstNext = seg[0];
                    return (
                      <Line
                        key={`trail-gap-${gapIdx}`}
                        x1={lastPrev.x}
                        y1={lastPrev.y}
                        x2={firstNext.x}
                        y2={firstNext.y}
                        stroke={color}
                        strokeOpacity={0.45}
                        strokeWidth={1.4 * hair}
                        strokeDasharray={`${3.5 * hair} ${3.5 * hair}`}
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {projectedSegments.map((seg, segIdx) => (
                    <G key={`trail-seg-${segIdx}`}>
                      <Polyline
                        points={toPoints(seg)}
                        fill="none"
                        stroke={color}
                        strokeOpacity={0.22}
                        strokeWidth={4.8 * hair}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <Polyline
                        points={toPoints(seg)}
                        fill="none"
                        stroke={color}
                        strokeOpacity={0.92}
                        strokeWidth={2.2 * hair}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </G>
                  ))}
                  <Circle
                    cx={firstPoint.x}
                    cy={firstPoint.y}
                    r={3.2 * hair}
                    fill={isDark ? '#151922' : '#ffffff'}
                    stroke={color}
                    strokeWidth={1.4 * hair}
                  />
                </G>
              );
            })()
          : null}

        {showPaths && plannedPaths.length > 0
          ? plannedPaths.map(path => {
              const projected = path.points
                .map(p => worldToBase(p, map, frame))
                .filter((p): p is MapPoint => !!p);
              if (projected.length < 2) return null;

              const grantedLen = Math.min(path.grantedCount, projected.length);
              const grantedPts = grantedLen >= 2 ? projected.slice(0, grantedLen) : [];
              const remainingPts =
                grantedLen >= 2
                  ? grantedLen < projected.length
                    ? projected.slice(grantedLen - 1)
                    : []
                  : projected;
              const goal = projected[projected.length - 1];

              return (
                <G key={`plan-${path.robotCode}`}>
                  {grantedPts.length >= 2 ? (
                    <>
                      <Polyline
                        points={toPoints(grantedPts)}
                        fill="none"
                        stroke={path.color}
                        strokeOpacity={0.22}
                        strokeWidth={5.5 * hair}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <Polyline
                        points={toPoints(grantedPts)}
                        fill="none"
                        stroke={path.color}
                        strokeOpacity={0.96}
                        strokeWidth={2.4 * hair}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  ) : null}
                  {remainingPts.length >= 2 ? (
                    <Polyline
                      points={toPoints(remainingPts)}
                      fill="none"
                      stroke={path.color}
                      strokeOpacity={0.58}
                      strokeWidth={1.8 * hair}
                      strokeDasharray={`${4 * hair} ${4 * hair}`}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  <Circle
                    cx={goal.x}
                    cy={goal.y}
                    r={5 * hair}
                    fill={path.color}
                    fillOpacity={0.16}
                    stroke={path.color}
                    strokeWidth={1.8 * hair}
                  />
                  <Circle cx={goal.x} cy={goal.y} r={1.8 * hair} fill={path.color} />
                </G>
              );
            })
          : null}
      </G>
    </Svg>
  );
});
