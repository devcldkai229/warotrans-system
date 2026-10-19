import {
  AlertTriangle,
  CirclePause,
  Info,
  PackageSearch,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Button, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';

/**
 * The hold is a *local simulation*. `SafetyHoldContext` flips a boolean and the
 * rows below re-render, but no AMR is told anything: the authoritative route
 * (`POST /api/fleet/soft-hold`) is not wired yet. An operator deciding whether
 * to step into traffic deserves to know that before they press the button, not
 * after an AMR comes past them at 1.4 m/s.
 */
export const SOFT_HOLD_SIMULATION_NOTICE =
  'Local Fleet Simulation. The 3m soft pause stays on this device — it is not broadcast to AMRs until /api/fleet/soft-hold is wired.';

export interface SafetyActionSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Mirrors the soft-pause state so the row can render as "release". */
  isHolding?: boolean;
  onToggleHold?: () => void;
  onReportHazard?: () => void;
  onReportDefect?: () => void;
  onOpenMaintenance?: () => void;
}

interface SafetyAction {
  key: string;
  icon: LucideIcon;
  title: string;
  description: string;
  /** `toggle` renders a state pill instead of a chevron. */
  kind: 'toggle' | 'navigate';
  tone: 'warning' | 'danger' | 'neutral';
}

/**
 * The four exceptions an operator raises mid-shift, in one sheet.
 *
 * Every one of them is a deviation from normal flow, which is exactly why they
 * do not belong on a tab: they are reached from the header's shield button
 * because they are reachable from anywhere. Each row states what it *does* in
 * one plain sentence — "hold robots within 3m" — rather than an exception code,
 * because the person reading it is deciding whether to walk into traffic.
 */
export function SafetyActionSheet({
  visible,
  onClose,
  isHolding = false,
  onToggleHold,
  onReportHazard,
  onReportDefect,
  onOpenMaintenance,
}: SafetyActionSheetProps) {
  const insets = useSafeAreaInsets();

  const actions: SafetyAction[] = [
    {
      key: 'hold',
      icon: CirclePause,
      title: 'Hold Nearby Robot (3m Soft Pause)',
      description:
        'Temporarily holds robots within 3m for safe manual crossing. (Local Fleet Simulation)',
      kind: 'toggle',
      tone: isHolding ? 'warning' : 'neutral',
    },
    {
      key: 'hazard',
      icon: AlertTriangle,
      title: 'Report Path Hazard',
      description: 'Report a blocked corridor, a water leak, or a fallen pallet.',
      kind: 'navigate',
      tone: 'danger',
    },
    {
      key: 'defect',
      icon: PackageSearch,
      title: 'Report Cargo Defect',
      description: 'Report damaged packaging or an unreadable barcode.',
      kind: 'navigate',
      tone: 'danger',
    },
    {
      key: 'maintenance',
      icon: Wrench,
      title: 'Fleet Maintenance Notice',
      description: 'View active maintenance status across the fleet.',
      kind: 'navigate',
      tone: 'neutral',
    },
  ];

  /**
 * Toggling the hold closes the sheet.
 *
 * It used to stay open and flip its own state pill, which looks like it works —
 * except the confirmation is a `toast`, and a toast lives in the React tree
 * *below* this `Modal`. React Native renders a `Modal` into its own native
 * window, so `zIndex` cannot lift the toast above it: tapping "Hold" produced a
 * confirmation nobody could see, on the one screen where the operator is
 * deciding whether to walk into an aisle.
 */
const handlePress = (action: SafetyAction) => {
    triggerHaptic('tap');
    onClose();
    if (action.key === 'hold') {
      onToggleHold?.();
      return;
    }
    if (action.key === 'hazard') onReportHazard?.();
    if (action.key === 'defect') onReportDefect?.();
    if (action.key === 'maintenance') onOpenMaintenance?.();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close safety sheet"
        />

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
          <View style={styles.header}>
            <View style={styles.iconWell}>
              <ShieldCheck size={20} color={colors.primary} strokeWidth={2} />
            </View>
            <View style={styles.headerText}>
              <Text variant="title">Operational Safety</Text>
              <Text variant="caption" color={colors.textSecondary}>
                Exceptions and fleet holds
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close safety actions"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            >
              <X size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.list}>
            {actions.map((action) => {
              const IconCmp = action.icon;
              const isActive = action.key === 'hold' && isHolding;

              return (
                <Pressable
                  key={action.key}
                  onPress={() => handlePress(action)}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                  accessibilityState={{ selected: action.kind === 'toggle' ? isActive : undefined }}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View
                    style={[
                      styles.rowIcon,
                      isActive && styles.rowIconActive,
                      action.tone === 'danger' && !isActive && styles.rowIconDanger,
                    ]}
                  >
                    <IconCmp
                      size={18}
                      color={
                        isActive
                          ? colors.warningText
                          : action.tone === 'danger'
                            ? colors.danger
                            : colors.textSecondary
                      }
                    />
                  </View>

                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={2}>
                      {action.title}
                    </Text>
                    <Text variant="caption" color={colors.textSecondary}>
                      {action.description}
                    </Text>
                  </View>

                  {action.kind === 'toggle' ? (
                    <View
                      style={[
                        styles.statePill,
                        isActive ? styles.statePillActive : styles.statePillIdle,
                      ]}
                    >
                      <Text
                        variant="caption"
                        color={isActive ? colors.warningText : colors.textSecondary}
                        style={styles.statePillText}
                      >
                        {isActive ? 'Holding' : 'Hold'}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* The one claim on this sheet that is not true yet, so it is stated
              where the hold row is read rather than buried in a release note. */}
          <View style={styles.notice} accessibilityRole="summary">
            <Info size={15} color={colors.infoText} style={styles.noticeIcon} />
            <Text variant="caption" color={colors.infoText} style={styles.noticeText}>
              {SOFT_HOLD_SIMULATION_NOTICE}
            </Text>
          </View>

          <Button
            title="Close"
            onPress={onClose}
            variant="secondary"
            size="md"
            fullWidth
            style={styles.closeAction}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: 16,
    paddingTop: 16,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSubtle,
  },
  closeBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIconActive: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  rowIconDanger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statePillIdle: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  statePillActive: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  statePillText: {
    fontWeight: '600',
  },
  /** `info` tint, not `warning`: nothing is wrong, the capability is missing. */
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    backgroundColor: colors.infoBg,
  },
  noticeIcon: {
    flexShrink: 0,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    minWidth: 0,
  },
  closeAction: {
    marginTop: 16,
  },
});