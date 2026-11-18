import React, { memo } from 'react';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Pattern, Polyline, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { CHEVRON_PATH, laneGlyphs, type DrawPoint } from '../laneGlyphs';
import { LANE_BAND_OPACITY, LANE_BLUE, LANE_CHEVRON_OPACITY, ZONE_COLOR, ZONE_FILL_OPACITY, zoneColorOf } from '../mapStyle';
import { worldToBase, type MapFrame, type MapPoint } from '../mapTransform';

interface Props { map: MapVersionDetailDto; frame: MapFrame; zones: boolean; lanes: boolean; zoom: number }

const toPoints = (line: DrawPoint[]) => line.map(p => `${p.x},${p.y}`).join(' ');

function centroid(points: MapPoint[]): MapPoint {
  const ring = points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y
    ? points.slice(0, -1) : points;
  const sum = ring.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / ring.length, y: sum.y / ring.length };
}

/**
 * Zones and lanes drawn like the web console's WarehouseMap: zones tinted by type (keep-out hatched) with a centre dot,
 * lanes as a translucent band as wide as the lane with chevrons (one row one-way, two opposite rows split by a dashed
 * divider two-way). Everything is in base pixels; `pxPerMetre` turns the lane width in metres into pixels.
 */
export const InfrastructureLayer = memo(function InfrastructureLayer({ map, frame, zones, lanes, zoom }: Props) {
  const clip = `infrastructure-${map.id}`;
  const hatch = `hatch-${map.id}`;
  const pxPerMetre = frame.scale / (map.resolution || 0.05);
  // Marks keep a readable size on screen: a hair line is ~1 screen point whatever the zoom.
  const hair = 1 / zoom;
  const point = (p: number[]) => worldToBase({ x: p[0], y: p[1] }, map, frame);
  return <Svg width={frame.width} height={frame.height} style={{ position: 'absolute' }} pointerEvents="none" accessibilityLabel="Configured lanes and zones">
    <Defs>
      <ClipPath id={clip}><Rect x={frame.left} y={frame.top} width={frame.mapWidth} height={frame.mapHeight} /></ClipPath>
      <Pattern id={hatch} width={6 * hair} height={6 * hair} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <Line x1={0} y1={0} x2={0} y2={6 * hair} stroke={ZONE_COLOR.KEEP_OUT} strokeOpacity={0.55} strokeWidth={2 * hair} />
      </Pattern>
    </Defs>
    <G clipPath={`url(#${clip})`}>
      {zones ? (map.zones || []).filter(z => z.mapVersionId === map.id && z.isActive && z.geometry.type === 'Polygon').map(zone => {
        const rings = zone.geometry.coordinates.map(ring => ring.map(point));
        if (!rings.length || rings.some(ring => ring.length < 4 || ring.some(p => !p))) return null;
        const outer = rings[0] as MapPoint[];
        const color = zoneColorOf(zone.zoneType);
        const anchor = centroid(outer);
        return <G key={zone.id}>
          <Path d={rings.map(ring => 'M' + toPoints(ring as MapPoint[]).replaceAll(' ', ' L') + ' Z').join(' ')} fillRule="evenodd"
            fill={color} fillOpacity={ZONE_FILL_OPACITY[zone.zoneType] ?? 0.2} stroke={color} strokeOpacity={0.7} strokeWidth={1.4 * hair} strokeLinejoin="round" />
          {zone.zoneType === 'KEEP_OUT' ? <Path d={'M' + toPoints(outer).replaceAll(' ', ' L') + ' Z'} fill={`url(#${hatch})`} /> : null}
          <Circle cx={anchor.x} cy={anchor.y} r={3.5 * hair} fill={color} stroke="#ffffff" strokeWidth={1.2 * hair} />
        </G>;
      }) : null}
      {lanes ? (map.edges || []).filter(e => e.mapVersionId === map.id && e.isActive && e.geometry.type === 'LineString').map(edge => {
        const points = edge.geometry.coordinates.map(point);
        if (points.length < 2 || points.some(p => !p)) return null;
        const stage = points as MapPoint[];
        const width = Math.max((edge.widthMeters || 1) * pxPerMetre, 6 * hair);
        const glyphs = laneGlyphs(stage, width, edge.direction === 'ONE_WAY' ? 'ONE_WAY' : 'BIDIRECTIONAL');
        return <G key={edge.id}>
          <Polyline points={toPoints(stage)} fill="none" stroke={LANE_BLUE} strokeOpacity={LANE_BAND_OPACITY} strokeWidth={width} strokeLinejoin="miter" strokeLinecap="butt" />
          {glyphs.sides.map((side, index) => <Polyline key={index} points={toPoints(side)} fill="none" stroke={LANE_BLUE} strokeOpacity={0.45} strokeWidth={hair} />)}
          {glyphs.divider ? <Polyline points={toPoints(glyphs.divider)} fill="none" stroke={LANE_BLUE} strokeOpacity={0.6} strokeWidth={hair} strokeDasharray={`${5 * hair} ${4 * hair}`} /> : null}
          {glyphs.chevrons.map((c, index) => <Path key={index} d={CHEVRON_PATH} fill="none" stroke={LANE_BLUE} strokeOpacity={LANE_CHEVRON_OPACITY}
            strokeWidth={1.6 * hair / glyphs.chevronSize} strokeLinecap="round" strokeLinejoin="round"
            transform={`translate(${c.x} ${c.y}) rotate(${c.angle}) scale(${glyphs.chevronSize})`} />)}
        </G>;
      }) : null}
    </G>
  </Svg>;
});
