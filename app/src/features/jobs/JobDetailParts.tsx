import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Gauge,
  Hand,
  Map as MapIcon,
  MapPin,
  Minus,
  Package,
  PauseCircle,
  Route,
  X,
} from 'lucide-react-native';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { ProgressMeter, StatusPill, Text } from '../../shared/ui';
import type { MeterTone } from '../../shared/ui';
import { BatteryIndicator, OnlineBadge } from '../../shared/ui/RobotBadges';
import type { PlaceDirectory } from '../../shared/places/placeDirectory';
import { t } from '../../shared/i18n';
import type { AppJobItem, AppJobTaskItem, JobContainerItem } from './jobData';
import {
  formatHistoryDateHeader,
  formatJobClockTime,
  formatJobDuration,
  formatPlaceDisplayName,
  humanizeProblemCode,
  isTerminalJobStatus,
  JOB_STATUS_PRESENTATION,
  jobStepTitle,
} from './jobData';
import type { JobStatus, JobStepResponse } from '../../shared/types/contracts';
import { containerRoutes, groupStops, stopStatus } from './jobStops';

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

function toneColors(colors: ThemeColors, tone: Tone) {
  switch (tone) {
    case 'success': return { fg: colors.successText, bg: colors.successBg, border: colors.successBorder, solid: colors.success };
    case 'info': return { fg: colors.primaryText, bg: colors.primaryLight, border: colors.primaryBorder, solid: colors.primary };
    case 'warning': return { fg: colors.warningText, bg: colors.warningBg, border: colors.warningBorder, solid: colors.warning };
    case 'danger': return { fg: colors.dangerText, bg: colors.dangerBg, border: colors.dangerBorder, solid: colors.danger };
    default: return { fg: colors.textSecondary, bg: colors.surfaceMuted, border: colors.border, solid: colors.textMuted };
  }
}

function stepTone(status: string): Tone {
  if (status === 'COMPLETED') return 'success';
  if (status === 'EXECUTING' || status === 'RUNNING') return 'info';
  if (status === 'WAITING' || status === 'PAUSED') return 'warning';
  if (status === 'FAILED') return 'danger';
  return 'neutral';
}

const STEP_STATUS: Record<string, string> = {
  PENDING: 'Not started', READY: 'Ready', EXECUTING: 'In progress', RUNNING: 'In progress', WAITING: 'Waiting for staff',
  PAUSED: 'Paused', COMPLETED: 'Done', FAILED: 'Failed', SKIPPED: 'Skipped', CANCELLED: 'Cancelled',
};

/** What a step does, in words a staff member uses, with the place by name. */
export function stepSentence(step: JobStepResponse, place: string, container?: string): string {
  const code = `${step.operationCode} ${step.workflowStepKey}`.toUpperCase();
  if (step.stepType === 'MOVE') return t('Robot drives to {place}', { place });
  if (step.stepType === 'HUMAN_INTERACTION') {
    if (code.includes('PICKUP')) return container ? t('Staff loads {container} onto the robot', { container }) : t('Staff loads the container at {place}', { place });
    if (code.includes('DROPOFF') || code.includes('DELIVER')) return container ? t('Staff unloads {container} at {place}', { container, place }) : t('Staff unloads the container at {place}', { place });
    return t('Staff confirms at {place}', { place });
  }
  if (step.stepType === 'WAIT') return t('Wait at {place}', { place });
  return jobStepTitle(step);
}

/** The task's headline: "Pick up at Shelf C 1" / "Deliver to Shelf A 2". */
export function taskSentence(task: AppJobTaskItem, places: PlaceDirectory): string {
  const place = formatPlaceDisplayName(places, task.endpointCode, t('the stop'));
  const action = task.contextValues?.stopAction;
  if (action === 'PICKUP') return t('Pick up at {place}', { place });
  if (action === 'DROPOFF') return t('Deliver to {place}', { place });
  return task.title;
}

interface OverviewProps {
  job: AppJobItem;
  places: PlaceDirectory;
  robotName?: string | null;
  online: boolean | null;
  speed: number | null;
  battery: number | null;
  charging: boolean;
  onOpenMap?: () => void;
  language?: 'en' | 'vi';
  cancelReason?: string | null;
}

