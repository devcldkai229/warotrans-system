import React, { memo } from 'react';
import Svg, { ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { colors } from '../../theme/colors';
import { zoneColor } from '../mapPresentation';
import { worldToBase, type MapFrame, type MapPoint } from '../mapTransform';

interface Props { map: MapVersionDetailDto; frame: MapFrame; zones: boolean; lanes: boolean; zoom: number }
export const InfrastructureLayer = memo(function InfrastructureLayer({map,frame,zones,lanes,zoom}: Props) {
  const clip=`infrastructure-${map.id}`;
  const point=(p:number[])=>worldToBase({x:p[0],y:p[1]},map,frame);
  const path=(points:MapPoint[])=>points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  return <Svg width={frame.width} height={frame.height} style={{position:'absolute'}} pointerEvents="none" accessibilityLabel="Configured lanes and zones">
    <Defs><ClipPath id={clip}><Rect x={frame.left} y={frame.top} width={frame.mapWidth} height={frame.mapHeight} /></ClipPath></Defs>
    <G clipPath={`url(#${clip})`}>
      {zones ? (map.zones||[]).filter(z=>z.mapVersionId===map.id&&z.isActive&&z.geometry.type==='Polygon').map(zone=>{
        const rings=zone.geometry.coordinates.map(ring=>ring.map(point));
        if(!rings.length||rings.some(ring=>ring.length<4||ring.some(p=>!p)))return null;
        return <Path key={zone.id} d={rings.map(ring=>path(ring as MapPoint[])+' Z').join(' ')} fillRule="evenodd"
          fill={zoneColor(zone.zoneType)} fillOpacity={zone.zoneType==='KEEP_OUT'?0.16:0.07} stroke={zoneColor(zone.zoneType)}
          strokeWidth={1/zoom} strokeDasharray={zone.zoneType==='KEEP_OUT'?undefined:`${4/zoom} ${4/zoom}`} />;
      }):null}
      {lanes ? (map.edges||[]).filter(e=>e.mapVersionId===map.id&&e.isActive&&e.geometry.type==='LineString').map(edge=>{
        const points=edge.geometry.coordinates.map(point);
        if(points.length<2||points.some(p=>!p))return null;
        const valid=points as MapPoint[];
        const arrows:string[]=[];
        for(let i=1;i<valid.length;i++) {
          const a=valid[i-1],b=valid[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
          if(length<8/zoom)continue;
          const ux=dx/length,uy=dy/length,size=4/zoom;
          const arrow=(cx:number,cy:number,direction:number)=>`M${cx-direction*ux*size-uy*size},${cy-direction*uy*size+ux*size} L${cx},${cy} L${cx-direction*ux*size+uy*size},${cy-direction*uy*size-ux*size}`;
          const count=Math.min(20,Math.max(1,Math.floor(length*zoom/64)));
          for(let j=1;j<=count;j++){
            const t=j/(count+1),cx=a.x+dx*t,cy=a.y+dy*t;
            arrows.push(arrow(cx,cy,1));
            if(edge.direction==='BIDIRECTIONAL')arrows.push(arrow(cx-ux*12/zoom,cy-uy*12/zoom,-1));
          }
        }
        return <G key={edge.id}><Path d={path(valid)} fill="none" stroke={colors.borderDark} strokeWidth={1.3/zoom} strokeDasharray={`${4/zoom} ${4/zoom}`} />
          <Path d={arrows.join(' ')} fill="none" stroke={colors.textSecondary} strokeWidth={1.2/zoom} />
        </G>;
      }):null}
    </G>
  </Svg>;
});
