import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CheckCheck,
  ChevronRight,
  CircleDot,
  Clock3,
  MapPin,
  Timer,
} from 'lucide-react-native';
import { Badge } from '../../shared/components/Badge';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
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
            <MapPin size={16} color={colors.primary} />
          </View>
          <View style={styles.routeDetails}>
            <Text style={styles.targetLabel}>Target: {job.destinationEndpointCode}</Text>
            <Text style={styles.routeText} numberOfLines={1}>
              {job.routeText}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>

        {/* Footer Meta Row */}
        <View style={styles.footerRow}>
          <View style={styles.robotGroup}>
            <CircleDot size={13} color={colors.primary} />
            <Text style={styles.robotLabel}>
              Assigned: <Text style={styles.robotCode}>{job.assignedRobotCode || 'Unassigned'}</Text>
            </Text>
          </View>

          {job.etaSeconds !== undefined && job.status === 'RUNNING' && (
            <View style={styles.etaPill}>
              <Timer size={11} color={colors.primary} style={styles.pillIcon} />
              <Text style={styles.etaText}>ETA {job.etaSeconds}s</Text>
            </View>
          )}

          {job.status === 'QUEUED' && (
            <View style={styles.queuedPill}>
              <Clock3 size={11} color={colors.warning} style={styles.pillIcon} />
              <Text style={styles.queuedText}>Handover Ready</Text>
            </View>
          )}

          {job.status === 'COMPLETED' && (
            <View style={styles.completedPill}>
              <CheckCheck size={12} color={colors.success} style={styles.pillIcon} />
              <Text style={styles.completedText}>Completed</Text>
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
    transform: [{ scale: 0.985 }],
    borderColor: colors.primary,
  },
  accentStrip: {
    height: 4,
    width: '100%',
  },
  cardContent: {
    padding: 12,
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
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  workflowName: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  payloadSummary: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 8,
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  robotGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  robotLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  robotCode: {
    fontWeight: '800',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  pillIcon: {
    marginRight: 4,
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  etaText: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    fontWeight: '800',
    color: colors.primary,
  },
  queuedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  queuedText: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    fontWeight: '800',
    color: colors.warning,
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  completedText: {
    fontSize: 10,
    fontFamily: typography.fontMono,
    fontWeight: '800',
    color: colors.success,
  },
});
