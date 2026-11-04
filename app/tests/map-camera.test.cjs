const { test } = require('node:test');
const assert = require('node:assert/strict');
const createLoader = require('./load-module.cjs');

function camera() {
  function gesture() {
    const handlers = {};
    const builder = new Proxy({}, {get: (_, method) => method === 'handlers' ? handlers : (...args) => {
      if (String(method).startsWith('on')) handlers[method] = args[0];
      return builder;
    }});
    return builder;
  }
  const load = createLoader({
    react: {useCallback: callback => callback, useEffect: () => {}, useMemo: callback => callback(), useState: value => [value, () => {}]},
    'react-native-gesture-handler': {Gesture: {Pan: gesture, Pinch: gesture, Tap: gesture, Simultaneous: (...items) => items}},
    'react-native-reanimated': {
      cancelAnimation: () => {}, ReduceMotion: {System: 'system'}, withTiming: value => value,
      useAnimatedStyle: callback => callback(), useSharedValue: initial => {let value = initial; return {get: () => value, set: next => {value = next;}};},
    },
    'react-native-worklets': {scheduleOnRN: (callback, ...args) => callback(...args)},
  });
  const frame = {width:300,height:400,left:0,top:0,mapWidth:300,mapHeight:400,scale:1,rotated:false};
  const controller = load('src/shared/maps/hooks/useMapCamera.ts').useMapCamera(frame,'map',true,()=>{});
  return {controller,pan:controller.gesture[0].handlers,pinch:controller.gesture[1].handlers};
}

test('one finger → pinch → one finger keeps the camera under the fingers without a translation jump', () => {
  const {controller:c,pan,pinch}=camera();
  pan.onStart(); pan.onUpdate({translationX:30,translationY:0,numberOfPointers:1});
  assert.equal(c.x.get(),30);
  pinch.onStart({focalX:100,focalY:140});
  pinch.onUpdate({focalX:120,focalY:150,scale:2});
  assert.equal(c.zoom.get(),2); assert.equal(c.x.get(),-20); assert.equal(c.y.get(),-130);
  pan.onUpdate({translationX:35,translationY:10,numberOfPointers:2});
  assert.equal(c.x.get(),-20); assert.equal(c.y.get(),-130);
  pinch.onEnd(); pinch.onFinalize();
  pan.onUpdate({translationX:40,translationY:10,numberOfPointers:1});
  assert.equal(c.x.get(),-15); assert.equal(c.y.get(),-130);
});

test('cancelling pinch releases ownership so subsequent one-finger pan works', () => {
  const {controller:c,pan,pinch}=camera();
  pan.onStart(); pinch.onStart({focalX:100,focalY:140});
  pan.onUpdate({translationX:20,translationY:10,numberOfPointers:2});
  pinch.onFinalize(); pan.onUpdate({translationX:25,translationY:12,numberOfPointers:1});
  assert.equal(c.x.get(),5); assert.equal(c.y.get(),2);
});
