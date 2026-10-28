import type { MapGeometry } from '../utils/mapCoordinates';
import { baseToWorld, metricStep, worldToBase, type MapFrame, type MapPoint } from './mapTransform';

/** Clip crossing lines, rather than discarding their out-of-map vertices. */
export function clipGridLine(a:MapPoint,b:MapPoint,frame:MapFrame):[MapPoint,MapPoint]|null {
  const dx=b.x-a.x,dy=b.y-a.y;
  let start=0,end=1;
  const p=[-dx,dx,-dy,dy],q=[a.x-frame.left,frame.left+frame.mapWidth-a.x,a.y-frame.top,frame.top+frame.mapHeight-a.y];
  for(let i=0;i<4;i++){
    if(p[i]===0){if(q[i]<0)return null;continue;}
    const t=q[i]/p[i];
    if(p[i]<0)start=Math.max(start,t);else end=Math.min(end,t);
    if(start>end)return null;
  }
  return [{x:a.x+dx*start,y:a.y+dy*start},{x:a.x+dx*end,y:a.y+dy*end}];
}

export function mapGridLines(map:MapGeometry,frame:MapFrame,zoom:number) {
  const corners=[[frame.left,frame.top],[frame.left+frame.mapWidth,frame.top],[frame.left,frame.top+frame.mapHeight],[frame.left+frame.mapWidth,frame.top+frame.mapHeight]].map(([x,y])=>baseToWorld({x,y},map,frame)!);
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const step=metricStep(map.resolution/(frame.scale*zoom));
  const result:{key:string;a:MapPoint;b:MapPoint;axis:boolean;label:string}[]=[];
  const add=(axis:'X'|'Y',i:number)=>{
    const value=i*step;
    const a=worldToBase(axis==='X'?{x:value,y:minY}:{x:minX,y:value},map,frame)!;
    const b=worldToBase(axis==='X'?{x:value,y:maxY}:{x:maxX,y:value},map,frame)!;
    const clipped=clipGridLine(a,b,frame);
    if(clipped)result.push({key:`${axis}${i}`,a:clipped[0],b:clipped[1],axis:i===0,label:`${axis} ${Number(value.toPrecision(6))} m`});
  };
  for(let i=Math.ceil(minX/step);i<=Math.floor(maxX/step)&&result.length<160;i++)add('X',i);
  for(let i=Math.ceil(minY/step);i<=Math.floor(maxY/step)&&result.length<160;i++)add('Y',i);
  return result;
}
