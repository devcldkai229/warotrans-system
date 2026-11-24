import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { AlertTriangle, BookOpen, Focus, Layers, LocateFixed, Minus, Plus } from 'lucide-react-native';
import { ThemeColors } from '../theme/colors';
import { ThemeShadows } from '../theme/shadows';
import { typography } from '../theme/typography';
import { useTheme, useThemeColors, useThemedStyles } from '../theme/ThemeContext';
import { Text } from '../ui';
import type { MapUpdateMode } from './mapTelemetry';

export function MapControl({
  label,
  children,
  onPress,
  disabled = false,
  selected = false,
  width = 48,
  height = 48,
  style,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        { width, height },
        style,
        selected && styles.selected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

function ClusterButton({
  label,
  children,
  onPress,
  disabled = false,
  selected = false,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  compact?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.clusterBtn,
        compact && styles.clusterBtnHorizontal,
        selected && styles.clusterBtnSelected,
        pressed && styles.pressedScale,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

const PULSE_EASE_OUT = Easing.out(Easing.cubic);

const WEB_HUD_GLASS_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(18px) saturate(160%)',
        WebkitBackdropFilter: 'blur(18px) saturate(160%)',
      } as unknown as ViewStyle)
    : null;

function formatMapBaseCode(mapCode: string, versionNo: number): string {
  const trimmed = mapCode.trim();
  if (!trimmed || !Number.isFinite(versionNo) || versionNo < 0) return mapCode;
  const suffixPattern = new RegExp(`[-_\\s]*v0*${Math.trunc(versionNo)}$`, 'i');
  const stripped = trimmed.replace(suffixPattern, '').trim();
  return stripped || trimmed;
}

export function MapTopStatusPill({
  mapCode,
  versionNo,
  updateMode,
  zonesVisible,
  onPressZonesHidden,
}: {
  mapCode: string;
  versionNo: number;
  updateMode: MapUpdateMode;
  zonesVisible: boolean;
  onPressZonesHidden?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReducedMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReducedMotion);
    return () => {
      active = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (updateMode !== 'live' || reducedMotion) {
      pulseAnim.setValue(0);
      return;
    }
    pulseAnim.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1800,
          easing: PULSE_EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.delay(600),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [updateMode, reducedMotion, pulseAnim]);

  const dotColor =
    updateMode === 'live'
      ? colors.success
      : updateMode === 'paused'
      ? colors.warning
      : updateMode === 'unavailable'
      ? colors.danger
      : colors.primary;

  const statusText =
    updateMode === 'live'
      ? 'Live'
      : updateMode === 'paused'
      ? 'Paused'
      : updateMode === 'unavailable'
      ? 'Offline'
      : 'Polling · 5s';

  const baseCode = formatMapBaseCode(mapCode, versionNo);

  return (
    <View style={styles.topLeftStack} pointerEvents="box-none">
      <View
        style={[styles.statusPill, WEB_HUD_GLASS_STYLE]}
        pointerEvents="none"
      >
        <View style={styles.statusGroup}>
          <View style={styles.beaconSlot}>
            {updateMode === 'live' && !reducedMotion ? (
              <Animated.View
                style={[
                  styles.pulseRing,
                  {
                    backgroundColor: dotColor,
                    opacity: pulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.45, 0],
                    }),
                    transform: [
                      {
                        scale: pulseAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.55, 1.45],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ) : (
              <View style={[styles.pulseRing, { backgroundColor: dotColor, opacity: 0.22 }]} />
            )}
            <View style={[styles.liveDot, { backgroundColor: dotColor }]} />
          </View>
          <Text
            variant="caption"
            color="textPrimary"
            numberOfLines={1}
            maxFontSizeMultiplier={1.25}
            style={styles.statusLabel}
          >
            {statusText}
          </Text>
        </View>

        <View style={styles.statusDivider} />

        <View style={styles.mapIdentityGroup}>
          <Text
            variant="caption"
            color="textSecondary"
            numberOfLines={1}
            maxFontSizeMultiplier={1.25}
            style={styles.mapTagText}
          >
            {baseCode}
          </Text>
          <View style={styles.versionChip}>
            <Text
              variant="caption"
              color="textSecondary"
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              style={styles.versionChipText}
            >
              {`v${versionNo}`}
            </Text>
          </View>
        </View>
      </View>

      {!zonesVisible ? (
        <Pressable
          onPress={onPressZonesHidden}
          disabled={!onPressZonesHidden}
          accessibilityRole="button"
          accessibilityLabel="Zones Hidden"
          style={({ pressed }) => [styles.zonesWarningChip, pressed && styles.pressedScale]}
        >
          <AlertTriangle size={12} color={colors.warningText} strokeWidth={1.9} />
          <Text variant="caption" fontWeight="600" color="warningText" maxFontSizeMultiplier={1.25}>
            Zones Hidden
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function MapToolCluster({
  horizontal = false,
  legendOpen,
  showFollow = true,
  following,
  canFollow,
  onLayers,
  onLegend,
  onFollow,
}: {
  horizontal?: boolean;
  legendOpen: boolean;
  showFollow?: boolean;
  following: boolean;
  canFollow: boolean;
  onLayers: () => void;
  onLegend: () => void;
  onFollow: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const iconSize = horizontal ? 16 : 17;
  const selectedIconColor = isDark ? '#18191A' : '#FFFFFF';

  return (
    <View style={[styles.clusterPill, WEB_HUD_GLASS_STYLE, horizontal && styles.clusterRow]}>
      <ClusterButton label="Map layers and locations" compact={horizontal} onPress={onLayers}>
        <Layers size={iconSize} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Map legend" compact={horizontal} selected={legendOpen} onPress={onLegend}>
        <BookOpen
          size={iconSize}
          color={legendOpen ? selectedIconColor : colors.textPrimary}
          strokeWidth={1.85}
        />
      </ClusterButton>
      {showFollow ? (
        <>
          <View style={horizontal ? styles.dividerV : styles.dividerH} />
          <ClusterButton
            label={following ? 'Stop following robot' : 'Follow selected robot'}
            compact={horizontal}
            disabled={!canFollow && !following}
            selected={following}
            onPress={onFollow}
          >
            <LocateFixed
              size={iconSize}
              color={following ? selectedIconColor : colors.textPrimary}
              strokeWidth={1.85}
            />
          </ClusterButton>
        </>
      ) : null}
    </View>
  );
}

export function MapCameraCluster({
  horizontal = false,
  zoom,
  onFit,
  onZoom,
}: {
  horizontal?: boolean;
  zoom: number;
  onFit: () => void;
  onZoom: (factor: number) => void;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const iconSize = horizontal ? 16 : 17;

  return (
    <View style={[styles.clusterPill, WEB_HUD_GLASS_STYLE, horizontal && styles.clusterRow]}>
      <ClusterButton label="Zoom in" compact={horizontal} disabled={zoom >= 8} onPress={() => onZoom(2)}>
        <Plus size={iconSize} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Zoom out" compact={horizontal} disabled={zoom <= 1} onPress={() => onZoom(0.5)}>
        <Minus size={iconSize} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Fit map" compact={horizontal} onPress={onFit}>
        <Focus size={iconSize} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
    </View>
  );
}

export function MapHud({
  horizontal,
  zoom,
  following,
  canFollow,
  onFit,
  onZoom,
  onFollow,
  onLayers,
}: {
  horizontal: boolean;
  zoom: number;
  following: boolean;
  canFollow: boolean;
  onFit: () => void;
  onZoom: (factor: number) => void;
  onFollow: () => void;
  onLayers: () => void;
}) {
  return (
    <View style={{ gap: 6, flexDirection: horizontal ? 'row' : 'column', alignItems: 'center' }}>
      <MapToolCluster
        horizontal={horizontal}
        legendOpen={false}
        following={following}
        canFollow={canFollow}
        onLayers={onLayers}
        onLegend={onLayers}
        onFollow={onFollow}
      />
      <MapCameraCluster horizontal={horizontal} zoom={zoom} onFit={onFit} onZoom={onZoom} />
    </View>
  );
}

/**
 * OTTO Motors bottom-left orientation crosshair (`0°` up, `90°` right) paired with a live
 * tabular-monospace `(x, y)` metric coordinate readout.
 */
export function MapOrientationBox({
  x,
  y,
  compact = false,
}: {
  x: number | null;
  y: number | null;
  compact?: boolean;
}) {
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);

  const axisSize = compact ? 30 : 34;
  const axisH = compact ? 26 : 30;
  const cx = axisSize / 2;
  const cy = Math.round(axisH * 0.56);
  const fmt = (value: number | null) =>
    value !== null && Number.isFinite(value) ? `${value.toFixed(2)} m` : '--';

  return (
    <View style={[styles.orientBox, WEB_HUD_GLASS_STYLE, compact && styles.orientBoxCompact]}>
      <View style={styles.reticleWrap}>
        <Text variant="caption" maxFontSizeMultiplier={1.15} style={styles.orientDeg}>
          0°
        </Text>
        <View style={styles.crossRow}>
          <View style={styles.orientSide} />
          <Svg width={axisSize} height={axisH} viewBox={`0 0 ${axisSize} ${axisH}`}>
            <Line
              x1={cx}
              y1={2.5}
              x2={cx}
              y2={axisH - 1.5}
              stroke={colors.textSecondary}
              strokeOpacity={0.72}
              strokeWidth={1.2}
            />
            <Path
              d={`M${cx - 3.2} 6.2 L${cx} 2.2 L${cx + 3.2} 6.2`}
              fill="none"
              stroke={colors.textSecondary}
              strokeOpacity={0.85}
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Line
              x1={1.5}
              y1={cy}
              x2={axisSize - 1.5}
              y2={cy}
              stroke={colors.textSecondary}
              strokeOpacity={0.72}
              strokeWidth={1.2}
            />
            <Circle cx={cx} cy={cy} r={2.6} fill={colors.textPrimary} />
          </Svg>
          <View style={styles.orientSide}>
            <Text variant="caption" maxFontSizeMultiplier={1.15} style={styles.orientDegRight}>
              90°
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.coordGroup}>
        <Text
          variant="caption"
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={[styles.coordText, compact && styles.coordTextCompact]}
        >
          {`x: ${fmt(x)}`}
        </Text>
        <Text
          variant="caption"
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
          style={[styles.coordText, compact && styles.coordTextCompact]}
        >
          {`y: ${fmt(y)}`}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    control: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(24, 27, 33, 0.84)' : 'rgba(255, 255, 255, 0.88)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(18, 19, 23, 0.08)',
    },
    selected: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(18, 19, 23, 0.08)',
      borderColor: isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(18, 19, 23, 0.18)',
    },
    pressed: { opacity: 0.78 },
    pressedScale: { opacity: 0.85, transform: [{ scale: 0.94 }] },
    disabled: { opacity: 0.36 },

    topLeftStack: {
      gap: 6,
      alignItems: 'flex-start',
      maxWidth: '100%',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 36,
      maxWidth: '100%',
      paddingLeft: 11,
      paddingRight: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(24, 27, 33, 0.82)' : 'rgba(255, 255, 255, 0.86)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(18, 19, 23, 0.08)',
      ...shadows.sm,
    },
    statusGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    beaconSlot: {
      width: 14,
      height: 14,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    pulseRing: {
      position: 'absolute',
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    liveDot: {
      width: 6.5,
      height: 6.5,
      borderRadius: 3.25,
    },
    statusLabel: {
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    statusDivider: {
      width: 1,
      height: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(18, 19, 23, 0.11)',
    },
    mapIdentityGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 1,
      minWidth: 0,
    },
    mapTagText: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '600',
      fontFamily: typography.fontMono,
      letterSpacing: 0.15,
    },
    versionChip: {
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(18, 19, 23, 0.06)',
    },
    versionChipText: {
      fontSize: 10.5,
      lineHeight: 13,
      fontWeight: '600',
      fontFamily: typography.fontMono,
      fontVariant: ['tabular-nums'],
    },
    zonesWarningChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.warningBg,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      ...shadows.sm,
    },

    clusterPill: {
      borderRadius: 23,
      padding: 3,
      backgroundColor: isDark ? 'rgba(24, 27, 33, 0.84)' : 'rgba(255, 255, 255, 0.88)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(18, 19, 23, 0.08)',
      alignItems: 'center',
      ...shadows.md,
    },
    clusterRow: {
      flexDirection: 'row',
      borderRadius: 21,
    },
    clusterBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clusterBtnHorizontal: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    clusterBtnSelected: {
      backgroundColor: isDark ? '#E4E6EB' : '#1C1C1E',
    },
    dividerH: {
      width: 22,
      height: 1,
      backgroundColor: colors.mapHudBorder,
      marginVertical: 1,
    },
    dividerV: {
      width: 1,
      height: 18,
      backgroundColor: colors.mapHudBorder,
      marginHorizontal: 1,
    },

    orientBox: {
      borderRadius: 14,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(18, 19, 23, 0.08)',
      backgroundColor: isDark ? 'rgba(24, 27, 33, 0.84)' : 'rgba(255, 255, 255, 0.88)',
      paddingHorizontal: 10,
      paddingVertical: 7,
      minWidth: 84,
      gap: 4,
      ...shadows.sm,
    },
    orientBoxCompact: {
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 6,
      minWidth: 74,
      gap: 3,
    },
    reticleWrap: {
      alignItems: 'center',
      gap: 1,
    },
    orientDeg: {
      fontSize: 9.5,
      lineHeight: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    crossRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    orientSide: {
      flex: 1,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    orientDegRight: {
      fontSize: 9.5,
      lineHeight: 11,
      color: colors.textSecondary,
      fontWeight: '600',
      paddingLeft: 2,
      marginTop: 2,
    },
    coordGroup: {
      alignItems: 'flex-start',
      gap: 1,
    },
    coordText: {
      fontSize: 10,
      lineHeight: 13.5,
      fontFamily: typography.fontMono,
      fontVariant: ['tabular-nums'],
      color: colors.textPrimary,
      fontWeight: '600',
    },
    coordTextCompact: {
      fontSize: 9.5,
      lineHeight: 12.5,
    },
  });
