import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge } from '../../shared/components/Badge';
import { colors } from '../../shared/theme/colors';
import { AppJobItem } from './jobData';

interface JobCardProps {
  job: AppJobItem;
  onPress: () => void;
}

export function JobCard({ job, onPress }: JobCardProps) {
  const getAccentColor = () => {
    switch (job.status) {
      case 'RUNNING':
        return colors.primary;
      case 'QUEUED':
      case 'ASSIGNED':
        return colors.warning;
      case 'COMPLETED':
        return colors.success;
      case 'FAILED':
      case 'CANCELLED':
        return colors.danger;
      default:
        return colors.textMuted;
    }
  };

  const getBadgeTone = (): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
    switch (job.status) {
      case 'RUNNING':
        return 'info';
      case 'QUEUED':
      case 'ASSIGNED':
        return 'warning';
      case 'COMPLETED':
        return 'success';
      case 'FAILED':
      case 'CANCELLED':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open job ${job.jobNo}`}
    >
      {/* Top Accent Strip */}
      <View style={[styles.accentStrip, { backgroundColor: getAccentColor() }]} />

      <View style={styles.cardContent}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.titleGroup}>
            <Text style={styles.jobNo}>{job.jobNo}</Text>
            <Text style={styles.workflowName}>· {job.workflowName}</Text>
          </View>
          <Badge label={job.status} tone={getBadgeTone()} size="sm" />
        </View>

        {/* Payload / Description */}
        <Text style={styles.payloadSummary} numberOfLines={1}>
          {job.payloadSummary}
        </Text>

        {/* Route / Target Box */}
        <View style={styles.routeBox}>
          <View style={styles.routeIconWrap}>
            <Text style={styles.routeIcon}>📍</Text>
          </View>
          <View style={styles.routeDetails}>
            <Text style={styles.targetLabel}>Target: {job.destinationEndpointCode}</Text>
            <Text style={styles.routeText} numberOfLines={1}>
              {job.routeText}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>

        {/* Footer Meta Row */}
        <View style={styles.footerRow}>
          <View style={styles.robotGroup}>
            <View
              style={[
                styles.robotStatusDot,
                { backgroundColor: getAccentColor() },
              ]}
            />
            <Text style={styles.robotLabel}>
              AMR: <Text style={styles.robotCode}>{job.assignedRobotCode || 'Unassigned'}</Text>
            </Text>
          </View>

          {job.etaSeconds !== undefined && job.status === 'RUNNING' && (
            <View style={styles.etaPill}>
              <Text style={styles.etaText}>⏱ ETA {job.etaSeconds}s</Text>
            </View>
          )}

          {job.status === 'QUEUED' && (
            <View style={styles.queuedPill}>
              <Text style={styles.queuedText}>Standby in queue</Text>
            </View>
          )}

          {job.status === 'COMPLETED' && (
            <View style={styles.completedPill}>
              <Text style={styles.completedText}>✓ Done</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPressed: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.primaryBorder,
  },
  accentStrip: {
    height: 3,
    width: '100%',
  },
  cardContent: {
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  jobNo: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  workflowName: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  payloadSummary: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    gap: 10,
    marginBottom: 10,
  },
  routeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIcon: {
    fontSize: 13,
  },
  routeDetails: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  routeText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  chevron: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
    paddingTop: 8,
  },
  robotGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  robotStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  robotLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  robotCode: {
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  etaPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  etaText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primaryDark,
  },
  queuedPill: {
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  queuedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
  },
  completedPill: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completedText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
});
