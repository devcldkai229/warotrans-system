import React from 'react';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { MapCameraController } from './hooks/useMapCamera';
import type { MapPoint } from './mapTransform';

/** Screen-sized markers share the scene camera without scaling their hit targets. */
export function MapAnchor({point,camera,width=48,height=48,children,passThrough=false}:{point:MapPoint;camera:MapCameraController;width?:number;height?:number;children:React.ReactNode;passThrough?:boolean}) {
  const {zoom,x,y}=camera;
  const pointX=point.x,pointY=point.y;
  const position=useAnimatedStyle(()=>({transform:[
    {translateX:pointX*zoom.get()+x.get()-width/2},
    {translateY:pointY*zoom.get()+y.get()-height/2},
  ]}),[pointX,pointY,zoom,x,y,width,height]);
  return <Animated.View pointerEvents={passThrough?'none':'box-none'} style={[{position:'absolute',left:0,top:0,width,height},position]}>{children}</Animated.View>;
}
