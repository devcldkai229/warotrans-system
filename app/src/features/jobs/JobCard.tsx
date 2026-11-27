import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ArrowRight, Bot, ChevronRight, Package, Route } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { JobStatus } from '../../shared/types/contracts';
import { Button, Card, ProgressMeter, StatusPill, Text } from '../../shared/ui';
import type { ButtonVariant, MeterTone } from '../../shared/ui';
import { AppJobItem, formatJobClockTime, JOB_STATUS_PRESENTATION } from './jobData';

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
  /** `'history'` renders a compact, full-card tappable log entry without progress chrome. */
  variant?: 'active' | 'history';
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
export function JobCard({ job, onPress, onAccept, variant = 'active' }: JobCardProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const effectiveStatus = job.status;
  const status = JOB_STATUS_PRESENTATION[effectiveStatus];
  const action: JobAction = job.hasWaitingHandover
    ? { title: 'View Handover', variant: 'primary', icon: ArrowRight, iconPosition: 'right' }
    : ACTION_BY_STATUS[effectiveStatus];
  const primaryCode = job.containers?.[0]?.code ?? job.payloadSummary;
  const extraCount = (job.containers?.length ?? 0) > 1 ? job.containers!.length - 1 : 0;
  const containerCode = extraCount > 0 ? `${primaryCode} (+${extraCount})` : primaryCode;
  const isUnstarted = effectiveStatus === 'CREATED' || effectiveStatus === 'QUEUED';
  const routeParts = job.route.split(' ➔ ');
  const sourceLabel = job.sourceName || routeParts[0] || job.sourceEndpointCode || 'Pickup';
  const destinationLabel = job.destinationName || routeParts[1] || job.destinationEndpointCode || 'Drop-off';
  const hasAssignedRobot = Boolean(job.robot && job.robot !== 'Unassigned');

  if (variant === 'history') {
    const timeLabel = formatJobClockTime(job.completedAt ?? job.createdAtUtc);
    const workflowLabel = t(workflowTag(job.workflowName));

    return (
      <Card
        padding="md"
        gap={10}
        onPress={onPress}
        accessibilityLabel={`${t(status.label)} · ${job.jobNo || job.id}`}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="bodyMedium" style={[styles.jobId, styles.tabularNums]} numberOfLines={1}>
              {job.jobNo || job.id}
            </Text>
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
              {timeLabel ? `${workflowLabel} · ${timeLabel}` : workflowLabel}
            </Text>
          </View>
          <StatusPill
            status={effectiveStatus}
            label={status.label}
            tone={status.tone}
            size="sm"
            dot
          />
        </View>

        <View style={styles.historyRouteRow}>
          <View style={styles.historyRouteTrack}>
            <Route size={14} color={colors.textMuted} style={styles.insetIcon} />
            <Text variant="bodyMedium" color={colors.textPrimary} numberOfLines={1} style={styles.routeEndpoint}>
              {sourceLabel}
            </Text>
            <ArrowRight size={13} color={colors.textMuted} style={styles.insetIcon} />
            <Text variant="bodyMedium" color={colors.textPrimary} numberOfLines={1} style={styles.routeEndpoint}>
              {destinationLabel}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} style={styles.insetIcon} />
        </View>

        {effectiveStatus === 'FAILED' && job.failureMessage ? (
          <Text variant="caption" color={colors.dangerText} numberOfLines={1}>
            {job.failureMessage}
          </Text>
        ) : null}

        <View style={styles.historyMetaRow}>
          <View style={styles.metaItemLeft}>
            <Package size={14} color={colors.textMuted} style={styles.insetIcon} />
            <Text variant="code" color={colors.textPrimary} numberOfLines={1} style={styles.metaCode}>
              {containerCode}
            </Text>
          </View>
          {hasAssignedRobot ? (
            <View style={styles.robotTag}>
              <Bot size={14} color={colors.textMuted} style={styles.insetIcon} />
              <Text variant="code" color={colors.textSecondary} style={styles.robotCode}>
                {job.robot}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>
    );
  }

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
            <Text variant="bodyMedium" style={[styles.jobId, styles.tabularNums]} numberOfLines={1}>
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
            <Route size={15} color={colors.textMuted} style={styles.insetIcon} />
            <View style={styles.routeInline}>
              <Text variant="bodyMedium" color={colors.textPrimary} numberOfLines={1} style={styles.routeEndpoint}>
                {sourceLabel}
              </Text>
              <ArrowRight size={13} color={colors.textMuted} style={styles.insetIcon} />
              <Text variant="bodyMedium" color={colors.textPrimary} numberOfLines={1} style={styles.routeEndpoint}>
                {destinationLabel}
              </Text>
            </View>
          </View>

          <View style={styles.insetMetaRow}>
            <View style={styles.metaItemLeft}>
              <Package size={15} color={colors.textMuted} style={styles.insetIcon} />
              <Text variant="code" color={colors.textPrimary} numberOfLines={1} style={styles.metaCode}>
                {containerCode}
              </Text>
            </View>
            {hasAssignedRobot ? (
              <View style={styles.robotTag}>
                <Bot size={14} color={colors.textMuted} style={styles.insetIcon} />
                <Text variant="code" color={colors.textSecondary} style={styles.robotCode}>
                  {job.robot}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {!isUnstarted && (
          <View style={styles.progressBlock}>
            <ProgressMeter
              value={job.progressPercent ?? 0}
              tone={METER_BY_STATUS[job.status]}
              accessibilityLabel={`${job.id} progress ${job.progressPercent ?? 0} percent`}
            />
            {job.currentStop.trim() ? (
              <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {job.currentStop}
              </Text>
            ) : null}
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  tabularNums: {
    fontVariant: ['tabular-nums'],
  },
  historyRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  historyRouteTrack: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  routeEndpoint: {
    flexShrink: 1,
    fontWeight: '600',
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  metaItemLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaCode: {
    flexShrink: 1,
    fontWeight: '600',
    fontFamily: typography.fontMono,
  },
  robotTag: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  robotCode: {
    fontWeight: '600',
    fontFamily: typography.fontMono,
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
  routeInline: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  insetMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  insetIcon: {
    flexShrink: 0,
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
