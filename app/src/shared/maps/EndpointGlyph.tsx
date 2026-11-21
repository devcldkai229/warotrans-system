import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CircleDot,
  CircleParking,
  Zap,
} from 'lucide-react-native';
import type { EndpointJobRole } from './mapLabels';
import { JOB_HIGHLIGHT_COLOR, endpointColorOf, endpointKind } from './mapStyle';

export type EndpointVisualKind = 'WAYPOINT' | 'CHARGER' | 'PARK' | 'INBOUND' | 'OUTBOUND';

const ICONS = {
  WAYPOINT: CircleDot,
  CHARGER: Zap,
  PARK: CircleParking,
  INBOUND: ArrowDownToLine,
  OUTBOUND: ArrowUpFromLine,
} as const;

export function endpointVisualKind(
  type: string,
  code?: string,
  name?: string,
): EndpointVisualKind {
  const kind = endpointKind(type);
  if (kind === 'CHARGER') return 'CHARGER';
  if (kind === 'PARK') return 'PARK';
  const hint = `${code ?? ''} ${name ?? ''}`;
  if (/inbound/i.test(hint)) return 'INBOUND';
  if (/outbound/i.test(hint)) return 'OUTBOUND';
  return 'WAYPOINT';
}

export function visualKindColor(
  visualKind: EndpointVisualKind,
  type: string,
  isDark: boolean,
): string {
  switch (visualKind) {
    case 'CHARGER':
    case 'INBOUND':
      return isDark ? '#34d399' : '#059669';
    case 'PARK':
    case 'OUTBOUND':
      return isDark ? '#fbbf24' : '#d97706';
    case 'WAYPOINT':
    default:
      return endpointColorOf(type, isDark);
  }
}

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
      strokeWidth={1.9}
    />
  );
}

/**
 * Refined micro-node station marker sized for compact warehouse maps:
 * - Standard waypoints render as clean 14px precision concentric nodes.
 * - Landmarks (Charger, Park, Inbound, Outbound) render as soft-tinted 18px squircles.
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
          <Path d={arrowPath} fill={accentColor} opacity={0.9} />
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
            backgroundColor: selected ? accentColor : surface,
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
            borderRadius: 6,
            borderWidth: 1.3,
            borderColor: accentColor,
            backgroundColor: selected ? accentColor : `${baseColor}18`,
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