/** Status, the trip by place name, progress/execution summary, and the robot context. */
export function JobOverviewCard({
  job,
  places,
  online,
  speed,
  battery,
  charging,
  onOpenMap,
  language = 'en',
  cancelReason,
}: OverviewProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const presentation = JOB_STATUS_PRESENTATION[job.status];
  const from = formatPlaceDisplayName(places, job.sourceEndpointCode, t('Pick-up'));
  const drops = [...new Set(job.tasks.filter(task => task.contextValues?.stopAction === 'DROPOFF' && task.endpointCode).map(task => task.endpointCode as string))];
  const to = drops.length > 1
    ? drops.map(code => formatPlaceDisplayName(places, code)).join(', ')
    : formatPlaceDisplayName(places, drops[0] ?? job.destinationEndpointCode, t('Drop-off'));
  const assigned = !!job.assignedRobotId || (!!job.robot && job.robot !== 'Unassigned');
  const progress = job.progressPercent ?? 0;
  const terminal = isTerminalJobStatus(job.status);
  const showMapLink = Boolean(onOpenMap) && (!terminal || (job.status === 'COMPLETED' && assigned));

  const endIso = job.completedAt ?? job.createdAtUtc;
  const endDateLabel = endIso ? formatHistoryDateHeader(endIso, new Date(), language) : null;
  const endClockLabel = formatJobClockTime(endIso);
  const endTimestamp = endDateLabel && endClockLabel
    ? `${endDateLabel} · ${endClockLabel}`
    : endClockLabel || endDateLabel;
  const durationLabel = job.status === 'COMPLETED'
    ? formatJobDuration(job.startedAt ?? job.createdAtUtc, job.completedAt, language)
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <StatusPill
          status={job.status}
          label={presentation.label}
          tone={presentation.tone}
          size="sm"
          dot
        />
        {showMapLink ? (
          <Pressable
            onPress={onOpenMap}
            hitSlop={6}
            style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View on map"
          >
            <MapIcon size={15} color={colors.primaryText} />
            <Text variant="caption" fontWeight="700" color={colors.primaryText}>View map</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.route}>
        <View style={styles.routeEnd}>
          <Text variant="caption" color="textSecondary">From</Text>
          <Text variant="headline" numberOfLines={2}>{from}</Text>
        </View>
        <ArrowRight size={16} color={colors.textMuted} />
        <View style={styles.routeEnd}>
          <Text variant="caption" color="textSecondary">To</Text>
          <Text variant="headline" numberOfLines={2}>{to}</Text>
        </View>
      </View>

      {terminal ? (
        <View style={styles.terminalSummary}>
          <View style={styles.rowBetween}>
            {assigned ? (
              <View style={styles.terminalRobot}>
                <Bot size={16} color={colors.textSecondary} />
                <Text variant="code" fontWeight="700" color="textPrimary">{job.robot}</Text>
              </View>
            ) : (
              <Text variant="caption" color="textSecondary">
                {job.status === 'CANCELLED' ? 'Cancelled before dispatch' : 'No robot assigned'}
              </Text>
            )}
            {endTimestamp ? (
              <Text variant="caption" color="textSecondary" style={styles.tabularNums}>
                {durationLabel ? `${endTimestamp} · ${durationLabel}` : endTimestamp}
              </Text>
            ) : null}
          </View>

          {job.status === 'CANCELLED' && cancelReason ? (
            <View style={styles.cancelNotice}>
              <AlertTriangle size={14} color={colors.dangerText} style={{ marginTop: 1, flexShrink: 0 }} />
              <Text variant="caption" color="dangerText" style={{ flex: 1 }}>
                {cancelReason}
              </Text>
            </View>
          ) : null}

          {job.status === 'FAILED' && (job.failureMessage || job.failureCode) ? (
            <View style={styles.cancelNotice}>
              <AlertTriangle size={14} color={colors.dangerText} style={{ marginTop: 1, flexShrink: 0 }} />
              <Text variant="caption" color="dangerText" style={{ flex: 1 }}>
                {job.failureMessage || humanizeProblemCode(job.failureCode)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          <View style={{ gap: 6 }}>
            <View style={styles.rowBetween}>
              <Text variant="caption" color="textSecondary">Progress</Text>
              <Text variant="caption" fontWeight="700" style={styles.tabularNums}>{progress}%</Text>
            </View>
            <ProgressMeter
              value={progress}
              tone={presentation.tone as MeterTone}
              accessibilityLabel={`${job.id} progress ${progress} percent`}
            />
          </View>

          <View style={styles.robotBox}>
            <Bot size={20} color={assigned ? colors.textPrimary : colors.textMuted} />
            {assigned ? (
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={styles.rowBetween}>
                  <Text variant="code" fontWeight="700" color="textPrimary" numberOfLines={1} style={styles.robotCodeTitle}>
                    {job.robot}
                  </Text>
                  {online !== null ? <OnlineBadge online={online} /> : null}
                </View>
                <View style={styles.robotStats}>
                  <View style={styles.robotStat}>
                    <Gauge size={15} color={colors.textSecondary} />
                    <Text variant="bodyMedium" fontWeight="600" style={styles.tabularNums}>
                      {speed !== null ? `${Math.abs(speed).toFixed(2)} m/s` : '—'}
                    </Text>
                  </View>
                  <BatteryIndicator percent={battery} charging={charging} />
                </View>
              </View>
            ) : (
              <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>
                Awaiting robot assignment
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const CONTAINER_STATE: Record<string, { label: string; tone: Tone }> = {
  PICKUP: { label: 'Waiting for pick-up', tone: 'info' },
  'KEEP ONBOARD': { label: 'On the robot', tone: 'warning' },
  UNLOAD: { label: 'To unload here', tone: 'warning' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
};

/** Every container of the job, its state, and where it goes. */
export function JobContainersCard({
  containers,
  places,
  from,
  to,
  tasks,
  jobStatus,
}: {
  containers: JobContainerItem[];
  places: PlaceDirectory;
  from: string;
  to: string;
  tasks: AppJobTaskItem[];
  jobStatus?: JobStatus;
}) {
  const { styles, colors } = useThemedStyles(createStyles);
  if (!containers.length) return null;
  const routes = containerRoutes(tasks);
  const countLabel = containers.length === 1
    ? t('1 container')
    : t('{count} containers', { count: containers.length });

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Package size={18} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">Containers</Text>
          <Text variant="caption" color="textSecondary">{countLabel}</Text>
        </View>
      </View>
      {containers.map(container => {
        const isCancelledContainer = jobStatus === 'CANCELLED' && container.action !== 'DELIVERED';
        const state = isCancelledContainer
          ? { label: 'Cancelled', tone: 'neutral' as Tone }
          : CONTAINER_STATE[container.action] ?? { label: container.action, tone: 'neutral' as Tone };
        const fromPlace = routes[container.code]?.from
          ? formatPlaceDisplayName(places, routes[container.code].from)
          : from;
        const toPlace = routes[container.code]?.to
          ? formatPlaceDisplayName(places, routes[container.code].to)
          : to;

        return (
          <View key={container.containerId ?? container.code} style={styles.containerRow}>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text variant="code" fontWeight="700" color="textPrimary">{container.code}</Text>
              {container.product && container.product !== 'Unknown Product' ? (
                <Text variant="caption" color="textSecondary" numberOfLines={1}>{container.product}</Text>
              ) : null}
              <View style={styles.inlineRoute}>
                <MapPin size={12} color={colors.textMuted} style={{ flexShrink: 0 }} />
                <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>{fromPlace}</Text>
                <ArrowRight size={12} color={colors.textMuted} style={{ flexShrink: 0 }} />
                <Text variant="caption" color="textPrimary" fontWeight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{toPlace}</Text>
              </View>
            </View>
            <StatusPill
              status={isCancelledContainer ? 'CANCELLED' : container.action}
              label={t(state.label)}
              tone={state.tone}
              size="sm"
            />
          </View>
        );
      })}
    </View>
  );
}

function StepIcon({ status, type, color, mutedColor }: { status: string; type: string; color: string; mutedColor: string }) {
  if (status === 'COMPLETED') return <Check size={14} color="#fff" strokeWidth={3} />;
  if (status === 'FAILED') return <X size={14} color="#fff" strokeWidth={3} />;
  if (status === 'CANCELLED' || status === 'SKIPPED') return <Minus size={13} color={mutedColor} strokeWidth={2.5} />;
  if (status === 'PAUSED') return <PauseCircle size={14} color="#fff" />;
  if (status === 'WAITING') return <Hand size={14} color="#fff" />;
  if (type === 'MOVE') return <Route size={13} color={status === 'EXECUTING' ? '#fff' : color} />;
  if (status === 'EXECUTING') return <Clock size={13} color="#fff" />;
  return <Circle size={10} color={color} />;
}

/** The workflow as stops; each opens to its steps. The current stop is open by default. */
export function JobStepsAccordion({
  tasks,
  places,
  activeStepId,
  suppressedErrorMessage,
}: {
  tasks: AppJobTaskItem[];
  places: PlaceDirectory;
  activeStepId?: string;
  suppressedErrorMessage?: string | null;
}) {
  const { styles, colors } = useThemedStyles(createStyles);
  const stops = groupStops(tasks);
  const current = stops.find(stop => stop.steps.some(item => item.step.id === activeStepId))
    ?? stops.find(stop => stopStatus(stop) !== 'COMPLETED');
  const [open, setOpen] = useState<Record<string, boolean>>(() => (current ? { [current.key]: true } : {}));
  const done = stops.filter(stop => stopStatus(stop) === 'COMPLETED').length;

  return (
    <View style={styles.card}>
      <View style={styles.sectionHeader}>
        <Route size={18} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">Workflow Steps</Text>
          <Text variant="caption" color="textSecondary">{t('{done} of {total} stops done', { done, total: stops.length })}</Text>
        </View>
      </View>
      {stops.map((stop, index) => {
        const status = stopStatus(stop);
        const tone = toneColors(colors, stepTone(status));
        const expanded = open[stop.key] ?? false;
        const place = formatPlaceDisplayName(places, stop.endpointCode, t('the stop'));
        const title = stop.action === 'PICKUP'
          ? t('Pick up at {place}', { place })
          : stop.action === 'DROPOFF'
            ? t('Deliver to {place}', { place })
            : stop.tasks[0].title;
        const stepsDone = stop.steps.filter(item => item.step.status === 'COMPLETED').length;
        const highlightWaiting = status === 'WAITING';

        return (
          <View
            key={stop.key}
            style={[
              styles.taskBlock,
              {
                borderColor: highlightWaiting ? colors.warningBorder : colors.border,
                backgroundColor: highlightWaiting && expanded ? colors.warningBg : colors.surface,
              },
            ]}
          >
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpen(previous => ({ ...previous, [stop.key]: !expanded }));
              }}
              style={styles.taskHeader}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <View style={[styles.taskNumber, { backgroundColor: tone.solid }]}>
                {status === 'COMPLETED'
                  ? <Check size={14} color="#fff" strokeWidth={3} />
                  : status === 'CANCELLED'
                    ? <Minus size={14} color="#fff" strokeWidth={2.5} />
                    : <Text variant="caption" fontWeight="800" color="#fff">{index + 1}</Text>}
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="bodyMedium" fontWeight="700">{title}</Text>
                <Text variant="caption" color={tone.fg} fontWeight="600">
                  {t(STEP_STATUS[status] ?? status)} · {t('{done}/{total} steps', { done: stepsDone, total: stop.steps.length })}
                </Text>
              </View>
              {expanded ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
            </Pressable>
            {expanded ? (
              <View style={styles.stepList}>
                {stop.steps.map(({ step, containerCode }, stepIndex) => {
                  const stepColors = toneColors(colors, stepTone(step.status));
                  const last = stepIndex === stop.steps.length - 1;
                  const isOutlinedNode =
                    step.status === 'PENDING' ||
                    step.status === 'READY' ||
                    step.status === 'CANCELLED' ||
                    step.status === 'SKIPPED';
                  const showStepError = Boolean(
                    step.errorMessage &&
                    (!suppressedErrorMessage || step.errorMessage.trim() !== suppressedErrorMessage.trim()),
                  );

                  return (
                    <View key={step.id} style={styles.stepRow}>
                      <View style={styles.stepRail}>
                        <View
                          style={[
                            styles.stepDot,
                            {
                              backgroundColor: isOutlinedNode ? colors.surface : stepColors.solid,
                              borderColor: step.status === 'CANCELLED' || step.status === 'SKIPPED'
                                ? colors.borderStrong
                                : stepColors.solid,
                            },
                          ]}
                        >
                          <StepIcon
                            status={step.status}
                            type={step.stepType}
                            color={stepColors.solid}
                            mutedColor={colors.textMuted}
                          />
                        </View>
                        {!last ? (
                          <View
                            style={[
                              styles.stepLine,
                              { backgroundColor: step.status === 'COMPLETED' ? colors.success : colors.border },
                            ]}
                          />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 12, gap: 2 }}>
                        <Text variant="bodyMedium" fontWeight={step.id === activeStepId ? '700' : '500'}>
                          {stepSentence(step, place, containerCode)}
                        </Text>
                        <Text variant="caption" color={stepColors.fg}>{t(STEP_STATUS[step.status] ?? step.status)}</Text>
                        {showStepError ? (
                          <View style={styles.stepError}>
                            <AlertTriangle size={12} color={colors.dangerText} style={{ marginTop: 2, flexShrink: 0 }} />
                            <Text variant="caption" color="dangerText" style={{ flex: 1 }}>{step.errorMessage}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Compact single-row issue action while the job is open. */
export function ReportProblemCard({ onPress }: { onPress: () => void }) {
  const { styles, colors } = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.reportRow, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Report an Issue"
    >
      <View style={styles.reportIconWell}>
        <AlertTriangle size={16} color={colors.dangerText} />
      </View>
      <Text variant="bodyMedium" fontWeight="600" color={colors.dangerText} style={{ flex: 1 }}>
        Report an Issue
      </Text>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  pressed: { opacity: 0.85 },
  card: { gap: 14, padding: 16, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primaryLight },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeEnd: { flex: 1, minWidth: 0, gap: 2, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  terminalSummary: {
    gap: 10,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
  },
  terminalRobot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cancelNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tabularNums: {
    fontVariant: ['tabular-nums'],
  },
  robotBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  robotCodeTitle: { fontSize: 14, fontFamily: typography.fontMono, flexShrink: 1 },
  robotStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  robotStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  containerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  inlineRoute: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taskBlock: { borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  taskNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepList: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 26 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, flex: 1, minHeight: 12 },
  stepError: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reportIconWell: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
