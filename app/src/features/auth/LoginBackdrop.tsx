import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

interface ParticleDot {
  x: number;
  y: number;
  r: number;
  o: number;
}

function buildWaveDots(): ParticleDot[] {
  const dots: ParticleDot[] = [];

  // Primary 3D undulating particle field across the lower atmosphere.
  const cols = 30;
  const rows = 18;
  for (let row = 0; row < rows; row++) {
    const v = row / (rows - 1);
    for (let col = 0; col < cols; col++) {
      const u = (col / (cols - 1)) * 2 - 1;
      const wave =
        Math.sin(u * 2.5 + v * 1.9) * 0.55 +
        Math.cos(u * 1.35 - v * 2.7) * 0.45;
      const hill =
        Math.exp(-Math.pow((u - 0.05) / 0.54, 2)) * (1 - v * 0.42);
      const x = 200 + u * (195 + v * 58);
      const y = 568 + v * 232 - wave * 24 - hill * 44;

      const topFade = Math.min(1, v / 0.24);
      const sideFade = Math.max(0, 1 - Math.pow(Math.abs(u), 2.3));
      const crest = 0.38 + 0.62 * hill + 0.25 * Math.max(0, wave);
      const opacity = Math.min(0.42, topFade * sideFade * crest * 0.36);

      if (opacity >= 0.045 && x >= -10 && x <= 410 && y >= 480 && y <= 805) {
        dots.push({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          r: Math.round((0.65 + (0.45 * v + 0.2 * crest)) * 100) / 100,
          o: Math.round(opacity * 1000) / 1000,
        });
      }
    }
  }

  // Secondary right-side foreground ribbon for gentle depth layering.
  const subCols = 14;
  const subRows = 10;
  for (let row = 0; row < subRows; row++) {
    const v = row / (subRows - 1);
    for (let col = 0; col < subCols; col++) {
      const t = col / (subCols - 1);
      const u = 0.22 + t * 0.83;
      const ripple = Math.sin(t * 2.8 + v * 2.1) * 14;
      const arc = Math.cos((t - 0.35) * 2.2) * 18;
      const x = 200 + u * 195 + (v - 0.5) * 18;
      const y = 626 + v * 165 - ripple - arc * (1 - v * 0.35);

      const env =
        Math.sin(Math.min(1, t) * Math.PI) *
        Math.min(1, v / 0.25) *
        (1 - v * 0.25);
      const opacity = Math.min(0.32, env * 0.32);

      if (opacity >= 0.045 && x >= -10 && x <= 410 && y >= 610 && y <= 795) {
        dots.push({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          r: Math.round((0.68 + 0.32 * v) * 100) / 100,
          o: Math.round(opacity * 1000) / 1000,
        });
      }
    }
  }

  return dots;
}

const WAVE_DOTS = buildWaveDots();

/**
 * Antigravity-inspired Login Backdrop.
 *
 * Keeps the upper workspace crisp and solid (`#ffffff` in Light Mode,
 * `#0f1218` in Dark Mode) while bathing the lower half in multi-lobe
 * sky/periwinkle mist and a delicate 3D particle wave contour.
 */
export const LoginBackdrop = memo(function LoginBackdrop({
  isDark,
}: {
  isDark: boolean;
}) {
  const baseColor = isDark ? '#0f1218' : '#ffffff';
  const dotColor = isDark ? '#7dd3fc' : '#2b5cc4';
  const dotScale = isDark ? 0.85 : 0.92;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMax slice"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          <LinearGradient
            id={isDark ? 'agBottomDark' : 'agBottomLight'}
            x1="50%"
            y1={isDark ? '48%' : '46%'}
            x2="50%"
            y2="100%"
          >
            <Stop offset="0" stopColor={baseColor} stopOpacity="1" />
            <Stop
              offset={isDark ? '0.50' : '0.48'}
              stopColor={isDark ? '#101b2d' : '#eef7ff'}
              stopOpacity="1"
            />
            <Stop
              offset="0.84"
              stopColor={isDark ? '#102036' : '#ddf0ff'}
              stopOpacity="1"
            />
            <Stop
              offset="1"
              stopColor={isDark ? '#0f233c' : '#cde8ff'}
              stopOpacity="1"
            />
          </LinearGradient>

          <RadialGradient
            id={isDark ? 'agLeftSkyDark' : 'agLeftSkyLight'}
            cx="12%"
            cy="94%"
            rx="64%"
            ry="42%"
            r="52%"
          >
            <Stop
              offset="0"
              stopColor={isDark ? '#0ea5e9' : '#7dd3fc'}
              stopOpacity={isDark ? '0.28' : '0.56'}
            />
            <Stop
              offset="0.52"
              stopColor={isDark ? '#0284c7' : '#bae6fd'}
              stopOpacity={isDark ? '0.11' : '0.26'}
            />
            <Stop offset="1" stopColor={baseColor} stopOpacity="0" />
          </RadialGradient>

          <RadialGradient
            id={isDark ? 'agPeriwinkleDark' : 'agPeriwinkleLight'}
            cx="52%"
            cy="88%"
            rx="56%"
            ry="38%"
            r="48%"
          >
            <Stop
              offset="0"
              stopColor={isDark ? '#6366f1' : '#93b4ff'}
              stopOpacity={isDark ? '0.24' : '0.40'}
            />
            <Stop
              offset="0.55"
              stopColor={isDark ? '#3b82f6' : '#c7d7fe'}
              stopOpacity={isDark ? '0.10' : '0.18'}
            />
            <Stop offset="1" stopColor={baseColor} stopOpacity="0" />
          </RadialGradient>

          <RadialGradient
            id={isDark ? 'agRightCyanDark' : 'agRightCyanLight'}
            cx="90%"
            cy="95%"
            rx="58%"
            ry="40%"
            r="50%"
          >
            <Stop
              offset="0"
              stopColor={isDark ? '#38bdf8' : '#72d5ff'}
              stopOpacity={isDark ? '0.26' : '0.54'}
            />
            <Stop
              offset="0.55"
              stopColor={isDark ? '#0ea5e9' : '#bae6fd'}
              stopOpacity={isDark ? '0.10' : '0.24'}
            />
            <Stop offset="1" stopColor={baseColor} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={400} height={800} fill={baseColor} />
        <Rect
          x={0}
          y={0}
          width={400}
          height={800}
          fill={`url(#${isDark ? 'agBottomDark' : 'agBottomLight'})`}
        />
        <Rect
          x={0}
          y={0}
          width={400}
          height={800}
          fill={`url(#${isDark ? 'agLeftSkyDark' : 'agLeftSkyLight'})`}
        />
        <Rect
          x={0}
          y={0}
          width={400}
          height={800}
          fill={`url(#${isDark ? 'agPeriwinkleDark' : 'agPeriwinkleLight'})`}
        />
        <Rect
          x={0}
          y={0}
          width={400}
          height={800}
          fill={`url(#${isDark ? 'agRightCyanDark' : 'agRightCyanLight'})`}
        />

        {WAVE_DOTS.map((dot, idx) => (
          <Circle
            key={idx}
            cx={dot.x}
            cy={dot.y}
            r={dot.r}
            fill={dotColor}
            fillOpacity={dot.o * dotScale}
          />
        ))}
      </Svg>
    </View>
  );
});
