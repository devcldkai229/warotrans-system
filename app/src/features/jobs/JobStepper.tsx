import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme/colors';
import { JobStepSummary } from '../../shared/types/contracts';

interface JobStepperProps {
  steps: JobStepSummary[];
}

export function JobStepper({ steps }: JobStepperProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>WORKFLOW EXECUTION STEPPER</Text>
        <Text style={styles.stepCount}>
          {steps.filter((s) => s.status === 'COMPLETED').length} / {steps.length} Steps Done
        </Text>
      </View>

      <View style={styles.stepsList}>
        {steps.map((step, idx) => {
          const isCompleted = step.status === 'COMPLETED';
          const isExecuting = step.status === 'EXECUTING';
          const isLast = idx === steps.length - 1;

          return (
            <View key={step.sequenceNo} style={styles.stepItem}>
              {/* Stepper Left Indicator */}
              <View style={styles.indicatorCol}>
                <View
                  style={[
                    styles.circle,
                    isCompleted && styles.circleCompleted,
                    isExecuting && styles.circleExecuting,
                  ]}
                >
                  <Text
                    style={[
                      styles.circleText,
                      (isCompleted || isExecuting) && styles.circleTextActive,
                    ]}
                  >
                    {isCompleted ? '✓' : step.sequenceNo}
                  </Text>
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

              {/* Stepper Content */}
              <View style={styles.contentCol}>
                <View style={styles.titleRow}>
                  <Text
                    style={[
                      styles.stepTitle,
                      isExecuting && styles.stepTitleExecuting,
                    ]}
                  >
                    {step.title}
                  </Text>
                  <View
                    style={[
                      styles.typeBadge,
                      step.type === 'HUMAN_INTERACTION'
                        ? styles.typeBadgeHuman
                        : styles.typeBadgeMove,
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeBadgeText,
                        step.type === 'HUMAN_INTERACTION'
                          ? styles.typeTextHuman
                          : styles.typeTextMove,
                      ]}
                    >
                      {step.type.replace('_', ' ')}
                    </Text>
                  </View>
                </View>

                <Text style={styles.stepDesc}>{step.description}</Text>

                {step.targetEndpointCode && (
                  <Text style={styles.endpointTarget}>
                    Endpoint: {step.targetEndpointCode}
                  </Text>
                )}

                {isExecuting && (
                  <View style={styles.executingPill}>
                    <View style={styles.pulseDot} />
                    <Text style={styles.executingText}>In Progress Now</Text>
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
    paddingBottom: 8,
  },
  title: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  stepCount: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  stepsList: {
    gap: 4,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 12,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 24,
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  circleExecuting: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  circleText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
  },
  circleTextActive: {
    color: colors.textInverse,
  },
  verticalLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  lineCompleted: {
    backgroundColor: colors.successBorder,
  },
  contentCol: {
    flex: 1,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  stepTitleExecuting: {
    color: colors.primary,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeMove: {
    backgroundColor: colors.infoBg,
  },
  typeBadgeHuman: {
    backgroundColor: colors.warningBg,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
  },
  typeTextMove: {
    color: colors.info,
  },
  typeTextHuman: {
    color: colors.warning,
  },
  stepDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  endpointTarget: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
  },
  executingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  pulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  executingText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primaryDark,
  },
});
