import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight, Boxes, Truck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { JobStatus } from '../../shared/types/contracts';
import { Button, Card, ProgressMeter, StatusPill, Text } from '../../shared/ui';
import type { ButtonVariant, MeterTone } from '../../shared/ui';
import { AppJobItem, JOB_STATUS_PRESENTATION } from './jobData';

/**
 * Meter fill per lifecycle state, so a card's progress tells the same story as
 * its pill. Visual only — it is the one part of the presentation the other tabs
 * have no use for, which is why it stays here rather than in `jobData`.
 */
const METER_BY_STATUS: Record<JobStatus, MeterTone> = {
  CREATED: 'neutral',
  QUEUED: 'neutral',
  ASSIGNED: 'warning',
  RUNNING: 'primary',
  PAUSED: 'warning',
  REASSIGNING: 'warning',
  RECOVERY_REQUIRED: 'danger',
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

interface JobAction {
  title: string;
  variant: ButtonVariant;
  /** `null` renders the button without an icon. */
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
}

/**
 * The one action the card offers, keyed by lifecycle state.
 *
 * The rule behind it: a card must never ask for an action the job cannot take.
 * A `QUEUED` job has no robot to hand anything to, a `FAILED` one needs
 * diagnosis before it needs progress, and a `CANCELLED` one only has a record
 * left to read.
 */
const ACTION_BY_STATUS: Record<JobStatus, JobAction> = {
  CREATED: { title: 'View Details', variant: 'outline' },
  QUEUED: { title: 'View Details', variant: 'outline' },
  ASSIGNED: { title: 'View Details', variant: 'outline' },
  RUNNING: { title: 'View Details', variant: 'outline' },
  PAUSED: { title: 'View Paused Job', variant: 'outline' },
  REASSIGNING: { title: 'View Details', variant: 'outline' },
  RECOVERY_REQUIRED: { title: 'Inspect Issue', variant: 'danger' },
  COMPLETED: { title: 'View Summary', variant: 'ghost' },
  FAILED: { title: 'Inspect Issue', variant: 'danger' },
  CANCELLED: { title: 'View Summary', variant: 'ghost' },
};

interface JobCardProps {
  job: AppJobItem;
  /** Opens the job. Wired to both the card itself and its footer button. */
  onPress: () => void;
  /** Optional quick action to claim / accept an unassigned task from the queue. */
  onAccept?: () => void;
}

/**
 * `Inbound Putaway (Multi-Drop)` -> `Inbound Putaway`.
 *
 * The parenthetical variant name is noise on a card that is already carrying a
 * job ID, a status and a route — it belongs on the detail screen, where there
 * is room to explain the difference.
 */
function workflowTag(workflowName: string): string {
  return workflowName.split('(')[0].trim() || workflowName;
}

/**
 * One job, as a card.
 *
 * Reading order is what an operator scans: *which job* -> *where does it go* ->
 * *what is on it* -> *what do I do*. So the route and payload sit in an inset
 * block rather than in the top row: they are the answer, the ID and the status
 * are only the handle to it.
 *
 * The whole card opens the job; the button inside it is the primary action for
 * that state, so a queued job never offers "Start handover" against a robot
 * that has not been assigned yet.
 *
 * Lifecycle is read from the backend `JobStatus` alone — one axis, one table per
 * concern, no second "kind" field to drift out of sync with it.
 */
export function JobCard({ job, onPress, onAccept }: JobCardProps) {
  const effectiveStatus = job.status;
  const status = JOB_STATUS_PRESENTATION[effectiveStatus];
  const action: JobAction = job.hasWaitingHandover
    ? { title: 'View Handover', variant: 'primary', icon: ArrowRight, iconPosition: 'right' }
    : ACTION_BY_STATUS[effectiveStatus];
  const primaryCode = job.containers?.[0]?.code ?? job.payloadSummary;
  const extraCount = (job.containers?.length ?? 0) > 1 ? job.containers!.length - 1 : 0;
  const containerCode = extraCount > 0 ? `${primaryCode} (+${extraCount})` : primaryCode;
  const isUnstarted = effectiveStatus === 'CREATED' || effectiveStatus === 'QUEUED';

  return (
    <Card
      padding="md"
      gap={12}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${action.title} · ${job.id}`}
        style={styles.cardDetails}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="bodyMedium" style={styles.jobId} numberOfLines={1}>
              {job.jobNo || job.id}
            </Text>
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {workflowTag(job.workflowName)}
            </Text>
          </View>
          <StatusPill
            status={effectiveStatus}
            label={job.hasWaitingHandover ? 'Awaiting Handover' : status.label}
            tone={status.tone}
            size="sm"
            dot
          />
        </View>

        <View style={styles.inset}>
          <View style={styles.insetRow}>
            <Truck size={15} color={colors.textMuted} style={styles.insetIcon} />
            <Text variant="caption" color={colors.textSecondary}>
              Route
            </Text>
            <Text variant="body" numberOfLines={1} style={[styles.insetValue, styles.routeValue]}>
              {job.route}
            </Text>
          </View>

          <View style={styles.insetRow}>
            <Boxes size={15} color={colors.textMuted} style={styles.insetIcon} />
            <Text variant="caption" color={colors.textSecondary}>
              Details
            </Text>
            <Text variant="body" numberOfLines={1} style={styles.insetValue}>
              <Text style={styles.boldMono}>{containerCode}</Text>
              {job.robot ? (
                <>
                  <Text style={styles.dotSeparator}> · </Text>
                  <Text style={styles.boldRobot}>{job.robot}</Text>
                </>
              ) : null}
            </Text>
          </View>
        </View>

        {!isUnstarted && (
          <View style={styles.progressBlock}>
            <ProgressMeter
              value={job.progressPercent ?? 0}
              tone={METER_BY_STATUS[job.status]}
              accessibilityLabel={`${job.id} progress ${job.progressPercent ?? 0} percent`}
            />
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {job.currentStop}
            </Text>
          </View>
        )}
      </Pressable>

      {onAccept && (isUnstarted || (!job.isMine && (job.status === 'ASSIGNED' || job.status === 'PAUSED'))) ? (
        <Button
          title={isUnstarted ? 'Start Job' : 'Accept Task'}
          onPress={onAccept}
          variant="primary"
          size="md"
          fullWidth
          icon={ArrowRight}
          iconPosition="right"
          accessibilityLabel={`Accept task ${job.id}`}
        />
      ) : (
        <Button
          title={action.title}
          onPress={onPress}
          variant={action.variant}
          size="md"
          fullWidth
          icon={action.icon}
          iconPosition={action.iconPosition ?? 'left'}
          accessibilityLabel={`${action.title} for ${job.id}`}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardDetails: { gap: 12, minHeight: 44 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  jobId: {
    fontWeight: '700',
  },
  inset: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 12,
    gap: 8,
  },
  insetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  insetIcon: {
    flexShrink: 0,
  },
  insetValue: {
    flex: 1,
    minWidth: 0,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  routeValue: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  boldMono: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  boldRobot: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dotSeparator: {
    color: colors.textMuted,
  },
  progressBlock: {
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flexBtn: {
    flex: 1,
  },
});
