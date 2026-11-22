import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDot,
  CircleParking,
  Clock,
  Rows3,
  ScanSearch,
  Zap,
} from 'lucide-react-native';
import type { EndpointJobRole } from './mapLabels';
import {
  JOB_HIGHLIGHT_COLOR,
  endpointVisualKind,
  visualKindColor,
  type EndpointVisualKind,
} from './mapStyle';

export { type EndpointVisualKind, endpointVisualKind, visualKindColor } from './mapStyle';

const ICONS = {
  WAYPOINT: CircleDot,
  SHELF: Rows3,
  INBOUND: ArrowDownToLine,
  OUTBOUND: ArrowUpFromLine,
  CHARGER: Zap,
  PARK: CircleParking,
  INSPECTION: ScanSearch,
  WAIT: Clock,
} as const;

/** Precision map endpoint icon using consistent thin-stroke Lucide icons. */
export function EndpointIcon({
  type,
  size = 16,
  isDark = false,
  color,
  code,
  name,
}: {
  type: string;
  size?: number;
  isDark?: boolean;
  color?: string;
  code?: string;
  name?: string;
}) {
  const visualKind = endpointVisualKind(type, code, name);
  const Icon = ICONS[visualKind];
  return (
    <Icon
      size={size}
      color={color ?? visualKindColor(visualKind, type, isDark)}
      strokeWidth={1.85}
    />
  );
}

/**
 * Refined micro-node station marker sized for compact warehouse maps:
 * - Generic waypoints render as clean 14px precision concentric nodes.
 * - Functional stations (Shelf, Inbound, Outbound, Charger, Park, Inspection, Wait)
 *   render as high-contrast 18px neutral OTTO architectural tiles.
 * - Active Job Pickup/Dropoff endpoints stand out with a crisp 26px accent ring.
 * Parent MapControl maintains the >= 44pt interactive touch target.
 */
export const EndpointTile = memo(function EndpointTile({
  type,
  headingDeg,
  selected,
  isDark,
  surface,
  jobRole = null,
  code,
  name,
}: {
  type: string;
  headingDeg: number;
  selected: boolean;
  isDark: boolean;
  surface: string;
  jobRole?: EndpointJobRole | null;
  code?: string;
  name?: string;
}) {
  const visualKind = endpointVisualKind(type, code, name);
  const baseColor = visualKindColor(visualKind, type, isDark);
  const accentColor = jobRole ? JOB_HIGHLIGHT_COLOR[jobRole] : baseColor;
  const isWaypoint = visualKind === 'WAYPOINT';
  const arrowPath = isWaypoint
    ? 'M14.5 0 L10.5 -2.6 L10.5 2.6 Z'
    : 'M15.5 0 L11.5 -2.6 L11.5 2.6 Z';

  const isCharger = visualKind === 'CHARGER';
  const tileBorderColor =
    selected || jobRole || isCharger
      ? accentColor
      : isDark
      ? 'rgba(226, 232, 240, 0.32)'
      : 'rgba(31, 41, 55, 0.26)';
  const tileBackground = selected ? accentColor : isDark ? '#151922' : '#ffffff';

  return (
    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 32,
          height: 32,
          transform: [{ rotate: `${headingDeg}deg` }],
        }}
      >
        <Svg width={32} height={32} viewBox="-16 -16 32 32">
          <Path d={arrowPath} fill={accentColor} opacity={0.78} />
        </Svg>
      </View>

      {jobRole ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 1.8,
            borderColor: accentColor,
            backgroundColor: `${accentColor}1f`,
          }}
        />
      ) : selected ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: accentColor,
            opacity: 0.18,
          }}
        />
      ) : null}

      {isWaypoint ? (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 1.6,
            borderColor: accentColor,
            backgroundColor: selected ? accentColor : isDark ? '#111620' : surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 4.5,
              height: 4.5,
              borderRadius: 2.25,
              backgroundColor: selected ? '#ffffff' : accentColor,
            }}
          />
        </View>
      ) : (
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 5.5,
            borderWidth: jobRole ? 1.5 : 1.15,
            borderColor: tileBorderColor,
            backgroundColor: tileBackground,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EndpointIcon
            type={type}
            code={code}
            name={name}
            size={10.5}
            isDark={isDark}
            color={selected ? '#ffffff' : baseColor}
          />
        </View>
      )}
    </View>
  );
});
