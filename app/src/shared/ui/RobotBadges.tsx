import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react-native';
import { formatBattery } from '../formatBattery';
import { useTheme, useThemeColors } from '../theme/ThemeContext';
import { Text } from './Text';

export type BatteryTone = 'success' | 'warning' | 'danger' | 'muted';

/** Level bands shared by every battery read-out: <=15 % danger, <=35 % warning, else success; unknown is muted. */
export function batteryTone(percent: number | null | undefined): BatteryTone {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'muted';
  if (percent <= 15) return 'danger';
  if (percent <= 35) return 'warning';
  return 'success';
}

function batteryIcon(percent: number | null | undefined, charging: boolean) {
  if (charging) return BatteryCharging;
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return BatteryWarning;
  if (percent <= 15) return BatteryLow;
  if (percent <= 60) return BatteryMedium;
  if (percent <= 90) return Battery;
  return BatteryFull;
}

interface BatteryProps {
  percent: number | null | undefined;
  charging?: boolean;
  size?: 'sm' | 'lg';
  /** Show the level bar under the number (large read-outs). */
  bar?: boolean;
}

/** Battery icon that follows the level, the percentage, and an optional level bar, coloured by `batteryTone`. */
export function BatteryIndicator({ percent, charging = false, size = 'sm', bar = false }: BatteryProps) {
  const colors = useThemeColors();
  const tone = batteryTone(percent);
  const color = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : colors.textMuted;
  const Icon = batteryIcon(percent, charging);
  const known = tone !== 'muted';
  return <View style={{ gap: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon size={size === 'lg' ? 22 : 16} color={color} strokeWidth={2.2} />
      <Text variant={size === 'lg' ? 'title' : 'bodyMedium'} fontWeight="700" color={known ? 'textPrimary' : 'textMuted'}>{formatBattery(percent)}</Text>
    </View>
    {bar ? <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <View style={{ width: `${known ? Math.max(0, Math.min(100, percent as number)) : 0}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View> : null}
  </View>;
}

/** Quiet recessed online/offline pill without neon glow. */
export function OnlineBadge({ online, label }: { online: boolean; label?: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 19, 23, 0.05)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(18, 19, 23, 0.08)',
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: online ? (isDark ? '#30D158' : '#34C759') : colors.textMuted,
        }}
      />
      <Text variant="caption" fontWeight="600" color={online ? 'textPrimary' : 'textMuted'}>
        {label ?? (online ? 'Online' : 'Offline')}
      </Text>
    </View>
  );
}
