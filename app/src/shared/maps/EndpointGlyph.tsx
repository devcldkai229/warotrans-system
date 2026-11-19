import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Signpost, SquareParking, Zap } from 'lucide-react-native';
import { endpointColorOf, endpointKind } from './mapStyle';

const ICONS = { WAYPOINT: Signpost, CHARGER: Zap, PARK: SquareParking } as const;

/** The web console's endpoint icon (Lucide signpost / zap / square-parking) in its type colour. */
export function EndpointIcon({ type, size = 16, isDark = false, color }: { type: string; size?: number; isDark?: boolean; color?: string }) {
  const Icon = ICONS[endpointKind(type)];
  return <Icon size={size} color={color ?? endpointColorOf(type, isDark)} strokeWidth={2.2} />;
}

/**
 * Endpoint marker as on the web map: a rounded tile outlined in the type colour, the type icon inside, and a wedge
 * that points along the arrival heading (`headingDeg`, clockwise on screen).
 */
export function EndpointTile({ type, headingDeg, selected, isDark, surface }: { type: string; headingDeg: number; selected: boolean; isDark: boolean; surface: string }) {
  const color = endpointColorOf(type, isDark);
  return <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
    <View pointerEvents="none" style={{ position: 'absolute', width: 40, height: 40, transform: [{ rotate: `${headingDeg}deg` }] }}>
      <Svg width={40} height={40} viewBox="-20 -20 40 40"><Path d="M19 0 L13 -4 L13 4 Z" fill={color} opacity={0.85} /></Svg>
    </View>
    {selected ? <View pointerEvents="none" style={{ position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: color, opacity: 0.16 }} /> : null}
    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: color, backgroundColor: selected ? color : surface, alignItems: 'center', justifyContent: 'center' }}>
      <EndpointIcon type={type} size={14} isDark={isDark} color={selected ? '#ffffff' : color} />
    </View>
  </View>;
}
