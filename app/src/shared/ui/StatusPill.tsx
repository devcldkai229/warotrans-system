import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, SemanticTone } from '../theme/colors';
import { radii } from '../theme/radii';
import {
  ContainerStatus,
  JobContainerStatus,
  JobStatus,
  JobStepStatus,
  JobTaskStatus,
  LocalizationStatus,
  MapStatus,
  NavigationStatus,
  RobotStatus,
  TransportRequestDetailStatus,
  TransportRequestStatus,
  WorkflowStatus,
} from '../types/contracts';
import { Text } from './Text';

/** Any status union from `shared/types/contracts`, or a raw string. */
export type StatusValue =
  | RobotStatus
  | NavigationStatus
  | LocalizationStatus
  | JobStatus
  | JobTaskStatus
  | JobStepStatus
  | JobContainerStatus
  | ContainerStatus
  | TransportRequestStatus
  | TransportRequestDetailStatus
  | MapStatus
  | WorkflowStatus
  | (string & {});

/**
 * Status -> tone.
 *
 * The rule behind the table: colour answers "does this need me?", never "what is
 * this?". Anything the operator must act on is `danger`; anything in motion is
 * `info`; anything finished or ready is `success`; anything temporarily held is
 * `warning`; anything merely "not yet" is `neutral` so a screen full of chips
 * does not read as a screen full of alarms.
 *
 * One flat map rather than one per enum, because several values repeat across
 * enums (`PAUSED` exists on Robot, Job, Task and Step) and they must always
 * land on the same tone.
 */
const TONE_BY_STATUS: Record<string, SemanticTone> = {
  // Not yet happening — no alarm.
  CREATED: 'neutral',
  PENDING: 'neutral',
  IDLE: 'neutral',
  UNKNOWN: 'neutral',
  QUEUED: 'neutral',
  SUBMITTED: 'neutral',
  DRAFT: 'neutral',
  OFFLINE: 'neutral',
  EMPTY: 'neutral',
  ARCHIVED: 'neutral',
  SKIPPED: 'neutral',

  // In motion.
  EXECUTING: 'info',
  RUNNING: 'info',
  IN_PROGRESS: 'info',
  IN_TRANSIT: 'info',
  EN_ROUTE: 'info',
  ASSIGNED: 'info',
  ONBOARD: 'info',
  NAVIGATING: 'info',
  MAINTENANCE: 'info',

  // Done or ready to go.
  ACTIVE: 'success',
  AVAILABLE: 'success',
  STANDBY: 'success',
  READY: 'success',
  COMPLETED: 'success',
  SUCCEEDED: 'success',
  DELIVERED: 'success',
  STORED: 'success',
  PACKED: 'success',
  LOCALIZED: 'success',
  PUBLISHED: 'success',

  // Temporarily held.
  PAUSED: 'warning',
  WAITING: 'warning',
  WAITING_HANDOVER: 'warning',
  AWAITING_HANDOVER: 'warning',
  HOLD: 'warning',
  CHARGING: 'warning',
  RESERVED: 'warning',
  REASSIGNING: 'warning',
  PARTIALLY_COMPLETED: 'warning',

  // Needs a human.
  ERROR: 'danger',
  FAILED: 'danger',
  LOST: 'danger',
  CANCELLED: 'danger',
  CANCELED: 'danger',
  REJECTED: 'danger',
  OUT_OF_SERVICE: 'danger',
  RECOVERY_REQUIRED: 'danger',
};

/** `RECOVERY_REQUIRED` -> `Recovery Required`. */
export function statusLabel(status: string): string {
  const spaced = status.replace(/_/g, ' ').trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Tone a status renders as. Unknown values fall back to `neutral`. */
export function statusTone(status: string): SemanticTone {
  return TONE_BY_STATUS[status.toUpperCase()] ?? 'neutral';
}

export interface StatusPillProps {
  /** A domain status, e.g. `status={robot.status}`. */
  status: StatusValue;
  /** Overrides the humanised status text. */
  label?: string;
  /** Overrides the tone derived from `status`. */
  tone?: SemanticTone;
  size?: 'sm' | 'md';
  /** Leading dot. Useful in dense lists where the text alone is ambiguous. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Status chip.
 *
 * Reads the status straight from the contract so a screen never hand-rolls a
 * `<Badge tone={...}>` map and drifts from it. Foreground is the darker `*Text`
 * token rather than `*` because 12pt text on the `*Bg` tint must clear 4.5:1 —
 * `colors.success` on `colors.successBg` is only 3.6:1.
 */
export function StatusPill({
  status,
  label,
  tone,
  size = 'md',
  dot = false,
  style,
}: StatusPillProps) {
  const resolvedTone = tone ?? statusTone(status);
  const palette = TONE_PALETTE[resolvedTone];
  const isSm = size === 'sm';

  return (
    <View
      accessibilityRole="text"
      style={[
        styles.base,
        palette.container,
        isSm ? styles.baseSm : styles.baseMd,
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: palette.dot }, isSm && styles.dotSm]} /> : null}
      <Text
        variant={isSm ? 'caption' : 'label'}
        color={palette.text}
        numberOfLines={1}
        style={[
          styles.label,
          isSm ? styles.labelSm : styles.labelMd,
        ]}
      >
        {label ?? statusLabel(status)}
      </Text>
    </View>
  );
}

const TONE_PALETTE: Record<
  SemanticTone,
  { container: ViewStyle; text: string; dot: string }
> = {
  neutral: {
    container: { backgroundColor: colors.surfaceSubtle, borderColor: colors.border },
    text: colors.textSecondary,
    dot: colors.textMuted,
  },
  info: {
    container: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder },
    text: colors.infoText,
    dot: colors.info,
  },
  success: {
    container: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
    text: colors.successText,
    dot: colors.success,
  },
  warning: {
    container: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
    text: colors.warningText,
    dot: colors.warning,
  },
  danger: {
    container: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
    text: colors.dangerText,
    dot: colors.danger,
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radii.pill,
    maxWidth: '100%',
  },
  baseSm: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  baseMd: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
    /**
     * The dot is the first flex child of a row that also holds a wrapping label.
     * Without `flexShrink: 0` it absorbs the squeeze and turns into a sliver,
     * which reads as a rendering bug rather than a truncated word.
     */
    flexShrink: 0,
  },
  dotSm: {
    width: 6,
    height: 6,
  },
  labelSm: {
    fontWeight: '600',
  },
  labelMd: {
    fontWeight: '500',
  },
  /** The label is the only child allowed to give up width. */
  label: {
    flexShrink: 1,
  },
});