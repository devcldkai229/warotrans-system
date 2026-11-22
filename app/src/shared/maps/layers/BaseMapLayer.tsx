import React, { memo, useMemo } from 'react';
import { Image, Platform, StyleSheet, View, type ImageStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { useTheme } from '../../theme/ThemeContext';
import type { MapModel } from '../mapModel';
import { type MapFrame } from '../mapTransform';
import { worldToMapPercent } from '../../utils/mapCoordinates';
import { mapGridLines } from '../mapGrid';

interface Props {
  map: MapVersionDetailDto;
  frame: MapFrame;
  model: MapModel | null;
  scan: boolean;
  grid: boolean;
  zoom: number;
  uri: string | null;
  imageAttempt: number;
  onImageLoad: () => void;
  onImageError: () => void;
}

export const BaseMapLayer = memo(function BaseMapLayer({
  map,
  frame,
  model,
  scan,
  grid,
  zoom,
  uri,
  imageAttempt,
  onImageLoad,
  onImageError,
}: Props) {
  const { colors, isDark } = useTheme();
  const raster = !model || scan;
  const clip = `map-floor-${map.id}`;
  const transform = `translate(${frame.left + (frame.rotated ? frame.mapWidth : 0)} ${frame.top}) ${frame.rotated ? 'rotate(90)' : ''} scale(${frame.scale})`;
  const safeZoom = Math.max(1, zoom);
  const hairline = 0.8 / Math.max(1e-6, frame.scale * safeZoom);
  const dashUnit = 3 / Math.max(1e-6, frame.scale * safeZoom);

  const worldRectangle = (x0: number, y0: number, x1: number, y1: number) =>
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
      .map(([x, y], i) => {
        const p = worldToMapPercent(x, y, map)!;
        return `${i ? 'L' : 'M'}${p.x * map.imageWidthPixels / 100},${p.y * map.imageHeightPixels / 100}`;
      })
      .join(' ') + ' Z';

  const lines = useMemo(() => (grid ? mapGridLines(map, frame, zoom) : []), [map, frame, grid, zoom]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={{
          position: 'absolute',
          left: frame.left,
          top: frame.top,
          width: frame.mapWidth,
          height: frame.mapHeight,
          backgroundColor: model && !scan ? colors.mapFloor : isDark ? colors.mapFloor : colors.surface,
          overflow: 'hidden',
        }}
      >
        {raster && uri ? (
          <View style={[StyleSheet.absoluteFill, isDark ? styles.darkRasterFilter : null]}>
            <Image
              key={`${map.id}:${uri}:${imageAttempt}`}
              source={{ uri }}
              accessibilityLabel={`Published occupancy map ${map.code}`}
              onLoad={onImageLoad}
              onError={onImageError}
              resizeMode="stretch"
              style={[
                {
                  position: 'absolute',
                  width: map.imageWidthPixels * frame.scale,
                  height: map.imageHeightPixels * frame.scale,
                  left: (frame.mapWidth - map.imageWidthPixels * frame.scale) / 2,
                  top: (frame.mapHeight - map.imageHeightPixels * frame.scale) / 2,
                  transform: [{ rotate: frame.rotated ? '90deg' : '0deg' }],
                },
                Platform.OS === 'web'
                  ? ({ imageRendering: 'pixelated' } as unknown as ImageStyle)
                  : null,
              ]}
            />
          </View>
        ) : null}
      </View>

      <Svg
        style={StyleSheet.absoluteFill}
        width={frame.width}
        height={frame.height}
        accessibilityLabel={model && !scan ? 'Warehouse operational model' : 'Warehouse base map'}
      >
        <Defs>
          <ClipPath id={clip}>
            <Rect x={frame.left} y={frame.top} width={frame.mapWidth} height={frame.mapHeight} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clip})`}>
          {model && !scan ? (
            <G transform={transform}>
              {model.unknown.map(([x, y, width, height], i) => (
                <Rect key={`u${i}`} x={x} y={y} width={width} height={height} fill={colors.mapUnknown} />
              ))}
              {model.floorPaint?.map(area => {
                const isInbound = area.name === 'inbound';
                const isOutbound = area.name === 'outbound';
                const fill = isInbound
                  ? 'rgba(16, 185, 129, 0.14)'
                  : isOutbound
                  ? 'rgba(245, 158, 11, 0.14)'
                  : colors.primaryLight;
                const stroke = isInbound ? '#10b981' : isOutbound ? '#f59e0b' : colors.primary;
                return (
                  <Path
                    key={area.name}
                    d={worldRectangle(area.x0, area.y0, area.x1, area.y1)}
                    fill={fill}
                    stroke={stroke}
                    strokeOpacity={0.5}
                    strokeWidth={hairline}
                    strokeDasharray={`${dashUnit} ${dashUnit}`}
                  />
                );
              })}
              {model.occupied.map(([x, y, width, height], i) => (
                <Rect key={`o${i}`} x={x} y={y} width={width} height={height} fill={colors.mapWall} />
              ))}
              {model.shelves?.map(rack => {
                const x0 = rack.x - rack.sx / 2;
                const x1 = rack.x + rack.sx / 2;
                const y0 = rack.y - rack.sy / 2;
                const y1 = rack.y + rack.sy / 2;
                const inset = map.resolution;
                return (
                  <G key={rack.code}>
                    <Path
                      d={worldRectangle(x0, y0, x1, y1)}
                      fill={colors.mapShelfStroke}
                      stroke={colors.mapShelfStroke}
                      strokeWidth={hairline}
                    />
                    {Array.from({ length: rack.levels }, (_, i) => {
                      const a = y0 + (i * rack.sy) / rack.levels + inset;
                      const b = y0 + ((i + 1) * rack.sy) / rack.levels - inset;
                      return b > a ? (
                        <Path key={i} d={worldRectangle(x0 + inset, a, x1 - inset, b)} fill={colors.mapRack} />
                      ) : null;
                    })}
                  </G>
                );
              })}
            </G>
          ) : null}
          {lines.map(line => (
            <Line
              key={line.key}
              x1={line.a.x}
              y1={line.a.y}
              x2={line.b.x}
              y2={line.b.y}
              stroke={line.axis ? colors.info : colors.mapGrid}
              strokeOpacity={line.axis ? 0.65 : 0.75}
              strokeWidth={(line.axis ? 1 : 0.65) / safeZoom}
              strokeDasharray={line.axis ? undefined : `${2 / safeZoom} ${3 / safeZoom}`}
            />
          ))}
        </G>
        <Rect
          x={frame.left}
          y={frame.top}
          width={frame.mapWidth}
          height={frame.mapHeight}
          fill="none"
          stroke={isDark ? 'rgba(204, 212, 222, 0.28)' : colors.borderStrong}
          strokeWidth={(isDark ? 1 : 1.2) / safeZoom}
        />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  darkRasterFilter: {
    filter: 'invert(0.73) contrast(1.12) brightness(1.02)',
  },
});
