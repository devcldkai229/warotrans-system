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
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { AppJobItem } from './jobData';

interface JobCardProps {
  job: AppJobItem;
  onPress: () => void;
}

export function JobCard({ job, onPress }: JobCardProps) {
  const getStripColor = () => {
    switch (job.kind) {
      case 'waiting':
        return colors.warning;
      case 'transit':
        return colors.primary;
      case 'complete':
        return colors.success;
      default:
        return 'rgba(100, 116, 139, 0.3)';
    }
  };

  const getStatusTagStyles = () => {
    switch (job.kind) {
      case 'waiting':
        return {
          container: styles.tagWaiting,
          text: styles.tagWaitingText,
          label: 'WAITING HANDOVER',
        };
      case 'transit':
        return {
          container: styles.tagTransit,
          text: styles.tagTransitText,
          label: 'IN TRANSIT',
        };
      case 'complete':
        return {
          container: styles.tagComplete,
          text: styles.tagCompleteText,
          label: 'COMPLETED',
        };
      default:
        return {
          container: styles.tagQueued,
          text: styles.tagQueuedText,
          label: 'QUEUED',
        };
    }
  };

  const statusTag = getStatusTagStyles();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open job ${job.id}`}
    >
      {/* Top 6px Accent Strip */}
      <View style={[styles.accentStrip, { backgroundColor: getStripColor() }]} />

      <View style={styles.cardContent}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.titleCol}>
            <Text style={styles.jobHeading}>
              <Text style={styles.jobId}>{job.id}</Text>
              <Text style={styles.workflowName}> · {job.workflowName}</Text>
            </Text>
            <Text style={styles.payloadSummary} numberOfLines={1}>
              {job.payloadSummary}
            </Text>
          </View>

          <View style={[styles.statusTag, statusTag.container]}>
            <Text style={[styles.statusTagText, statusTag.text]}>
              {statusTag.label}
            </Text>
          </View>
        </View>

        {/* Target Location Box */}
        <View style={styles.targetBox}>
          <View style={styles.targetIconWrap}>
            <MapPin size={18} color={colors.primary} />
          </View>
          <View style={styles.targetDetails}>
            <Text style={styles.targetEyebrow}>TARGET LOCATION</Text>
            <Text style={styles.targetTitle} numberOfLines={1}>
              {job.target}
            </Text>
            <Text style={styles.targetRoute} numberOfLines={1}>
              {job.route}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </View>

        {/* Footer Meta Row */}
        <View style={styles.footerRow}>
          <View style={styles.robotGroup}>
            <CircleDot
              size={13}
              color={colors.primary}
            />
            <Text style={styles.robotLabel}>
              Assigned: <Text style={styles.robotCode}>{job.robot}</Text>
            </Text>
          </View>

          {job.kind === 'transit' && (
            <View style={styles.pillTransit}>
              <Timer size={11} color={colors.primary} />
              <Text style={styles.pillTransitText}>
                ETA {job.etaSeconds ? `${Math.floor(job.etaSeconds / 60).toString().padStart(2, '0')}m ${(job.etaSeconds % 60).toString().padStart(2, '0')}s` : '01m 24s'}
              </Text>
            </View>
          )}

          {job.kind === 'waiting' && (
            <View style={styles.pillWaiting}>
              <Clock3 size={11} color="#b45309" />
              <Text style={styles.pillWaitingText}>Handover Ready</Text>
            </View>
          )}

          {job.kind === 'complete' && (
            <View style={styles.pillComplete}>
              <CheckCheck size={12} color={colors.success} />
              <Text style={styles.pillCompleteText}>
                {job.duration || 'Done'}
              </Text>
            </View>
          )}

          {job.kind === 'queued' && (
            <View style={styles.pillQueued}>
              <Text style={styles.pillQueuedText}>Queue #1</Text>
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    borderColor: colors.primary,
  },
  accentStrip: {
    height: 6,
    width: '100%',
  },
  cardContent: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleCol: {
    flex: 1,
  },
  jobHeading: {
    lineHeight: 18,
  },
  jobId: {
    fontFamily: typography.fontMono,
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  workflowName: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  payloadSummary: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    flexShrink: 0,
  },
  statusTagText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tagWaiting: {
    backgroundColor: '#fef3c7',
  },
  tagWaitingText: {
    color: '#92400e',
  },
  tagTransit: {
    backgroundColor: '#e0f2fe',
  },
  tagTransitText: {
    color: colors.primary,
  },
  tagComplete: {
    backgroundColor: '#dcfce7',
  },
  tagCompleteText: {
    color: '#15803d',
  },
  tagQueued: {
    backgroundColor: '#f1f5f9',
  },
  tagQueuedText: {
    color: '#64748b',
  },
  targetBox: {
    marginTop: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(241, 245, 249, 0.4)',
  },
  targetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  targetDetails: {
    flex: 1,
    minWidth: 0,
  },
  targetEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  targetTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 1,
  },
  targetRoute: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  robotGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  robotLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  robotCode: {
    fontFamily: typography.fontMono,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  pillTransit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillTransitText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
  },
  pillWaiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillWaitingText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '900',
    color: '#92400e',
  },
  pillComplete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillCompleteText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '900',
    color: '#15803d',
  },
  pillQueued: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pillQueuedText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
});
