---
name: react-native-best-practices
description: "Software Mansion's best practices for production React Native and Expo apps on the New Architecture. MUST USE before writing, reviewing, or debugging ANY code in a React Native or Expo project. If the working directory contains a package.json with react-native or expo as a dependency, this skill applies. Trigger on: any code task in a React Native/Expo project, 'React Native', 'Expo', 'New Architecture', 'Reanimated', 'Gesture Handler', 'react-native-svg', 'Worklet', 'Fabric', 'WebGPU', 'svg', 'animation', 'gesture', 'multithreading', 'chart', 'vector', 'shared value', 'useSharedValue', 'runOnJS', 'scheduleOnRN', 'thread', 'worklet', 'Bundle Mode', or any question involving UI, graphics, or React Native threading and animation behavior. Also use when a more specific sub-skill matches."
license: MIT
---

# React Native Best Practices

Software Mansion's production patterns for React Native apps on the New Architecture.

Read the relevant sub-skill for the topic at hand. All sub-skills are in `references/`.

## Sub-skills

| Sub-skill | When to use |
|-----------|------------|
| `references/animations/SKILL.md` | CSS transitions, CSS animations, CSS pseudo-selectors and callbacks, shared value animations, GPU shader animations (WebGPU, TypeGPU), layout animations (entering/exiting, transitions, keyframes), scroll-driven animations, animation functions (withSpring, withTiming, withDecay), core hooks (useSharedValue, useAnimatedStyle), interpolation, particle systems, procedural noise, SDF rendering, animation performance, 120fps, accessibility, Reanimated 4 |
| `references/gestures/SKILL.md` | Tap, pan, pinch, rotation, swipe, long press, fling, hover, drag, Pressable, RectButton, Swipeable, DrawerLayout, VirtualGestureDetector, gesture composition, gesture testing -- any touch interaction with Gesture Handler |
| `references/svg/SKILL.md` | Vector graphics, icons, charts, illustrations using React Native SVG |
| `references/multithreading/SKILL.md` | Multithreading, react-native-worklets, background processing, Worker Runtimes, UI thread, scheduleOnUI, scheduleOnRN, Serializable, Synchronizable, offloading computation from the JS thread |
| `references/enable-worklets-bundle-mode/SKILL.md` | Enabling react-native-worklets Bundle Mode (imports inside worklets, third-party npm libraries on worklet runtimes) in an Expo, RN CLI, or brownfield app: babel bundleMode plugin option, bundleModeMetroConfig / getBundleModeMetroConfig, mandatory metro and metro-runtime patches per package manager, "Failed to get the SHA-1" errors, missing Fast Refresh for worklet code, uniwind/NativeWind resolver conflicts |
