import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, View } from 'react-native';
import {
  AlertTriangle, ArrowRight, Bot, Check, ChevronDown, ChevronUp, Circle, Clock, Gauge, Hand, Map as MapIcon, MapPin, Package, PauseCircle, Truck, X,
} from 'lucide-react-native';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { Text } from '../../shared/ui';
import { BatteryIndicator, OnlineBadge } from '../../shared/ui/RobotBadges';
import type { PlaceDirectory } from '../../shared/places/placeDirectory';
import { t } from '../../shared/i18n';
import type { AppJobItem, AppJobTaskItem, JobContainerItem } from './jobData';
import { JOB_STATUS_PRESENTATION, jobStepTitle } from './jobData';
import type { JobStepResponse } from '../../shared/types/contracts';
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
  const place = places.name(task.endpointCode, t('the stop'));
  const action = task.contextValues?.stopAction;
  if (action === 'PICKUP') return t('Pick up at {place}', { place });
  if (action === 'DROPOFF') return t('Deliver to {place}', { place });
  return task.title;
}

interface OverviewProps {
  job: AppJobItem;
  places: PlaceDirectory;
  robotName: string | null;
  online: boolean | null;
  speed: number | null;
  battery: number | null;
  charging: boolean;
  onOpenMap: () => void;
}

