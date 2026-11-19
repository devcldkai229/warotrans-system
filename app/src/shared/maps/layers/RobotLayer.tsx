import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { RobotResponse } from '../../types/contracts';
import type { MapVersionDetailDto } from '../../api/navigationApi';
import { ThemeColors } from '../../theme/colors';
import { useThemeColors, useThemedStyles } from '../../theme/ThemeContext';
import { Text } from '../../ui';
import { MapAnchor } from '../MapAnchor';
import { mapHeading } from '../mapModel';
import { mapRobotState, type MapUpdateMode } from '../mapTelemetry';
import { worldToBase, type MapFrame } from '../mapTransform';
import type { MapCameraController } from '../hooks/useMapCamera';
import { ROBOT_COLOR } from '../mapStyle';

const SIZE = 26;
const BOX = 44;

interface Props {map:MapVersionDetailDto;frame:MapFrame;robots:RobotResponse[];camera:MapCameraController;selected:string;now:number;updateMode?:MapUpdateMode;onSelect:(code:string)=>void}

/**
 * A robot is a small status-coloured disc with a notch pointing where it faces, a soft halo, and its code in a small
 * tag underneath: it marks the spot without covering the lanes and stations around it (web: WarehouseMap robots).
 * The hit area stays 44 pt for the finger.
 */
export function RobotLayer({map,frame,robots,camera,selected,now,updateMode='polling',onSelect}:Props) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{robots.filter(robot=>robot.currentMapVersionId===map.id&&robot.isOnline).map(robot=>{
    const state=mapRobotState(robot,map,now,updateMode),point=worldToBase({x:robot.poseX,y:robot.poseY},map,frame);
    if(!state.showPose||!point)return null;
    const tone=state.lastReported?colors.textMuted:ROBOT_COLOR[robot.status]??colors.primary;
    const isSelected=selected===robot.code;
    const heading=mapHeading(robot.poseYaw,map.originYaw,frame.rotated);
    return <MapAnchor key={robot.id} point={point} camera={camera} width={BOX} height={BOX + 14}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Robot ${robot.code}, ${robot.status}, ${state.label}`} accessibilityState={{selected:isSelected}}
        onPress={()=>{if(Date.now()-camera.lastGestureAt>200)onSelect(robot.code);}} style={styles.hit}>
        <View style={{width:BOX,height:BOX,alignItems:'center',justifyContent:'center'}}>
          <Svg width={BOX} height={BOX} viewBox={`${-BOX/2} ${-BOX/2} ${BOX} ${BOX}`}>
            <Circle r={isSelected?20:17} fill={tone} opacity={0.18} />
            {isSelected ? <Circle r={20} fill="none" stroke={tone} strokeWidth={1.5} strokeDasharray="4 3" /> : null}
            {/* heading notch, drawn pointing up and turned with the robot */}
            <Path d="M0 -19 L5 -12 L-5 -12 Z" fill={tone} transform={`rotate(${heading})`} />
            <Circle r={SIZE/2} fill={tone} stroke="#ffffff" strokeWidth={2} strokeDasharray={state.lastReported?'3 3':undefined} />
            {/* a tiny robot face so it reads as a robot, not a station */}
            <Path d="M-6 -3 h12 a2 2 0 0 1 2 2 v6 a2 2 0 0 1 -2 2 h-12 a2 2 0 0 1 -2 -2 v-6 a2 2 0 0 1 2 -2 Z M0 -3 v-4" fill="none" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={-3} cy={1.5} r={1.2} fill="#ffffff" />
            <Circle cx={3} cy={1.5} r={1.2} fill="#ffffff" />
          </Svg>
        </View>
        <View style={[styles.tag,isSelected&&{backgroundColor:tone,borderColor:tone}]}>
          <Text variant="caption" fontWeight="700" numberOfLines={1} style={[styles.tagText,isSelected&&{color:'#ffffff'}]}>{robot.code}</Text>
        </View>
      </Pressable>
    </MapAnchor>;
  })}</View>;
}

const createStyles=(colors:ThemeColors)=>StyleSheet.create({
  hit:{flex:1,alignItems:'center'},
  tag:{marginTop:-6,paddingHorizontal:5,paddingVertical:1,borderRadius:6,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},
  tagText:{fontSize:10,lineHeight:13},
});
