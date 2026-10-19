import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check, Clock, User, Navigation } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { JobStepSummary } from '../../shared/types/contracts';
import { Text } from '../../shared/ui';

interface JobStepperProps {
  steps: JobStepSummary[];
}

export function JobStepper({ steps }: JobStepperProps) {
  const completedCount = steps.filter((s) => s.status === 'COMPLETED').length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text variant="headline" style={styles.headerTitle}>
            Workflow Execution Plan
          </Text>
          <Text variant="caption" color={colors.textSecondary}>
            Step-by-step task itinerary
          </Text>
        </View>
        <View style={styles.progressBadge}>
          <Text variant="caption" color={colors.textSecondary} style={styles.badgeText}>
            {completedCount} of {steps.length} Steps
          </Text>
        </View>
      </View>

      <View style={styles.stepsList}>
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'COMPLETED';
          const isExecuting = step.status === 'EXECUTING' || step.status === 'WAITING';
          const isLast = idx === steps.length - 1;
          const isHuman =
            step.type === 'HUMAN_INTERACTION' ||
            String(step.type) === 'MANUAL_CONFIRM' ||
            String(step.title).toUpperCase().includes('CONFIRM') ||
            String(step.title).toUpperCase().includes('VERIFICATION') ||
            String(step.title).toUpperCase().includes('HANDOVER');

          return (
            <View key={`${step.sequenceNo}-${idx}`} style={styles.stepItem}>
              {/* Vertical timeline spine */}
              <View style={styles.indicatorCol}>
                <View
                  style={[
                    styles.circle,
                    isCompleted && styles.circleCompleted,
                    isExecuting && styles.circleExecuting,
                  ]}
                >
                  {isCompleted ? (
                    <Check size={14} color="#ffffff" strokeWidth={2.8} />
                  ) : isExecuting ? (
                    <View style={styles.executingDot} />
                  ) : (
                    <Text variant="caption" color={colors.textMuted} style={styles.circleNumber}>
                      {step.sequenceNo}
                    </Text>
                  )}
                </View>
                {!isLast && (
                  <View
                    style={[
                      styles.verticalLine,
                      isCompleted && styles.lineCompleted,
                    ]}
                  />
                )}
              </View>

              {/* Step content */}
              <View style={styles.contentCol}>
                <View style={styles.titleRow}>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.stepTitle,
                      isExecuting && styles.stepTitleExecuting,
                      isCompleted && styles.stepTitleCompleted,
                    ]}
                  >
                    {step.title}
                  </Text>

                  <View style={[styles.typeBadge, isHuman ? styles.typeBadgeHuman : styles.typeBadgeMove]}>
                    {isHuman ? (
                      <User size={12} color={colors.warning} style={{ marginRight: 4 }} />
                    ) : (
                      <Navigation size={12} color={colors.primary} style={{ marginRight: 4 }} />
                    )}
                    <Text
                      variant="caption"
                      color={isHuman ? colors.warning : colors.primary}
                      style={styles.typeBadgeText}
                    >
                      {isHuman ? 'Handover' : 'Move'}
                    </Text>
                  </View>
                </View>

                {step.description ? (
                  <Text variant="caption" color={colors.textSecondary} style={styles.stepDesc}>
                    {step.description}
                  </Text>
                ) : null}

                {step.targetEndpointCode ? (
                  <View style={styles.endpointRow}>
                    <Text variant="caption" color={colors.textMuted} style={styles.endpointLabel}>
                      Location:
                    </Text>
                    <Text variant="caption" color={colors.textPrimary} style={styles.endpointCode}>
                      {step.targetEndpointCode}
                    </Text>
                  </View>
                ) : null}

                {isExecuting && (
                  <View style={styles.executingPill}>
                    <Clock size={12} color={colors.primaryDark} />
                    <Text variant="caption" color={colors.primaryDark} style={styles.executingText}>
                      {isHuman ? 'Active Step · Awaiting Operator Handover' : 'Active Step · AMR Executing'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
  },
  headerTitle: {
    fontWeight: '700',
  },
  progressBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontWeight: '600',
  },
  stepsList: {
    gap: 0,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 12,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  circleCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  circleExecuting: {
    backgroundColor: '#ffffff',
    borderColor: colors.darkAction,
    borderWidth: 2,
  },
  executingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.darkAction,
  },
  circleNumber: {
    fontSize: 11,
    fontWeight: '700',
  },
  verticalLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  lineCompleted: {
    backgroundColor: colors.success,
  },
  contentCol: {
    flex: 1,
    paddingBottom: 20,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stepTitle: {
    fontWeight: '600',
    flex: 1,
  },
  stepTitleExecuting: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  stepTitleCompleted: {
    color: colors.textSecondary,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  typeBadgeMove: {
    backgroundColor: colors.primaryLight,
  },
  typeBadgeHuman: {
    backgroundColor: colors.warningBg,
  },
  typeBadgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  stepDesc: {
    lineHeight: 18,
  },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  endpointLabel: {
    fontSize: 12,
  },
  endpointCode: {
    fontSize: 12,
    fontWeight: '600',
  },
  executingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  executingText: {
    fontWeight: '700',
    fontSize: 11,
  },
});
