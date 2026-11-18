module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must be last. Required for react-native-reanimated on Expo Go / native.
    plugins: ['react-native-reanimated/plugin'],
  };
};
