import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { MapPin, ParkingSquare, X, Zap } from 'lucide-react-native';
import type { EndpointDto, MapVersionDetailDto } from '../api/navigationApi';
import { getApiBaseUrl } from '../api/client';
import type { RobotResponse } from '../types/contracts';
import { colors } from '../theme/colors';
import { Button, Text } from '../ui';
import { BottomSheet } from '../ui/BottomSheet';
import { resolveMapPreviewUri, worldToMapPercent } from '../utils/mapCoordinates';
import { BaseMapLayer } from './layers/BaseMapLayer';
import { InfrastructureLayer } from './layers/InfrastructureLayer';
import { RobotLayer } from './layers/RobotLayer';
import { GridLabels } from './layers/GridLabels';
import { MapAnchor } from './MapAnchor';
import { MapControl, MapHud } from './MapHud';
import { findMapModel, spacedLocations } from './mapModel';
import { mapRobotState, mapUpdateLabel, sampleAgeLabel, type MapUpdateMode } from './mapTelemetry';
import { createMapFrame, metricScale, worldToBase, type MapFrame } from './mapTransform';
import { zoneColor, zoneLabel } from './mapPresentation';
import { useMapCamera } from './hooks/useMapCamera';
import { useMapEnvironment } from './hooks/useMapEnvironment';

interface Props {
  map:MapVersionDetailDto; robots:RobotResponse[]; selectedRobot:string; onSelectRobot:(code:string)=>void;
  contentInsets?:{top:number;bottom:number}; title?:string;
  updateMode?:MapUpdateMode;
}
type LayerKey='stations'|'labels'|'zones'|'lanes'|'grid'|'scan';
const layerNames:Record<LayerKey,string>={stations:'Stations',labels:'Labels',zones:'Zones',lanes:'Lane Directions',grid:'Metric Grid',scan:'Original Scan'};

/** Shared presentation only: screens own API, auth, map identity and navigation. */
export function MapViewport({contentInsets={top:0,bottom:0},title='Warehouse Overview',...props}:Props) {
  const [bounds,setBounds]=useState({width:0,height:0});
  const [headerHeight,setHeaderHeight]=useState(68);
  const {map,robots,selectedRobot,updateMode='polling'}=props;
  const robot=robots.find(r=>r.currentMapVersionId===map.id&&r.code===selectedRobot);
  const available=Math.max(0,bounds.height-contentInsets.top-headerHeight-contentInsets.bottom-44);
  const horizontal=available<270;
  const stageHeight=Math.max(0,available-(horizontal?56:0));
  const stageWidth=Math.max(0,bounds.width-(horizontal?24:80));
  const frame=useMemo(()=>createMapFrame(map,stageWidth,stageHeight),[map.imageWidthPixels,map.imageHeightPixels,map.resolution,map.originX,map.originY,map.originYaw,stageWidth,stageHeight]);
  return <View style={styles.root} onLayout={event=>setBounds(event.nativeEvent.layout)}>
    <View style={[styles.heading,{top:contentInsets.top}]} onLayout={event=>setHeaderHeight(event.nativeEvent.layout.height)}>
      <Text variant="headline">{title}</Text><Text variant="caption">{map.code} · V{map.versionNo}</Text>
      <Text variant="caption">{robot?`${robot.code} · ${robot.isOnline?'Online':'Offline'} · ${mapUpdateLabel(updateMode)}`:robots.some(r=>r.currentMapVersionId===map.id)?`${mapUpdateLabel(updateMode)} · Select A Robot`:'No Robot Linked To This Map'}</Text>
    </View>
    {frame&&stageHeight>=96?<MapCanvas {...props} key={map.id} frame={frame} horizontal={horizontal} top={contentInsets.top+headerHeight+8}/>
      :<View style={[styles.smallState,{top:contentInsets.top+headerHeight,bottom:contentInsets.bottom}]}><Text variant="caption" textAlign="center">{frame?'Collapse the panel to explore the map.':'Map Calibration Unavailable'}</Text></View>}
  </View>;
}