/** Status, the trip by place name, progress, and the robot with live speed and battery. */
export function JobOverviewCard({ job, places, robotName, online, speed, battery, charging, onOpenMap }: OverviewProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const presentation = JOB_STATUS_PRESENTATION[job.status];
  const tone = toneColors(colors, presentation.tone as Tone);
  const from = places.name(job.sourceEndpointCode, t('Pick-up'));
  const drops = [...new Set(job.tasks.filter(task => task.contextValues?.stopAction === 'DROPOFF' && task.endpointCode).map(task => task.endpointCode as string))];
  const to = drops.length > 1 ? drops.map(code => places.name(code)).join(', ') : places.name(drops[0] ?? job.destinationEndpointCode, t('Drop-off'));
  const assigned = !!job.assignedRobotId || (!!job.robot && job.robot !== 'Unassigned');
  const progress = job.progressPercent ?? 0;
  return <View style={[styles.card, { borderColor: tone.border }]}>
    <View style={styles.rowBetween}>
      <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
        <View style={[styles.dot, { backgroundColor: tone.solid }]} />
        <Text variant="caption" fontWeight="700" color={tone.fg}>{presentation.label}</Text>
      </View>
      <Pressable onPress={onOpenMap} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="View on map">
        <MapIcon size={15} color={colors.primaryText} />
        <Text variant="caption" fontWeight="700" color={colors.primaryText}>View map</Text>
      </Pressable>
    </View>

    <View style={styles.route}>
      <View style={styles.routeEnd}>
        <Text variant="caption" color="textSecondary">From</Text>
        <Text variant="headline" numberOfLines={2}>{from}</Text>
      </View>
      <View style={styles.routeArrow}><ArrowRight size={18} color={colors.primaryText} /></View>
      <View style={styles.routeEnd}>
        <Text variant="caption" color="textSecondary">To</Text>
        <Text variant="headline" numberOfLines={2}>{to}</Text>
      </View>
    </View>

    <View style={{ gap: 6 }}>
      <View style={styles.rowBetween}>
        <Text variant="caption" color="textSecondary">Progress</Text>
        <Text variant="caption" fontWeight="700">{progress}%</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${progress}%`, backgroundColor: tone.solid }]} /></View>
    </View>

    <View style={styles.robotBox}>
      <View style={[styles.robotIcon, { backgroundColor: assigned ? colors.primaryLight : colors.surfaceMuted }]}>
        <Bot size={22} color={assigned ? colors.primaryText : colors.textMuted} />
      </View>
      {assigned ? <>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.rowBetween}>
            <Text variant="bodyMedium" fontWeight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{robotName || job.robot}</Text>
            {online !== null ? <OnlineBadge online={online} /> : null}
          </View>
          <View style={styles.robotStats}>
            <View style={styles.robotStat}>
              <Gauge size={16} color={colors.textSecondary} />
              <Text variant="bodyMedium" fontWeight="700">{speed !== null ? `${Math.abs(speed).toFixed(2)} m/s` : '—'}</Text>
            </View>
            <BatteryIndicator percent={battery} charging={charging} />
          </View>
        </View>
      </> : <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" fontWeight="700">No robot yet</Text>
        <Text variant="caption" color="textSecondary">A free robot is assigned when the job starts.</Text>
      </View>}
    </View>
  </View>;
}

const CONTAINER_STATE: Record<string, { label: string; tone: Tone }> = {
  PICKUP: { label: 'Waiting for pick-up', tone: 'info' },
  'KEEP ONBOARD': { label: 'On the robot', tone: 'warning' },
  UNLOAD: { label: 'To unload here', tone: 'warning' },
  DELIVERED: { label: 'Delivered', tone: 'success' },
};

/** Every container of the job, its state, and where it goes. */
export function JobContainersCard({ containers, places, from, to, tasks }: { containers: JobContainerItem[]; places: PlaceDirectory; from: string; to: string; tasks: AppJobTaskItem[] }) {
  const { styles, colors } = useThemedStyles(createStyles);
  if (!containers.length) return null;
  const routes = containerRoutes(tasks);
  return <View style={styles.card}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}><Package size={18} color={colors.primaryText} /></View>
      <View style={{ flex: 1 }}>
        <Text variant="headline">Containers</Text>
        <Text variant="caption" color="textSecondary">{t('{count} containers in this job', { count: containers.length })}</Text>
      </View>
    </View>
    {containers.map(container => {
      const state = CONTAINER_STATE[container.action] ?? { label: container.action, tone: 'neutral' as Tone };
      const tone = toneColors(colors, state.tone);
      return <View key={container.containerId ?? container.code} style={styles.containerRow}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="code" fontWeight="700">{container.code}</Text>
          {container.product && container.product !== 'Unknown Product' ? <Text variant="caption" color="textSecondary" numberOfLines={1}>{container.product}</Text> : null}
          <View style={styles.inlineRoute}>
            <MapPin size={12} color={colors.textMuted} />
            <Text variant="caption" color="textSecondary" numberOfLines={1}>{routes[container.code]?.from ? places.name(routes[container.code].from) : from}</Text>
            <ArrowRight size={12} color={colors.textMuted} />
            <Text variant="caption" color="textPrimary" fontWeight="600" numberOfLines={1}>{routes[container.code]?.to ? places.name(routes[container.code].to) : to}</Text>
          </View>
        </View>
        <View style={[styles.smallPill, { backgroundColor: tone.bg }]}><Text variant="caption" fontWeight="700" color={tone.fg}>{t(state.label)}</Text></View>
      </View>;
    })}
  </View>;
}

function StepIcon({ status, type, color }: { status: string; type: string; color: string }) {
  if (status === 'COMPLETED') return <Check size={14} color="#fff" strokeWidth={3} />;
  if (status === 'FAILED') return <X size={14} color="#fff" strokeWidth={3} />;
  if (status === 'PAUSED') return <PauseCircle size={14} color="#fff" />;
  if (status === 'WAITING') return <Hand size={14} color="#fff" />;
  if (type === 'MOVE') return <Truck size={13} color={status === 'EXECUTING' ? '#fff' : color} />;
  if (status === 'EXECUTING') return <Clock size={13} color="#fff" />;
  return <Circle size={10} color={color} />;
}

/** The workflow as coloured stops; each opens to its steps. The current stop is open by default. */
export function JobStepsAccordion({ tasks, places, activeStepId }: { tasks: AppJobTaskItem[]; places: PlaceDirectory; activeStepId?: string }) {
  const { styles, colors } = useThemedStyles(createStyles);
  const stops = groupStops(tasks);
  const current = stops.find(stop => stop.steps.some(item => item.step.id === activeStepId))
    ?? stops.find(stop => stopStatus(stop) !== 'COMPLETED');
  const [open, setOpen] = useState<Record<string, boolean>>(() => (current ? { [current.key]: true } : {}));
  const done = stops.filter(stop => stopStatus(stop) === 'COMPLETED').length;
  return <View style={styles.card}>
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}><Truck size={18} color={colors.primaryText} /></View>
      <View style={{ flex: 1 }}>
        <Text variant="headline">Workflow Steps</Text>
        <Text variant="caption" color="textSecondary">{t('{done} of {total} stops done', { done, total: stops.length })}</Text>
      </View>
    </View>
    {stops.map((stop, index) => {
      const status = stopStatus(stop);
      const tone = toneColors(colors, stepTone(status));
      const expanded = open[stop.key] ?? false;
      const place = places.name(stop.endpointCode, t('the stop'));
      const title = stop.action === 'PICKUP' ? t('Pick up at {place}', { place }) : stop.action === 'DROPOFF' ? t('Deliver to {place}', { place }) : stop.tasks[0].title;
      const stepsDone = stop.steps.filter(item => item.step.status === 'COMPLETED').length;
      return <View key={stop.key} style={[styles.taskBlock, { borderColor: tone.border, backgroundColor: expanded ? tone.bg : colors.surface }]}>
        <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setOpen(previous => ({ ...previous, [stop.key]: !expanded })); }}
          style={styles.taskHeader} accessibilityRole="button" accessibilityState={{ expanded }}>
          <View style={[styles.taskNumber, { backgroundColor: tone.solid }]}>
            {status === 'COMPLETED' ? <Check size={14} color="#fff" strokeWidth={3} /> : <Text variant="caption" fontWeight="800" color="#fff">{index + 1}</Text>}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyMedium" fontWeight="700">{title}</Text>
            <Text variant="caption" color={tone.fg} fontWeight="600">{t(STEP_STATUS[status] ?? status)} · {t('{done}/{total} steps', { done: stepsDone, total: stop.steps.length })}</Text>
          </View>
          {expanded ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
        </Pressable>
        {expanded ? <View style={styles.stepList}>
          {stop.steps.map(({ step, containerCode }, stepIndex) => {
            const stepColors = toneColors(colors, stepTone(step.status));
            const last = stepIndex === stop.steps.length - 1;
            return <View key={step.id} style={styles.stepRow}>
              <View style={styles.stepRail}>
                <View style={[styles.stepDot, { backgroundColor: step.status === 'PENDING' || step.status === 'READY' ? colors.surface : stepColors.solid, borderColor: stepColors.solid }]}>
                  <StepIcon status={step.status} type={step.stepType} color={stepColors.solid} />
                </View>
                {!last ? <View style={[styles.stepLine, { backgroundColor: step.status === 'COMPLETED' ? colors.success : colors.border }]} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: last ? 0 : 12, gap: 2 }}>
                <Text variant="bodyMedium" fontWeight={step.id === activeStepId ? '700' : '500'}>{stepSentence(step, place, containerCode)}</Text>
                <Text variant="caption" color={stepColors.fg}>{t(STEP_STATUS[step.status] ?? step.status)}</Text>
                {step.errorMessage ? <View style={styles.stepError}><AlertTriangle size={12} color={colors.dangerText} /><Text variant="caption" color="dangerText" style={{ flex: 1 }}>{step.errorMessage}</Text></View> : null}
              </View>
            </View>;
          })}
        </View> : null}
      </View>;
    })}
  </View>;
}

/** Report a problem: always visible while the job is open, not hidden in a toolbar. */
export function ReportProblemCard({ onPress }: { onPress: () => void }) {
  const { styles, colors } = useThemedStyles(createStyles);
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.reportCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Report a problem">
    <View style={styles.reportIcon}><AlertTriangle size={20} color={colors.dangerText} /></View>
    <View style={{ flex: 1 }}>
      <Text variant="bodyMedium" fontWeight="700" color={colors.dangerText}>Report a problem</Text>
      <Text variant="caption" color="textSecondary">Wrong container, blocked path, damaged goods… The supervisor is told right away.</Text>
    </View>
  </Pressable>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  pressed: { opacity: 0.85 },
  card: { gap: 14, padding: 16, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  linkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.primaryLight },
  route: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeEnd: { flex: 1, gap: 2, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  routeArrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  robotBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  robotIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  robotStats: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  robotStat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  containerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  inlineRoute: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  smallPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  taskBlock: { borderRadius: radii.md, borderWidth: 1.5, overflow: 'hidden' },
  taskHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  taskNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepList: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 26 },
  stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepLine: { width: 2, flex: 1, minHeight: 12 },
  stepError: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  reportCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.dangerBorder },
  reportIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
});
