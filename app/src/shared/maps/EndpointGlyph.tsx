import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Signpost, SquareParking, Zap } from 'lucide-react-native';
import type { EndpointJobRole } from './mapLabels';
import { JOB_HIGHLIGHT_COLOR, endpointColorOf, endpointKind } from './mapStyle';

const ICONS = { WAYPOINT: Signpost, CHARGER: Zap, PARK: SquareParking } as const;

/** The web console's endpoint icon (Lucide signpost / zap / square-parking) in its type colour. */
export function EndpointIcon({
  type,
  size = 16,
  isDark = false,
  color,
}: {
  type: string;
  size?: number;
  isDark?: boolean;
  color?: string;
}) {
  const Icon = ICONS[endpointKind(type)];
  return <Icon size={size} color={color ?? endpointColorOf(type, isDark)} strokeWidth={2.2} />;
}

/**
 * OTTO-inspired dock/station tile: crisp bordered badge with arrival heading wedge,
 * dashed dock halo for chargers, and high-visibility ring when acting as Job Pickup/Dropoff.
 */
export function EndpointTile({
  type,
  headingDeg,
  selected,
  isDark,
  surface,
  jobRole = null,
}: {
  type: string;
  headingDeg: number;
  selected: boolean;
  isDark: boolean;
  surface: string;
  jobRole?: EndpointJobRole | null;
}) {
  const baseColor = endpointColorOf(type, isDark);
  const accentColor = jobRole ? JOB_HIGHLIGHT_COLOR[jobRole] : baseColor;
  const isCharger = endpointKind(type) === 'CHARGER';

  return (
    <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', width: 42, height: 42, transform: [{ rotate: `${headingDeg}deg` }] }}
      >
        <Svg width={42} height={42} viewBox="-21 -21 42 42">
          <Path d="M20.5 0 L14 -4 L14 4 Z" fill={accentColor} opacity={0.92} />
        </Svg>
      </View>

      {jobRole ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 2,
            borderColor: accentColor,
            backgroundColor: `${accentColor}22`,
          }}
        />
      ) : isCharger ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 34,
            height: 34,
            borderRadius: 11,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: `${baseColor}99`,
          }}
        />
      ) : null}

      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: accentColor,
            opacity: 0.2,
          }}
        />
      ) : null}

      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: accentColor,
          backgroundColor: selected ? accentColor : surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <EndpointIcon
          type={type}
          size={14}
          isDark={isDark}
          color={selected ? '#ffffff' : baseColor}
        />
      </View>
    </View>
  );
}