function MapCanvas({map,robots,selectedRobot,onSelectRobot,frame,horizontal,top,updateMode='polling'}:Omit<Props,'contentInsets'|'title'>&{frame:MapFrame;horizontal:boolean;top:number}) {
  const {now,active,reducedMotion}=useMapEnvironment();
  const [following,setFollowing]=useState(false);
  const stopFollowing=useCallback(()=>setFollowing(false),[]);
  const identity=[map.id,map.resolution,map.originX,map.originY,map.originYaw,map.imageWidthPixels,map.imageHeightPixels].join(':');
  const camera=useMapCamera(frame,identity,reducedMotion,stopFollowing);
  const [layers,setLayers]=useState<Record<LayerKey,boolean>>({stations:true,labels:true,zones:true,lanes:true,grid:false,scan:false});
  const [sheet,setSheet]=useState<'layers'|'endpoint'|'robot'|null>(null);
  const [endpointId,setEndpointId]=useState<string|null>(null);
  const [labelsDetailed,setLabelsDetailed]=useState(false);
  const [imageAttempt,setImageAttempt]=useState(0);
  const [imageLoaded,setImageLoaded]=useState('');
  const [imageFailed,setImageFailed]=useState('');
  const model=useMemo(()=>findMapModel(map),[map]);
  const uri=resolveMapPreviewUri(map.previewImageUri,getApiBaseUrl());
  const imageKey=`${map.id}:${uri}:${imageAttempt}`;
  const loaded=useCallback(()=>setImageLoaded(imageKey),[imageKey]);
  const failed=useCallback(()=>setImageFailed(imageKey),[imageKey]);
  const robot=robots.find(r=>r.code===selectedRobot&&r.currentMapVersionId===map.id);
  const state=robot?mapRobotState(robot,map,now,updateMode):null;
  const endpoint=map.endpoints.find(e=>e.id===endpointId&&e.isEnabled&&e.mapVersionId===map.id);
  const scale=metricScale(map,frame,camera.settledZoom);
  const endpoints=useMemo(()=>map.endpoints.filter(e=>e.isEnabled&&e.mapVersionId===map.id).flatMap(endpoint=>{
    const percent=worldToMapPercent(endpoint.x,endpoint.y,map),p=worldToBase(endpoint,map,frame);
    return p&&percent&&percent.x>=0&&percent.x<=100&&percent.y>=0&&percent.y<=100?[{...p,endpoint}]:[];
  }),[map,frame]);
  const visibleEndpoints=useMemo(()=>spacedLocations([
    ...endpoints.filter(p=>p.endpoint.id===endpointId),...endpoints.filter(p=>p.endpoint.id!==endpointId),
  ],[],48/camera.settledZoom),[endpoints,endpointId,camera.settledZoom]);
  useEffect(()=>{setLabelsDetailed(value=>value?camera.settledZoom>=1.7:camera.settledZoom>=2);},[camera.settledZoom]);
  useEffect(()=>{setFollowing(false);},[selectedRobot,identity]);
  useEffect(()=>{
    if(!following)return;
    if(!active||!robot||!state?.canFollow){setFollowing(false);return;}
    const p=worldToBase({x:robot.poseX,y:robot.poseY},map,frame);
    if(p)camera.center(p);
  },[following,active,robot?.poseX,robot?.poseY,robot?.lastTelemetryAt,state?.canFollow,frame,camera.center,map]);
  const selectRobot=(code:string)=>{onSelectRobot(code);setSheet('robot');};
  const selectEndpoint=(item:EndpointDto)=>{if(Date.now()-camera.lastGestureAt>200){setEndpointId(item.id);setSheet('endpoint');}};
  const close=()=>setSheet(null);
  const raster=!model||layers.scan;

  return <>
    <View style={{position:'absolute',left:12,top:top+(horizontal?56:0),width:frame.width,height:frame.height,overflow:'hidden',borderRadius:12}}>
      <GestureDetector gesture={camera.gesture} touchAction="none">
        <View style={StyleSheet.absoluteFill} accessibilityLabel="Interactive warehouse map">
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,{transformOrigin:'0px 0px'},camera.sceneStyle]}>
            <BaseMapLayer map={map} frame={frame} model={model} scan={layers.scan} grid={layers.grid} zoom={camera.settledZoom} uri={uri} imageAttempt={imageAttempt} onImageLoad={loaded} onImageError={failed}/>
            <InfrastructureLayer map={map} frame={frame} zones={layers.zones} lanes={layers.lanes} zoom={camera.settledZoom}/>
          </Animated.View>
          {layers.grid?<GridLabels map={map} frame={frame} camera={camera}/>:null}
          {layers.stations?visibleEndpoints.map(({x,y,endpoint:item})=>{
            const Icon=item.endpointType==='CHARGER'?Zap:['PARK','PARKING'].includes(item.endpointType)?ParkingSquare:MapPin;
            return <MapAnchor key={item.id} point={{x,y}} camera={camera}>
              <MapControl label={`${item.name}, ${item.code}, ${item.endpointType}`} onPress={()=>selectEndpoint(item)} selected={endpointId===item.id} style={styles.station}>
                <View style={styles.stationGlyph}><Icon size={16} color={colors.primaryText}/></View>
              </MapControl>
            </MapAnchor>;
          }):null}
          {layers.labels?visibleEndpoints.filter(p=>labelsDetailed||p.endpoint.id===endpointId).map(({x,y,endpoint:item})=><MapAnchor key={`label-${item.id}`} point={{x,y}} camera={camera} width={110} height={24} passThrough>
            <Text variant="caption" fontWeight="600" numberOfLines={1} style={[styles.label,{marginTop:36}]}>{item.code}</Text>
          </MapAnchor>):null}
          <RobotLayer map={map} frame={frame} robots={robots} camera={camera} selected={selectedRobot} now={now} updateMode={updateMode} onSelect={selectRobot}/>
        </View>
      </GestureDetector>
      {raster&&uri&&imageLoaded!==imageKey&&imageFailed!==imageKey?<ActivityIndicator style={styles.loading} color={colors.primary} pointerEvents="none"/>:null}
      {raster&&(!uri||imageFailed===imageKey)?<View style={styles.imageError}><Text variant="caption" color="warningText">{uri?'Map Image Could Not Be Loaded':'No Preview Image · Geometry Only'}</Text>{uri?<Button title="Retry Image" variant="outline" size="sm" onPress={()=>setImageAttempt(v=>v+1)}/>:null}</View>:null}
    </View>
    <View style={horizontal?{position:'absolute',left:12,top,right:12}:{position:'absolute',right:12,top}}>
      <MapHud horizontal={horizontal} zoom={camera.settledZoom} following={following} canFollow={!!state?.canFollow&&active} onFit={camera.fit} onZoom={camera.zoomBy} onFollow={()=>setFollowing(value=>!value)} onLayers={()=>setSheet('layers')}/>
    </View>
    <View pointerEvents="none" style={[styles.footer,{top:top+(horizontal?56:0)+frame.height+6}]}>
      <View style={{gap:3}}><View style={{width:scale.width,height:5,borderWidth:1,borderTopWidth:0,borderColor:colors.textSecondary}}/><Text variant="caption">{scale.meters} m · {camera.settledZoom.toFixed(1)}×{layers.grid?' · World Grid (m)':''}</Text></View>
      <Text variant="caption" color={!layers.zones?'warningText':'textSecondary'} style={{flex:1,textAlign:'right'}}>{!layers.zones?'Zones Hidden':state?`${following?'Following · ':''}${state.label} · ${sampleAgeLabel(state.ageSeconds)}`:mapUpdateLabel(updateMode)}</Text>
    </View>
    {sheet?<BottomSheet onClose={close} accessibilityLabel="map details">
      <View style={styles.sheetHeading}><Text variant="headline" style={{flex:1}}>{sheet==='layers'?'Map Layers & Locations':sheet==='endpoint'?'Station Details':'Robot Position'}</Text><MapControl label="Close map details" onPress={close}><X size={20} color={colors.textPrimary}/></MapControl></View>
      <ScrollView contentContainerStyle={styles.sheetContent}>
        {sheet==='layers'?<>
          <Text variant="caption">{map.code} · {map.frameId} · {map.resolution} m/px · {mapUpdateLabel(updateMode)}</Text>
          {(Object.keys(layerNames) as LayerKey[]).map(key=><View key={key} style={styles.toggle}><Text style={{flex:1}}>{layerNames[key]}</Text><Switch accessibilityLabel={layerNames[key]} value={layers[key]} onValueChange={value=>setLayers(previous=>({...previous,[key]:value}))}/></View>)}
          {!layers.zones?<Text variant="body" color="warningText">Zones are hidden on the map.</Text>:null}
          <Text variant="headline">Zones</Text>
          {(map.zones||[]).filter(z=>z.mapVersionId===map.id&&z.isActive).map(z=><View key={z.id} style={styles.legend}><View style={[styles.swatch,{backgroundColor:zoneColor(z.zoneType)}]}/><Text variant="caption" style={{flex:1}}>{z.code} · {zoneLabel(z.zoneType)}</Text></View>)}
          <Text variant="headline">Robots On This Map</Text>
          {!robots.some(r=>r.currentMapVersionId===map.id)?<Text>No Robot Linked To This Map</Text>:null}
          {robots.filter(r=>r.currentMapVersionId===map.id).map(r=><Button key={r.id} title={`${r.code} · ${mapRobotState(r,map,now,updateMode).label}`} variant="outline" onPress={()=>selectRobot(r.code)}/>)}
          {robots.some(r=>r.currentMapVersionId!==map.id)?<>
            <Text variant="headline">Robots On Other Maps</Text>
            <Text variant="caption">These robots are not positioned on the map you are viewing.</Text>
            {robots.filter(r=>r.currentMapVersionId!==map.id).map(r=><View key={r.id} style={{gap:4}}>
              <Text variant="bodyMedium">{r.code} · {r.isOnline?'Online':'Offline'}</Text>
              <Text variant="caption">Assigned Map: {r.currentMapVersionId}</Text>
              {r.mapVersionCode?<Text variant="caption">Reported Map: {r.mapVersionCode}</Text>:null}
            </View>)}
          </>:null}
          <Text variant="headline">All Stations</Text>
          <Text variant="caption">Nearby markers are reduced at low zoom. Every enabled station is listed here.</Text>
          {map.endpoints.filter(e=>e.isEnabled&&e.mapVersionId===map.id).map(e=><Button key={e.id} title={`${e.code} · ${e.name}`} variant="outline" onPress={()=>{setEndpointId(e.id);setSheet('endpoint');}}/>)}
        </>:sheet==='endpoint'&&endpoint?<>
          <Text variant="title">{endpoint.name}</Text><Text>{endpoint.code} · {endpoint.endpointType}</Text><Text variant="code">X {endpoint.x.toFixed(3)} m · Y {endpoint.y.toFixed(3)} m</Text><Text>Yaw {endpoint.yaw.toFixed(3)} rad</Text>
          <Button title="Locate Station" variant="outline" onPress={()=>{const p=worldToBase(endpoint,map,frame);if(p){stopFollowing();camera.center(p);}close();}}/>
          <Button title="All Layers & Locations" variant="ghost" onPress={()=>setSheet('layers')}/>
        </>:sheet==='robot'&&robot&&state?<>
          <Text variant="title">{robot.code}</Text><Text>{robot.status} · {robot.navigationStatus}</Text><Text>{robot.localizationStatus} · {state.label}</Text>
          <Text variant="caption">{robot.lastTelemetryAt?`Reported ${robot.lastTelemetryAt}`:'No Telemetry Timestamp'} · {sampleAgeLabel(state.ageSeconds)}</Text>
          <Text variant="code">X {robot.poseX.toFixed(3)} m · Y {robot.poseY.toFixed(3)} m</Text><Text>Yaw {robot.poseYaw.toFixed(3)} rad · Battery {Math.round(robot.batteryPercent)}%</Text>
          <Button title="Follow Robot" disabled={!state.canFollow||!active} onPress={()=>{setFollowing(true);close();}}/>
        </>:<Text>The selected object is no longer available on this map.</Text>}
      </ScrollView>
    </BottomSheet>:null}
  </>;
}
const styles=StyleSheet.create({
  root:{...StyleSheet.absoluteFill,backgroundColor:colors.background,overflow:'hidden'},
  heading:{position:'absolute',left:16,right:16,gap:3,paddingTop:8,paddingBottom:6},smallState:{position:'absolute',left:24,right:24,justifyContent:'center'},
  station:{backgroundColor:'transparent',borderColor:'transparent',borderRadius:24},
  stationGlyph:{width:28,height:28,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface,borderRadius:14,borderWidth:1,borderColor:colors.borderStrong},
  label:{backgroundColor:colors.surface,paddingHorizontal:4,paddingVertical:2,borderRadius:4,textAlign:'center'},
  footer:{position:'absolute',left:16,right:16,flexDirection:'row',alignItems:'center',gap:10},
  loading:{position:'absolute',left:12,top:12},imageError:{position:'absolute',left:8,right:8,top:8,gap:8,padding:10,backgroundColor:colors.warningBg,borderRadius:8},
  sheetHeading:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,gap:8},sheetContent:{padding:20,gap:12,paddingBottom:32},
  toggle:{flexDirection:'row',alignItems:'center',minHeight:48,gap:12},legend:{flexDirection:'row',alignItems:'center',gap:10},swatch:{width:16,height:16,borderRadius:4},
});
