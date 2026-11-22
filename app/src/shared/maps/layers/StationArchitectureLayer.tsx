import React, { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';
import type { EndpointDto, MapVersionDetailDto } from '../../api/navigationApi';
import { computeStationArchitecture } from '../mapArchitecture';
import { visualKindColor } from '../mapStyle';
import type { MapFrame } from '../mapTransform';

interface Props {
  map: MapVersionDetailDto;
  frame: MapFrame;
  endpoints: readonly { x: number; y: number; endpoint: EndpointDto }[];
  zoom: number;
  isDark: boolean;
  showWallShelves?: boolean;
}

/**
 * Architectural CAD overlay drawn in world scale inside the zoomed scene:
 * - OTTO-style floor docking brackets (`[ ]`) sized to the robot clearance envelope.
 * - Recessed perimeter wall-mounted shelf bays for wall-adjacent shelf endpoints.
 */
export const StationArchitectureLayer = memo(function StationArchitectureLayer({
  map,
  frame,
  endpoints,
  zoom,
  isDark,
  showWallShelves = true,
}: Props) {
  const { dockBays, shelfBays } = useMemo(
    () =>
      computeStationArchitecture(map, frame, endpoints, {
        includeWallShelves: showWallShelves,
      }),
    [map, frame, endpoints, showWallShelves],
  );

  if (dockBays.length === 0 && shelfBays.length === 0) return null;

  const strokeUnit = 1 / Math.sqrt(Math.max(1, zoom));
  const rackColor = visualKindColor('SHELF', 'WAYPOINT', isDark);
  const rackFill = isDark ? 'rgba(56, 189, 248, 0.14)' : 'rgba(2, 132, 199, 0.08)';

  return (
    <Svg
      width={frame.width}
      height={frame.height}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityLabel="Station docking bays and recessed shelf architecture"
    >
      {dockBays.map(bay => {
        const hw = bay.width / 2;
        const hl = bay.length / 2;
        const arm = 0.24 * Math.min(bay.width, bay.length);
        const color = visualKindColor(bay.kind, bay.endpointType, isDark);
        const bracketsPath = [
          `M${-hw + arm} ${-hl} L${-hw} ${-hl} L${-hw} ${-hl + arm}`,
          `M${hw - arm} ${-hl} L${hw} ${-hl} L${hw} ${-hl + arm}`,
          `M${-hw + arm} ${hl} L${-hw} ${hl} L${-hw} ${hl - arm}`,
          `M${hw - arm} ${hl} L${hw} ${hl} L${hw} ${hl - arm}`,
        ].join(' ');

        return (
          <G key={`bay-${bay.id}`} transform={`translate(${bay.cx} ${bay.cy}) rotate(${bay.headingDeg})`}>
            <Rect
              x={-hw}
              y={-hl}
              width={bay.width}
              height={bay.length}
              rx={2 * strokeUnit}
              fill={color}
              fillOpacity={isDark ? 0.06 : 0.04}
            />
            <Path
              d={bracketsPath}
              fill="none"
              stroke={color}
              strokeOpacity={isDark ? 0.56 : 0.45}
              strokeWidth={1.15 * strokeUnit}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={-hw + arm * 0.65}
              y1={-hl}
              x2={hw - arm * 0.65}
              y2={-hl}
              stroke={color}
              strokeOpacity={isDark ? 0.72 : 0.58}
              strokeWidth={1.35 * strokeUnit}
              strokeLinecap="round"
            />
          </G>
        );
      })}

      {shelfBays.map(bay => {
        const isHoriz = bay.wall === 'top' || bay.wall === 'bottom';
        const dividers = Array.from({ length: Math.max(0, bay.slots - 1) }, (_, idx) => {
          const frac = (idx + 1) / bay.slots;
          return isHoriz
            ? {
                x1: bay.x + bay.width * frac,
                y1: bay.y + 1.5 * strokeUnit,
                x2: bay.x + bay.width * frac,
                y2: bay.y + bay.height - 1.5 * strokeUnit,
              }
            : {
                x1: bay.x + 1.5 * strokeUnit,
                y1: bay.y + bay.height * frac,
                x2: bay.x + bay.width - 1.5 * strokeUnit,
                y2: bay.y + bay.height * frac,
              };
        });

        const shelfBar =
          bay.wall === 'top'
            ? { x1: bay.x + 2, y1: bay.y + bay.height * 0.45, x2: bay.x + bay.width - 2, y2: bay.y + bay.height * 0.45 }
            : bay.wall === 'bottom'
            ? { x1: bay.x + 2, y1: bay.y + bay.height * 0.55, x2: bay.x + bay.width - 2, y2: bay.y + bay.height * 0.55 }
            : bay.wall === 'left'
            ? { x1: bay.x + bay.width * 0.45, y1: bay.y + 2, x2: bay.x + bay.width * 0.45, y2: bay.y + bay.height - 2 }
            : { x1: bay.x + bay.width * 0.55, y1: bay.y + 2, x2: bay.x + bay.width * 0.55, y2: bay.y + bay.height - 2 };

        return (
          <G key={`wall-shelf-${bay.id}`}>
            {bay.connector ? (
              <Line
                x1={bay.connector.x1}
                y1={bay.connector.y1}
                x2={bay.connector.x2}
                y2={bay.connector.y2}
                stroke={rackColor}
                strokeOpacity={isDark ? 0.5 : 0.4}
                strokeWidth={strokeUnit}
                strokeDasharray={`${2.4 * strokeUnit} ${2 * strokeUnit}`}
              />
            ) : null}
            <Rect
              x={bay.x}
              y={bay.y}
              width={bay.width}
              height={bay.height}
              rx={2 * strokeUnit}
              fill={rackFill}
              stroke={rackColor}
              strokeOpacity={isDark ? 0.8 : 0.65}
              strokeWidth={1.15 * strokeUnit}
            />
            <Line
              x1={shelfBar.x1}
              y1={shelfBar.y1}
              x2={shelfBar.x2}
              y2={shelfBar.y2}
              stroke={rackColor}
              strokeOpacity={isDark ? 0.36 : 0.28}
              strokeWidth={0.85 * strokeUnit}
            />
            {dividers.map((div, idx) => (
              <Line
                key={idx}
                x1={div.x1}
                y1={div.y1}
                x2={div.x2}
                y2={div.y2}
                stroke={rackColor}
                strokeOpacity={isDark ? 0.58 : 0.45}
                strokeWidth={0.9 * strokeUnit}
              />
            ))}
            <Line
              x1={bay.opening.x1}
              y1={bay.opening.y1}
              x2={bay.opening.x2}
              y2={bay.opening.y2}
              stroke={rackColor}
              strokeOpacity={isDark ? 0.9 : 0.78}
              strokeWidth={1.4 * strokeUnit}
              strokeLinecap="round"
            />
          </G>
        );
      })}
    </Svg>
  );
});
