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
          <ChevronRight size={18} color="#94a3b8" />
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
              <Clock3 size={11} color="#b45309" style={styles.pillIcon} />
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
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
    fontFamily: 'monospace',
    color: '#0f172a',
  },
  workflowName: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  payloadSummary: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 10,
  },
  routeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 8,
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  routeIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  routeDetails: {
    flex: 1,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  routeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
    marginTop: 1,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  robotGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  robotLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  robotCode: {
    fontWeight: '800',
    fontFamily: 'monospace',
    color: '#0f172a',
  },
  pillIcon: {
    marginRight: 4,
  },
  etaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  etaText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: colors.primary,
  },
  queuedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  queuedText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: '#b45309',
  },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  completedText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
});
