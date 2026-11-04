import React, { useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Focus, Layers, LocateFixed, Minus, Plus } from 'lucide-react-native';
import { colors } from '../theme/colors';

export function MapControl({label,children,onPress,disabled=false,selected=false,width=48,height=48,style}:{label:string;children:React.ReactNode;onPress:()=>void;disabled?:boolean;selected?:boolean;width?:number;height?:number;style?:StyleProp<ViewStyle>}) {
  const [focused,setFocused]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled,selected}}
    disabled={disabled} onPress={onPress} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
    style={({pressed})=>[styles.control,{width,height},style,selected&&styles.selected,focused&&styles.focused,pressed&&styles.pressed,disabled&&styles.disabled]}>{children}</Pressable>;
}

export function MapHud({horizontal,zoom,following,canFollow,onFit,onZoom,onFollow,onLayers}:{horizontal:boolean;zoom:number;following:boolean;canFollow:boolean;onFit:()=>void;onZoom:(factor:number)=>void;onFollow:()=>void;onLayers:()=>void}) {
  return <View style={[styles.tools,horizontal&&styles.horizontal]}>
    <MapControl label="Fit map" onPress={onFit}><Focus size={20} color={colors.textPrimary}/></MapControl>
    <MapControl label="Zoom in" disabled={zoom>=8} onPress={()=>onZoom(2)}><Plus size={20} color={colors.textPrimary}/></MapControl>
    <MapControl label="Zoom out" disabled={zoom<=1} onPress={()=>onZoom(0.5)}><Minus size={20} color={colors.textPrimary}/></MapControl>
    <MapControl label={following?'Stop following robot':'Follow selected robot'} disabled={!canFollow&&!following} selected={following} onPress={onFollow}><LocateFixed size={20} color={following?colors.primaryText:colors.textPrimary}/></MapControl>
    <MapControl label="Map layers and locations" onPress={onLayers}><Layers size={20} color={colors.textPrimary}/></MapControl>
  </View>;
}
const styles=StyleSheet.create({
  tools:{gap:4,alignItems:'center'},horizontal:{flexDirection:'row',justifyContent:'center'},
  control:{width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.borderStrong},
  selected:{backgroundColor:colors.primaryLight,borderColor:colors.primary},focused:{borderColor:colors.primaryText,borderWidth:3},pressed:{backgroundColor:colors.surfaceMuted},disabled:{opacity:0.4},
});
