import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Clock, Navigation, ShieldCheck, User } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import type { JobStepResponse, StepType } from '../../shared/types/contracts';
import { StatusPill, Text } from '../../shared/ui';
import { jobStepTitle } from './jobData';

const STEP_TYPES: Record<StepType, { label: string; icon: typeof Check }> = {
  CHECK: { label: 'Check', icon: ShieldCheck },
  MOVE: { label: 'Move', icon: Navigation },
  HUMAN_INTERACTION: { label: 'Human Interaction', icon: User },
  WAIT: { label: 'Wait', icon: Clock },
};

export function JobStepper({ steps, endpointCode }: { steps: JobStepResponse[]; endpointCode?: string }) {
  if (!steps.length) return <Text variant="body" color={colors.textSecondary}>No steps are available for this task.</Text>;
  return (
    <View>
      {steps.map((step, index) => {
        const completed = step.status === 'COMPLETED';
        const active = step.status === 'EXECUTING' || step.status === 'WAITING';
        const failed = step.status === 'FAILED';
        const type = STEP_TYPES[step.stepType];
        const Icon = type?.icon || ShieldCheck;
        return (
          <View key={step.id} style={styles.step}>
            <View style={styles.spine}>
              <View style={[styles.circle, completed && styles.completedCircle, active && styles.activeCircle, failed && styles.failedCircle]}>
                {completed ? <Check size={14} color={colors.textInverse} /> : <Text variant="caption" color={failed ? colors.dangerText : active ? colors.primaryText : colors.textSecondary}>{index + 1}</Text>}
              </View>
              {index < steps.length - 1 && <View style={[styles.line, completed && styles.completedLine]} />}
            </View>
            <View style={styles.content}>
              <View style={styles.typeRow}>
                <Icon size={14} color={colors.textSecondary} />
                <Text variant="caption">{type?.label || step.stepType}</Text>
              </View>
              <Text variant="bodyMedium" color={completed ? colors.textSecondary : colors.textPrimary}>{jobStepTitle(step)}</Text>
              <StatusPill status={step.status} size="sm" dot />
              {step.stepType === 'MOVE' && (step.targetEndpointId || endpointCode) ? <Text variant="caption">Target: {step.targetEndpointCode || step.targetEndpointId || endpointCode}</Text> : null}
              {step.status === 'WAITING' && step.stepType === 'HUMAN_INTERACTION' && <Text variant="caption" color={colors.warningText}>Waiting For Operator</Text>}
              {step.errorCode || step.errorMessage ? (
                <View style={styles.error}>
                  {step.errorCode ? <Text variant="caption" color={colors.dangerText} fontWeight="600">{step.errorCode}</Text> : null}
                  {step.errorMessage ? <Text variant="body" color={colors.dangerText}>{step.errorMessage}</Text> : null}
                </View>
              ) : null}
              {step.startedAt ? <Text variant="caption">Started: {formatJobTime(step.startedAt)}</Text> : null}
              {step.completedAt ? <Text variant="caption">Completed: {formatJobTime(step.completedAt)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function formatJobTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', gap: 12 },
  spine: { width: 28, alignItems: 'center' },
  circle: { width: 26, height: 26, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  completedCircle: { backgroundColor: colors.success, borderColor: colors.success },
  activeCircle: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  failedCircle: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  completedLine: { backgroundColor: colors.successBorder },
  content: { flex: 1, minWidth: 0, gap: 6, paddingBottom: 24 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { backgroundColor: colors.dangerBg, borderRadius: radii.sm, padding: 10, gap: 4 },
});
