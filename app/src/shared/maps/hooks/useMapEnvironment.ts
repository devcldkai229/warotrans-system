import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

export function useMapEnvironment() {
  const [now,setNow] = useState(Date.now);
  const [active,setActive] = useState(AppState.currentState !== 'background');
  const [reducedMotion,setReducedMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{ if(mounted)setReducedMotion(value); }).catch(()=>{});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged',setReducedMotion);
    const lifecycle = AppState.addEventListener('change',state=>setActive(state === 'active'));
    return () => { mounted=false; motion.remove(); lifecycle.remove(); };
  },[]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(()=>setNow(Date.now()),1000);
    return () => clearInterval(timer);
  },[active]);
  return { now,active,reducedMotion };
}
