import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';

export interface FleetRobotInfo {
  id: string;
  code: string;
  status: 'EN_ROUTE' | 'STANDBY' | 'CHARGING' | 'MAINTENANCE';
  task: string;
  battery: number;
  payloadText: string;
}

interface FleetRobotCardProps {
  robot: FleetRobotInfo;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export function FleetRobotCard({
  robot,
  isSelected,
  onSelect,
}: FleetRobotCardProps) {
  const isEnRoute = robot.status === 'EN_ROUTE';

  return (
    <Pressable
      onPress={() => onSelect(robot.id)}
      style={[
        styles.card,
        isSelected && styles.cardSelected,
      ]}
      accessibilityRole="button"
    >
      <View style={styles.topRow}>
        <Text style={styles.code}>{robot.code}</Text>
        <View style={[styles.statusBadge, isEnRoute ? styles.badgeInfo : styles.badgeSuccess]}>
          <Text style={[styles.statusText, isEnRoute ? styles.textInfo : styles.textSuccess]}>
            {robot.status.replace('_', ' ')}
          </Text>
        </View>
      </View>

      <Text style={styles.taskText} numberOfLines={1}>
        {robot.task}
      </Text>

      <View style={styles.bottomRow}>
        <Text style={styles.batteryText}>
          🔋 {robot.battery}%
        </Text>
        <Text style={styles.payloadText}>{robot.payloadText}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  code: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeInfo: {
    backgroundColor: colors.infoBg,
  },
  badgeSuccess: {
    backgroundColor: colors.successBg,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
  },
  textInfo: {
    color: colors.info,
  },
  textSuccess: {
    color: colors.success,
  },
  taskText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  batteryText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  payloadText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
