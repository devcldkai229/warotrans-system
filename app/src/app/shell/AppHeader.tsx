import {
  ChevronDown,
  MapPin,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafetyHold } from '../../shared/context/SafetyHoldContext';
import { toast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { useNavigation } from '../navigation/NavigationContext';
import { AccountSheet } from './AccountSheet';
import { SafetyActionSheet } from './SafetyActionSheet';
import { ZonePickerModal } from './ZonePickerModal';

/**
 * The soft hold is a local simulator: nothing reaches an AMR until the backend
 * route is wired. Stated here because the shield button is where an operator
 * decides whether it is safe to walk into an aisle, and the toasts below repeat
 * it so the answer survives the sheet closing.
 */
const SIMULATION_NOTICE =
  'Soft pause is a local simulation — it is not broadcast to AMRs until /api/fleet/soft-hold is wired.';

interface AppHeaderProps {
  operatorName?: string;
  operatorRole?: string;
  /** Avatar initials. Falls back to the operator name's first two initials. */
  initials?: string;
  zone?: string;
  onLogout?: () => void;
  onZoneChange?: (zone: string) => void;
}

/** `Alex Tran` -> `AT`. */
function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'OP'
  );
}

/**
 * The shell header: who is on shift, where they are working, and that the WMS
 * link is up.
 *
 * Google Cloud Console framing rather than an industrial HUD — a flat white
 * surface, a single hairline, and exactly two rows:
 *
 *   row 1   avatar + name + role badge ......... WMS status · shield
 *   row 2   work-zone selector pill
 *
 * Everything here answers a question the operator asks without looking at the
 * screen ("am I on the right shift, right zone, right system?"), so it never
 * competes with the screen's own title.
 *
 * This file is deliberately just the two rows plus the wiring: the three
 * overlays it can open live beside it (`ZonePickerModal`, `AccountSheet`,
 * `SafetyActionSheet`) over a shared `SheetDialog` frame. They were inline here
 * until the header was 519 lines, most of them three copies of the same modal
 * chrome.
 */
export function AppHeader({
  operatorName = 'Alex Tran',
  operatorRole = 'Staff',
  initials,
  zone = 'Inbound Dock 01',
  onLogout,
  onZoneChange,
}: AppHeaderProps) {
  const topInset = useTopInset();
  const { navigate } = useNavigation();
  const { isHolding, toggleHold } = useSafetyHold();
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);

  const avatarInitials = initials ?? initialsOf(operatorName);

  const handleZoneChange = (nextZone: string) => {
    triggerHaptic('tap');
    onZoneChange?.(nextZone);
    setIsZoneModalOpen(false);
    toast.info(`Switched zone to ${nextZone}`);
  };

  const handleToggleHold = () => {
    triggerHaptic(isHolding ? 'success' : 'warning');
    toggleHold();
    if (isHolding) {
      toast.success('Soft pause released. Navigation resumed.', 'Local Fleet Simulation.');
    } else {
      toast.warning(
        'Robots within 3m are holding.',
        'Cross the aisle, then release the hold. (Local Fleet Simulation)'
      );
    }
  };

  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      {/* Row 1 — identity, system state, safety */}
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            setIsAccountOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Account menu for ${operatorName}`}
          style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
        >
          <Text variant="label" color={colors.textInverse} style={styles.avatarText}>
            {avatarInitials}
          </Text>
        </Pressable>

        <View style={styles.identity}>
          <Text variant="bodyMedium" color={colors.textPrimary} numberOfLines={1} style={styles.name}>
            {operatorName}
          </Text>
          <View style={styles.roleBadge}>
            <Text variant="caption" color={colors.textSecondary} style={styles.roleText}>
              {operatorRole}
            </Text>
          </View>
        </View>

        <View style={styles.statusPill}>
          <View style={styles.statusDot} />
          <Text variant="caption" color={colors.successText} numberOfLines={1}>
            WMS Connected
          </Text>
        </View>

        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            setIsSafetyOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Operational safety and exceptions"
          accessibilityHint={isHolding ? SIMULATION_NOTICE : 'Hold a nearby robot, report a hazard or a cargo defect.'}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
        >
          {isHolding ? (
            <ShieldAlert size={20} color={colors.warningText} />
          ) : (
            <ShieldCheck size={20} color={colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* Row 2 — work zone */}
      <Pressable
        onPress={() => {
          triggerHaptic('tap');
          setIsZoneModalOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Work zone: ${zone}. Tap to change.`}
        style={({ pressed }) => [styles.zonePill, pressed && styles.zonePillPressed]}
      >
        <MapPin size={15} color={colors.primary} />
        <Text variant="label" color={colors.textPrimary} numberOfLines={1} style={styles.zoneName}>
          {zone}
        </Text>
        <ChevronDown size={15} color={colors.textMuted} />
      </Pressable>

      <ZonePickerModal
        visible={isZoneModalOpen}
        zone={zone}
        onClose={() => setIsZoneModalOpen(false)}
        onSelect={handleZoneChange}
      />

      <AccountSheet
        visible={isAccountOpen}
        operatorName={operatorName}
        operatorRole={operatorRole}
        initials={avatarInitials}
        zone={zone}
        onClose={() => setIsAccountOpen(false)}
        onLogout={onLogout}
      />

      <SafetyActionSheet
        visible={isSafetyOpen}
        isHolding={isHolding}
        onClose={() => setIsSafetyOpen(false)}
        onToggleHold={handleToggleHold}
        onReportHazard={() => navigate('block_path')}
        /**
         * A cargo defect is a *payload* problem — damaged packaging, unreadable
         * barcode — and belongs in the incident report. It used to route to
         * `payload_recovery`, which is the chassis rescue flow: the operator
         * reporting a crushed tote was taken to a screen about lifting a
         * stalled AMR off a pallet.
         */
        onReportDefect={() => navigate('job_detail', { modal: 'issue' })}
        onOpenMaintenance={() => navigate('fleet_recall')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 80,
    // Android reads `elevation` for depth and ignores the iOS shadow* props;
    // `shadows.sm` supplies 1, which is what a hairline-bordered header wants.
    ...shadows.sm,
  },
  /**
   * 8pt gaps, not 10: the identity name is the one flexible element in this
   * row, and every extra point here comes straight out of its budget. At 10pt
   * it truncated to "Alex Tr..." on a 390pt screen.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  avatarPressed: {
    opacity: 0.85,
  },
  avatarText: {
    fontWeight: '700',
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontWeight: '600',
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
  },
  roleText: {
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  zonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
    maxWidth: '100%',
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zonePillPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  zoneName: {
    flexShrink: 1,
    fontWeight: '500',
  },
});