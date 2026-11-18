import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { code128Path, qrMatrix, qrPath } from './labels';

/** A QR code drawn as one SVG path (quiet zone of 2 modules), black on white whatever the theme. */
export function QrCodeView({ value, size = 160 }: { value: string; size?: number }) {
  const { d, modules } = useMemo(() => { const matrix = qrMatrix(value); return { d: qrPath(matrix), modules: matrix.size }; }, [value]);
  return <View style={{ width: size, height: size, backgroundColor: '#ffffff', borderRadius: 8, overflow: 'hidden' }} accessibilityLabel={`QR code ${value}`}>
    <Svg width={size} height={size} viewBox={`-2 -2 ${modules + 4} ${modules + 4}`}>
      <Rect x={-2} y={-2} width={modules + 4} height={modules + 4} fill="#ffffff" />
      <Path d={d} fill="#000000" />
    </Svg>
  </View>;
}

/** A Code 128 (set B) barcode, stretched to the given width. */
export function Code128View({ value, width = 240, height = 56 }: { value: string; width?: number; height?: number }) {
  const bars = useMemo(() => code128Path(value, 40), [value]);
  return <View style={{ width, height, backgroundColor: '#ffffff', borderRadius: 6, overflow: 'hidden' }} accessibilityLabel={`Barcode ${value}`}>
    <Svg width={width} height={height} viewBox={`0 0 ${bars.width} 40`} preserveAspectRatio="none">
      <Path d={bars.d} fill="#000000" />
    </Svg>
  </View>;
}
