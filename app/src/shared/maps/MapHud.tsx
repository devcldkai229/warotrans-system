import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

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

  return (
    <View style={styles.topLeftStack} pointerEvents="box-none">
      <View
        style={[
          styles.statusPill,
          isDark && updateMode === 'live' && styles.statusPillLiveDark,
        ]}
        pointerEvents="none"
      >
        <View style={[styles.liveHalo, { backgroundColor: `${dotColor}33` }]}>
          <View style={[styles.liveDot, { backgroundColor: dotColor }]} />
        </View>
        <Text
          variant="caption"
          fontWeight="700"
          color="textPrimary"
          numberOfLines={1}
          maxFontSizeMultiplier={1.25}
        >
          {statusText}
        </Text>
        <Text variant="caption" color="textMuted" maxFontSizeMultiplier={1.25}>
          ·
        </Text>
        <Text
          variant="caption"
          fontWeight="600"
          color="textSecondary"
          numberOfLines={1}
          maxFontSizeMultiplier={1.25}
          style={styles.mapTagText}
        >
          {mapCode} · V{versionNo}
        </Text>
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
  const colors = useThemeColors();
  const styles = useThemedStyles(createStyles);
  const iconSize = horizontal ? 16 : 17;

  return (
    <View style={[styles.clusterPill, horizontal && styles.clusterRow]}>
      <ClusterButton label="Map layers and locations" compact={horizontal} onPress={onLayers}>
        <Layers size={iconSize} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Map legend" compact={horizontal} selected={legendOpen} onPress={onLegend}>
        <BookOpen
          size={iconSize}
          color={legendOpen ? colors.primaryText : colors.textPrimary}
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
              color={following ? colors.primaryText : colors.textPrimary}
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
    <View style={[styles.clusterPill, horizontal && styles.clusterRow]}>
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
    <View style={[styles.orientBox, compact && styles.orientBoxCompact]}>
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

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) =>
  StyleSheet.create({
    control: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: colors.mapHudBg,
      borderWidth: 1,
      borderColor: colors.mapHudBorder,
    },
    selected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
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
      gap: 6,
      maxWidth: '100%',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.mapHudBg,
      borderWidth: 1,
      borderColor: colors.mapHudBorder,
      ...shadows.sm,
    },
    statusPillLiveDark: {
      backgroundColor: 'rgba(13, 30, 22, 0.90)',
      borderColor: 'rgba(69, 189, 98, 0.58)',
    },
    liveHalo: {
      width: 13,
      height: 13,
      borderRadius: 6.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    liveDot: {
      width: 6.5,
      height: 6.5,
      borderRadius: 3.25,
    },
    mapTagText: {
      flexShrink: 1,
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
      backgroundColor: colors.mapHudBg,
      borderWidth: 1,
      borderColor: colors.mapHudBorder,
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
      backgroundColor: colors.primaryLight,
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
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.mapHudBorder,
      backgroundColor: colors.mapHudBg,
      paddingHorizontal: 8,
      paddingVertical: 6,
      minWidth: 84,
      gap: 4,
      ...shadows.sm,
    },
    orientBoxCompact: {
      paddingHorizontal: 7,
      paddingVertical: 5,
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
