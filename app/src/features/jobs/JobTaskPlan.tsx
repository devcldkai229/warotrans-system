import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, Check, ChevronRight, Layers, MapPin, Package } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ProgressMeter, StatusPill, Text } from '../../shared/ui';
import type { JobStatus } from '../../shared/types/contracts';
import { AppJobTaskItem, jobStepTitle, jobTaskFocus } from './jobData';

interface JobTaskPlanProps {
  tasks: AppJobTaskItem[];
  jobStatus: JobStatus;
  onSelectTask: (taskId: string) => void;
}

export function JobTaskPlan({ tasks, jobStatus, onSelectTask }: JobTaskPlanProps) {
  const completedCount = tasks.filter(task => task.status === 'COMPLETED').length;
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}><Layers size={18} color={colors.primaryText} /></View>
        <View style={styles.flex}>
          <Text variant="headline">Workflow Execution Plan</Text>
          <Text variant="caption">{completedCount}/{tasks.length} Tasks Completed · Tap To View Steps</Text>
        </View>
      </View>
      {jobStatus === 'PAUSED' && <View style={styles.pauseBanner}><Text variant="caption" color={colors.warningText}>Job Paused · Execution Is On Hold</Text></View>}
      {jobStatus === 'COMPLETED' && tasks.some(task => task.status === 'RUNNING' || task.status === 'PENDING' || task.status === 'READY') &&
        <View style={styles.pauseBanner}><Text variant="caption" color={colors.warningText}>The server reports this Job completed, but some Task statuses are still open. Contact the supervisor to reconcile them before repeating any work.</Text></View>}
      {!tasks.length && <Text variant="body" color={colors.textSecondary}>No tasks are available for this job.</Text>}
      <View>
        {tasks.map((task, index) => {
          const completed = task.status === 'COMPLETED';
          const focus = jobTaskFocus(task);
          const failed = task.status === 'FAILED' || focus?.status === 'FAILED';
          const paused = task.status === 'PAUSED' || focus?.status === 'PAUSED';
          const active = task.status === 'RUNNING' || focus?.status === 'EXECUTING' || focus?.status === 'WAITING';
          const waiting = focus?.status === 'WAITING' && focus.stepType === 'HUMAN_INTERACTION';
          const doneSteps = task.steps.filter(step => step.status === 'COMPLETED').length;
          const quiet = completed || task.status === 'SKIPPED' || task.status === 'CANCELLED';
          return (
            <View key={task.id} style={styles.timelineRow}>
              <View style={styles.spine}>
                <View style={[styles.number, completed && styles.completedNumber, active && !completed && styles.activeNumber, failed && styles.failedNumber]}>
                  {failed ? <AlertTriangle size={14} color={colors.dangerText} /> : completed ? <Check size={15} color={colors.successText} /> : <Text variant="caption" color={active ? colors.primaryText : colors.textSecondary} fontWeight="600">{index + 1}</Text>}
                </View>
                {index < tasks.length - 1 && <View style={styles.line} />}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Task ${index + 1}: ${task.title}. ${task.status}. ${doneSteps} of ${task.steps.length} steps completed`}
                accessibilityHint="Opens task details"
                onPress={() => onSelectTask(task.id)}
                style={({ pressed }) => [styles.card, active && !quiet && styles.activeCard, paused && styles.pausedCard, failed && styles.failedCard, pressed && styles.pressed]}
              >
                <View style={styles.cardTop}>
                  <Text variant="bodyMedium" color={quiet ? colors.textSecondary : colors.textPrimary} style={styles.flex}>{task.title}</Text>
                  <StatusPill status={task.status} size="sm" dot />
                  <ChevronRight size={18} color={colors.textMuted} />
                </View>
                {task.endpointCode ? <View style={styles.metaRow}><MapPin size={13} color={colors.textMuted} /><Text variant="caption" style={styles.flex}>{task.endpointCode}</Text></View> : null}
                {task.containerCodes.length > 0 ? <View style={styles.metaRow}><Package size={13} color={colors.textMuted} /><Text variant="caption" numberOfLines={1} style={styles.flex}>{task.containerCodes.join(', ')}</Text></View> : null}
                <View style={styles.progressRow}>
                  <View style={styles.flex}><ProgressMeter value={task.steps.length ? doneSteps / task.steps.length * 100 : 0} tone={failed ? 'danger' : paused ? 'warning' : completed ? 'success' : 'primary'} accessibilityLabel={`Task ${index + 1} step completion`} /></View>
                  <Text variant="caption">{doneSteps}/{task.steps.length} Steps</Text>
                </View>
                {!quiet && focus && (active || paused || failed) ? <Text variant="caption" color={failed ? colors.dangerText : waiting || paused ? colors.warningText : colors.textSecondary} numberOfLines={2}>{failed ? 'Failed' : paused ? 'Paused' : waiting ? 'Waiting For Operator' : 'Current'} · {jobStepTitle(focus)}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 16 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIcon: { width: 36, height: 36, borderRadius: radii.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  pauseBanner: { padding: 10, borderRadius: radii.sm, backgroundColor: colors.warningBg },
  timelineRow: { flexDirection: 'row', gap: 10 },
  spine: { width: 26, alignItems: 'center' },
  number: { width: 26, height: 26, borderRadius: radii.pill, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  completedNumber: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  activeNumber: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  failedNumber: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  line: { width: 1, flex: 1, backgroundColor: colors.borderStrong, marginVertical: 4 },
  card: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10, gap: 8 },
  activeCard: { borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight },
  pausedCard: { borderColor: colors.warningBorder, backgroundColor: colors.warningBg },
  failedCard: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerBg },
  pressed: { opacity: 0.75 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
