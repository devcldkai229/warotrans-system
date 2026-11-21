import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { AlertTriangle, BookOpen, Focus, Layers, LocateFixed, Minus, Plus } from 'lucide-react-native';
import { ThemeColors } from '../theme/colors';
import { ThemeShadows } from '../theme/shadows';
import { useThemeColors, useThemedStyles } from '../theme/ThemeContext';
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
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
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
  const colors = useThemeColors();
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
      <View style={styles.statusPill} pointerEvents="none">
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

  return (
    <View style={[styles.clusterPill, horizontal && styles.clusterRow]}>
      <ClusterButton label="Map layers and locations" onPress={onLayers}>
        <Layers size={17} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Map legend" selected={legendOpen} onPress={onLegend}>
        <BookOpen
          size={17}
          color={legendOpen ? colors.primaryText : colors.textPrimary}
          strokeWidth={1.85}
        />
      </ClusterButton>
      {showFollow ? (
        <>
          <View style={horizontal ? styles.dividerV : styles.dividerH} />
          <ClusterButton
            label={following ? 'Stop following robot' : 'Follow selected robot'}
            disabled={!canFollow && !following}
            selected={following}
            onPress={onFollow}
          >
            <LocateFixed
              size={17}
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

  return (
    <View style={[styles.clusterPill, horizontal && styles.clusterRow]}>
      <ClusterButton label="Zoom in" disabled={zoom >= 8} onPress={() => onZoom(2)}>
        <Plus size={17} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Zoom out" disabled={zoom <= 1} onPress={() => onZoom(0.5)}>
        <Minus size={17} color={colors.textPrimary} strokeWidth={1.85} />
      </ClusterButton>
      <View style={horizontal ? styles.dividerV : styles.dividerH} />
      <ClusterButton label="Fit map" onPress={onFit}>
        <Focus size={17} color={colors.textPrimary} strokeWidth={1.85} />
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
      maxWidth: 230,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: colors.mapHudBg,
      borderWidth: 1,
      borderColor: colors.mapHudBorder,
      ...shadows.sm,
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
    },
    clusterBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
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
      height: 22,
      backgroundColor: colors.mapHudBorder,
      marginHorizontal: 1,
    },
  });
