import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { Text } from '../../ui';
import { colors } from '../../theme/colors';
import { MapAnchor } from '../MapAnchor';
import { mapGridLines } from '../mapGrid';
import { spacedLocations } from '../mapModel';
import type { MapFrame } from '../mapTransform';
import type { MapCameraController } from '../hooks/useMapCamera';

export const GridLabels=memo(function GridLabels({map,frame,camera}:{map:MapVersionDetailDto;frame:MapFrame;camera:MapCameraController}) {
  const labels=useMemo(()=>spacedLocations(mapGridLines(map,frame,camera.settledZoom).map(line=>{
    const dx=line.b.x-line.a.x,dy=line.b.y-line.a.y,length=Math.hypot(dx,dy);
    const inset=Math.min(length/2,36/camera.settledZoom);
    return {x:line.a.x+(length?dx/length*inset:0),y:line.a.y+(length?dy/length*inset:0),label:line.label,key:line.key};
  }),[],56/camera.settledZoom),[map,frame,camera.settledZoom]);
  return <View style={StyleSheet.absoluteFill} pointerEvents="none">{labels.map(label=><MapAnchor key={label.key} camera={camera} point={label} width={72} height={22} passThrough>
    <Text variant="caption" style={{backgroundColor:colors.surface,textAlign:'center',borderRadius:3}}>{label.label}</Text>
  </MapAnchor>)}</View>;
});
