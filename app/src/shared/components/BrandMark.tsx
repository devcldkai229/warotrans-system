import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

interface BrandMarkProps {
  size?: number;
  style?: ViewStyle;
}

export function BrandMark({ size = 40, style }: BrandMarkProps) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <Defs>
          <LinearGradient
            id="waroBrandBlueGrad"
            x1="0"
            y1="0"
            x2="64"
            y2="64"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0%" stopColor="#0284C7" />
            <Stop offset="100%" stopColor="#1E40AF" />
          </LinearGradient>
        </Defs>

        {/* Industrial Rounded Brandmark Base */}
        <Rect width="64" height="64" rx="14" fill="url(#waroBrandBlueGrad)" />

        {/* WaroTrans Autonomous Nav2 Route & Waypoint Architecture */}
        <G
          transform="translate(10, 10) scale(1.833)"
          stroke="#FFFFFF"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          {/* Start Waypoint Node (Sky Blue) */}
          <Circle
            cx="6"
            cy="19"
            r="3"
            fill="#38BDF8"
            stroke="#FFFFFF"
            strokeWidth={2}
          />

          {/* Autonomous Nav2 Route Trajectory Path */}
          <Path
            d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"
            stroke="#FFFFFF"
            strokeWidth={2.6}
          />

          {/* Target Destination Node (Emerald Green) */}
          <Circle
            cx="18"
            cy="5"
            r="3"
            fill="#22C55E"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        </G>
      </Svg>
    </View>
  );
}
