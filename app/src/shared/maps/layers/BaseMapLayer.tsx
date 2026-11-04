import React, { memo, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { colors } from '../../theme/colors';
import type { MapModel } from '../mapModel';
import { type MapFrame } from '../mapTransform';
import { worldToMapPercent } from '../../utils/mapCoordinates';
import { mapGridLines } from '../mapGrid';

interface Props {
  map: MapVersionDetailDto; frame: MapFrame; model: MapModel | null;
  scan: boolean; grid: boolean; zoom: number; uri: string | null; imageAttempt: number;
  onImageLoad: () => void; onImageError: () => void;
}

export const BaseMapLayer = memo(function BaseMapLayer({map,frame,model,scan,grid,zoom,uri,imageAttempt,onImageLoad,onImageError}: Props) {
  const raster = !model || scan;
  const clip = `map-floor-${map.id}`;
  const transform = `translate(${frame.left+(frame.rotated ? frame.mapWidth : 0)} ${frame.top}) ${frame.rotated ? 'rotate(90)' : ''} scale(${frame.scale})`;
  const worldRectangle=(x0:number,y0:number,x1:number,y1:number)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y],i)=>{
    const p=worldToMapPercent(x,y,map)!;
    return `${i?'L':'M'}${p.x*map.imageWidthPixels/100},${p.y*map.imageHeightPixels/100}`;
  }).join(' ')+' Z';
  const lines=useMemo(()=>grid?mapGridLines(map,frame,zoom):[],[map,frame,grid,zoom]);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={{position:'absolute',left:frame.left,top:frame.top,width:frame.mapWidth,height:frame.mapHeight,backgroundColor:colors.surface,overflow:'hidden'}}>
      {raster && uri ? <Image key={`${map.id}:${uri}:${imageAttempt}`} source={{uri}} accessibilityLabel={`Published occupancy map ${map.code}`}
        onLoad={onImageLoad} onError={onImageError} resizeMode="stretch"
        style={{position:'absolute',width:map.imageWidthPixels*frame.scale,height:map.imageHeightPixels*frame.scale,
          left:(frame.mapWidth-map.imageWidthPixels*frame.scale)/2,top:(frame.mapHeight-map.imageHeightPixels*frame.scale)/2,
          transform:[{rotate:frame.rotated?'90deg':'0deg'}]}} /> : null}
    </View>
    <Svg style={StyleSheet.absoluteFill} width={frame.width} height={frame.height} accessibilityLabel={model&&!scan?'Warehouse operational model':'Warehouse base map'}>
      <Defs><ClipPath id={clip}><Rect x={frame.left} y={frame.top} width={frame.mapWidth} height={frame.mapHeight} /></ClipPath></Defs>
      <G clipPath={`url(#${clip})`}>
        {model&&!scan ? <G transform={transform}>
          {model.unknown.map(([x,y,width,height],i)=><Rect key={`u${i}`} {...{x,y,width,height}} fill={colors.surfaceMuted} />)}
          {model.floorPaint?.map(area=><Path key={area.name} d={worldRectangle(area.x0,area.y0,area.x1,area.y1)} fill={area.name==='inbound'?colors.successBg:area.name==='outbound'?colors.warningBg:colors.primaryLight}/>)}
          {model.occupied.map(([x,y,width,height],i)=><Rect key={`o${i}`} {...{x,y,width,height}} fill={colors.mapRack} />)}
          {model.shelves?.map(rack=>{
            const x0=rack.x-rack.sx/2,x1=rack.x+rack.sx/2,y0=rack.y-rack.sy/2,y1=rack.y+rack.sy/2;
            const inset=map.resolution;
            return <G key={rack.code}><Path d={worldRectangle(x0,y0,x1,y1)} fill={colors.darkAction}/>
              {Array.from({length:rack.levels},(_,i)=>{
                const a=y0+i*rack.sy/rack.levels+inset,b=y0+(i+1)*rack.sy/rack.levels-inset;
                return b>a?<Path key={i} d={worldRectangle(x0+inset,a,x1-inset,b)} fill={colors.mapRack}/>:null;
              })}
            </G>;
          })}
        </G> : null}
        {lines.map(line=><Line key={line.key} x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y}
          stroke={line.axis?colors.info:colors.mapGrid} strokeWidth={(line.axis?1:0.65)/zoom} strokeDasharray={line.axis?undefined:`${2/zoom} ${3/zoom}`} />)}
      </G>
      <Rect x={frame.left} y={frame.top} width={frame.mapWidth} height={frame.mapHeight} fill="none" stroke={colors.borderStrong} strokeWidth={1/zoom} />
    </Svg>
  </View>;
});
