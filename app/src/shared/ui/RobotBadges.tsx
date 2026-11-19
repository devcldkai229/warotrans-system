import React from 'react';
import { View } from 'react-native';
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from 'lucide-react-native';
import { formatBattery } from '../formatBattery';
import { useThemeColors } from '../theme/ThemeContext';
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

/** Online is a filled green pill with a bright dot; offline is a muted outline. */
export function OnlineBadge({ online, label }: { online: boolean; label?: string }) {
  const colors = useThemeColors();
  return <View style={{
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: online ? colors.successBg : colors.surfaceMuted, borderWidth: 1, borderColor: online ? colors.successBorder : colors.borderStrong,
  }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online ? colors.success : colors.textMuted,
      shadowColor: colors.success, shadowOpacity: online ? 0.8 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } }} />
    <Text variant="caption" fontWeight="700" color={online ? 'successText' : 'textMuted'}>{label ?? (online ? 'Online' : 'Offline')}</Text>
  </View>;
}
