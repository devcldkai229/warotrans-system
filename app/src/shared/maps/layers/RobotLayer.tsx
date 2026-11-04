import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { RobotResponse } from '../../types/contracts';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { colors } from '../../theme/colors';
import { Text } from '../../ui';
import { MapAnchor } from '../MapAnchor';
import { mapHeading } from '../mapModel';
import { mapRobotState, type MapUpdateMode } from '../mapTelemetry';
import { worldToBase, type MapFrame } from '../mapTransform';
import type { MapCameraController } from '../hooks/useMapCamera';
import { MapControl } from '../MapHud';

interface Props {map:MapVersionDetailDto;frame:MapFrame;robots:RobotResponse[];camera:MapCameraController;selected:string;now:number;updateMode?:MapUpdateMode;onSelect:(code:string)=>void}
export function RobotLayer({map,frame,robots,camera,selected,now,updateMode='polling',onSelect}:Props) {
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{robots.filter(robot=>robot.currentMapVersionId===map.id).map(robot=>{
    const state=mapRobotState(robot,map,now,updateMode),point=worldToBase({x:robot.poseX,y:robot.poseY},map,frame);
    if(!state.showPose||!point)return null;
    const tone=state.lastReported?colors.textMuted:robot.status==='ERROR'?colors.danger:robot.status==='CHARGING'?colors.info:colors.primaryText;
    return <MapAnchor key={robot.id} point={point} camera={camera} width={72} height={64}>
      <MapControl label={`Robot ${robot.code}, ${robot.status}, ${state.label}`} selected={selected===robot.code} width={72} height={64}
        onPress={()=>{if(Date.now()-camera.lastGestureAt>200)onSelect(robot.code);}}
        style={[styles.target,selected===robot.code&&styles.selected,state.lastReported&&styles.lastReported]}>
        <View style={{transform:[{rotate:`${mapHeading(robot.poseYaw,map.originYaw,frame.rotated)}deg`}]}}>
          <Svg width={22} height={28} viewBox="0 0 22 28"><Rect x={2} y={7} width={3} height={14} rx={1} fill={colors.darkAction} /><Rect x={17} y={7} width={3} height={14} rx={1} fill={colors.darkAction} />
            <Rect x={5} y={5} width={12} height={20} rx={4} fill={colors.surface} stroke={tone} strokeWidth={1.6} />
            <Path d="M8 11 L11 5 L14 11" fill="none" stroke={tone} strokeWidth={1.5} />
          </Svg>
        </View>
        <Text variant="caption" fontWeight="700" numberOfLines={1}>{robot.code}</Text>
      </MapControl>
    </MapAnchor>;
  })}</View>;
}
const styles=StyleSheet.create({
  target:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong,borderRadius:12},
  selected:{borderWidth:2,borderColor:colors.primary,backgroundColor:colors.primaryLight},lastReported:{borderStyle:'dashed'},
});
