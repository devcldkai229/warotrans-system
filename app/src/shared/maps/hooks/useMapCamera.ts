import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cameraForPoint, clampCamera, FIT_CAMERA, zoomAtPoint, type MapCamera, type MapFrame, type MapPoint } from '../mapTransform';

const transition = { duration: 180, reduceMotion: ReduceMotion.System };

/** Gestures stay on the UI runtime. React only receives a settled zoom for LOD. */
export function useMapCamera(frame: MapFrame, identity: string, reducedMotion: boolean, onManualChange: () => void) {
  const zoom = useSharedValue(1), x = useSharedValue(0), y = useSharedValue(0);
  const panX = useSharedValue(0), panY = useSharedValue(0), startZoom = useSharedValue(1);
  const pinching = useSharedValue(false);
  const anchorX = useSharedValue(0), anchorY = useSharedValue(0);
  const [settledZoom, setSettledZoom] = useState(1);
  const [lastGestureAt, setLastGestureAt] = useState(0);
  const committed = useCallback((value: number) => { setSettledZoom(value); setLastGestureAt(Date.now()); }, []);

  const moveTo = useCallback((camera: MapCamera, animate = true) => {
    cancelAnimation(zoom); cancelAnimation(x); cancelAnimation(y);
    zoom.set(animate && !reducedMotion ? withTiming(camera.zoom, transition) : camera.zoom);
    x.set(animate && !reducedMotion ? withTiming(camera.x, transition) : camera.x);
    y.set(animate && !reducedMotion ? withTiming(camera.y, transition) : camera.y);
    setSettledZoom(camera.zoom);
  }, [zoom,x,y,reducedMotion]);
  useEffect(() => { moveTo(FIT_CAMERA, false); }, [identity, frame.width, frame.height, frame.rotated, moveTo]);
  useEffect(() => () => { cancelAnimation(zoom); cancelAnimation(x); cancelAnimation(y); }, [zoom,x,y]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().minDistance(8).averageTouches(true)
      .onStart(() => {
        cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom);
        panX.set(0); panY.set(0);
        scheduleOnRN(onManualChange);
      })
      .onUpdate(event => {
        const dx = event.translationX-panX.get(), dy = event.translationY-panY.get();
        panX.set(event.translationX); panY.set(event.translationY);
        // Pinch owns two-finger translation. Keep pan deltas current for the handoff back to one finger.
        if (pinching.get() || event.numberOfPointers !== 1) return;
        x.set(x.get()+dx); y.set(y.get()+dy);
      })
      .onEnd(() => {
        if (pinching.get()) return;
        const bounded = clampCamera({ zoom: zoom.get(), x: x.get(), y: y.get() }, frame);
        x.set(reducedMotion ? bounded.x : withTiming(bounded.x,transition));
        y.set(reducedMotion ? bounded.y : withTiming(bounded.y,transition));
        scheduleOnRN(committed, bounded.zoom);
      });
    const pinch = Gesture.Pinch()
      .onStart(event => {
        pinching.set(true);
        cancelAnimation(x); cancelAnimation(y); cancelAnimation(zoom);
        startZoom.set(zoom.get());
        anchorX.set((event.focalX-x.get())/zoom.get()); anchorY.set((event.focalY-y.get())/zoom.get());
        scheduleOnRN(onManualChange);
      })
      .onUpdate(event => {
        const value = Math.max(1,Math.min(8,startZoom.get()*event.scale));
        zoom.set(value); x.set(event.focalX-anchorX.get()*value); y.set(event.focalY-anchorY.get()*value);
      })
      .onEnd(() => {
        const bounded = clampCamera({ zoom: zoom.get(), x: x.get(), y: y.get() },frame);
        x.set(reducedMotion ? bounded.x : withTiming(bounded.x,transition));
        y.set(reducedMotion ? bounded.y : withTiming(bounded.y,transition));
        scheduleOnRN(committed,bounded.zoom);
      }).onFinalize(() => { pinching.set(false); });
    const doubleTap = Gesture.Tap().numberOfTaps(2).maxDistance(8).maxDelay(250)
      .onEnd((event,success) => {
        if (!success) return;
        const target = zoom.get() >= 7.9 ? FIT_CAMERA : clampCamera(zoomAtPoint({zoom:zoom.get(),x:x.get(),y:y.get()},zoom.get()*2,{x:event.x,y:event.y}),frame);
        zoom.set(reducedMotion ? target.zoom : withTiming(target.zoom,transition));
        x.set(reducedMotion ? target.x : withTiming(target.x,transition));
        y.set(reducedMotion ? target.y : withTiming(target.y,transition));
        scheduleOnRN(onManualChange); scheduleOnRN(committed,target.zoom);
      });
    return Gesture.Simultaneous(pan,pinch,doubleTap);
  }, [frame,reducedMotion,zoom,x,y,panX,panY,pinching,startZoom,anchorX,anchorY,committed,onManualChange]);

  const sceneStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: zoom.get() }],
  }), [x,y,zoom]);
  const fit = useCallback(() => { onManualChange(); moveTo(FIT_CAMERA); }, [onManualChange,moveTo]);
  const zoomBy = useCallback((factor: number) => {
    onManualChange();
    moveTo(clampCamera(zoomAtPoint({zoom:zoom.get(),x:x.get(),y:y.get()},zoom.get()*factor,{x:frame.width/2,y:frame.height/2}),frame));
  }, [frame,zoom,x,y,moveTo,onManualChange]);
  const center = useCallback((point: MapPoint) => moveTo(cameraForPoint(point,{zoom:zoom.get(),x:x.get(),y:y.get()},frame),false), [frame,moveTo,zoom,x,y]);
  return { zoom,x,y,gesture,sceneStyle,fit,zoomBy,center,settledZoom,lastGestureAt };
}

export type MapCameraController = ReturnType<typeof useMapCamera>;
