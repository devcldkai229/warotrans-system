import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme/colors';

interface WarehousePulseCardProps {
  fleetReady: string;
  activeTasks: number;
  hazardsCount: number;
}

export function WarehousePulseCard({
  fleetReady = '2/2',
  activeTasks = 1,
  hazardsCount = 0,
}: WarehousePulseCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.title}>WAREHOUSE PULSE</Text>
          <View style={styles.pillBadge}>
            <Text style={styles.pillText}>LIVE TELEMETRY</Text>
          </View>
        </View>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>SYNCED</Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Text style={[styles.metricValue, styles.valueSuccess]}>{fleetReady}</Text>
          <Text style={styles.metricLabel}>Fleet Ready</Text>
        </View>

        <View style={[styles.metricItem, styles.metricDivider]}>
          <Text style={styles.metricValue}>{activeTasks}</Text>
          <Text style={styles.metricLabel}>Active Tasks</Text>
        </View>

        <View style={[styles.metricItem, styles.metricDivider]}>
          <Text style={[styles.metricValue, hazardsCount > 0 ? styles.valueDanger : styles.valueSuccess]}>
            {hazardsCount}
          </Text>
          <Text style={styles.metricLabel}>Hazards</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textPrimary,
  },
  pillBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.primaryDark,
    fontFamily: 'monospace',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  valueSuccess: {
    color: colors.success,
  },
  valueDanger: {
    color: colors.danger,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
});
