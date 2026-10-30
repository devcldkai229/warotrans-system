import { useRealtime } from '../../shared/realtime';
import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertOctagon,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  LifeBuoy,
  PackagePlus,
  PauseCircle,
  Plus,
  Search,
  ShieldAlert,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { JOB_STATUS_PRESENTATION } from '../jobs/jobData';
import { requestStatusLabel } from './dispatchData';
import { useSafetyHold } from '../../shared/context/SafetyHoldContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace, useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { EmptyState } from '../../shared/ui/EmptyState';
import { StatusPill } from '../../shared/ui/StatusPill';
import { Text } from '../../shared/ui/Text';
import { listTransportRequests } from '../../shared/api';

export interface RecentDispatchItem {
  id: string;
  requestId: string;
  type: string;
  status: string;
  statusLabel?: string;
  route: string;
  container: string;
  containerCount: number;
  time: string;
}

/**
 * Transport Hub Screen (Redesigned Phase 3).
 *
 * Implements "Calm Operations" & Machined Obsidian aesthetics:
 *   - Dual Action Console: Machined Obsidian primary button alongside crisp tactile container pack card.
 *   - Safety & Incident: Hidden during normal operations. Only displays an urgent banner during active anomalies.
 *   - Quiet Operational Safety Bar: Soft hold & block path reporting in a single calm strip.
 *   - Recent Dispatches: Structured, high-contrast operational audit cards.
 */
export function TransportScreen() {
  const { navigate, dockHeight } = useNavigation();
  const { lastJobUpdate } = useRealtime();
  const { isHolding } = useSafetyHold();
  const recent = useQuery({ queryKey: ['recent-dispatches'], queryFn: () => listTransportRequests({ take: 3 }), refetchInterval: 15_000 });
  const { refetch } = recent;
  useEffect(() => { if (lastJobUpdate) void refetch(); }, [lastJobUpdate, refetch]);
  const totalRecords = recent.data?.total ?? 0;
  const dispatches = useMemo(() => {
    return (recent.data?.items ?? []).slice(0, 3).map((item) => {
      const details = item.details || [];
      const first = details[0];
      const route = first
        ? `${first.sourceEndpointCode || first.sourceEndpointId || 'Unknown Pickup'} ➔ ${first.destinationEndpointCode || first.destinationEndpointId || 'Unknown Destination'}`
        : 'Multi-stop movement';
      const firstBarcode = first?.containerBarcode || first?.containerId || 'Unknown Container';
      const containerSummary =
        details.length > 1
          ? `${firstBarcode} (+${details.length - 1})`
          : firstBarcode;

      return {
        id: item.requestCode,
        requestId: item.id,
        type:
          item.workflowName ||
          (item.workflowCode ? item.workflowCode.replace(/_/g, ' ') : 'Transport Movement'),
        status: item.status,
        statusLabel: requestStatusLabel(item.status),
        route,
        container: containerSummary,
        containerCount: details.length,
        time: item.submittedAt
          ? new Date(item.submittedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Time unavailable',
      };
    });
  }, [recent.data]);

  const bottomInset = dockReservedSpace(dockHeight);
  const topInset = useTopInset();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: topInset + 14, paddingBottom: bottomInset + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Screen Title */}
        <View style={styles.screenHeader}>
          <Text variant="caption" color={colors.textSecondary} style={styles.eyebrow}>
            Logistics command
          </Text>
          <Text variant="display" color={colors.textPrimary} style={styles.pageTitle}>
            Transport Hub
          </Text>
        </View>

        {/* 1. Primary Hero Actions (Machined Dual Action Console) */}
        <View style={styles.section}>
          <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
            Dispatch Operations
          </Text>

          <View style={styles.heroGrid}>
            {/* Card 1: New Transport Request (Machined Obsidian) */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('transport_create');
              }}
              style={({ pressed }) => [
                styles.heroBtnPrimary,
                pressed && styles.heroBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="New transport request"
            >
              <View style={styles.heroBtnTopRow}>
                <View style={styles.primaryIconWell}>
                  <Plus size={18} color="#ffffff" strokeWidth={2.6} />
                </View>
                <ArrowRight size={16} color="rgba(255, 255, 255, 0.45)" />
              </View>

              <View style={styles.heroBtnContent}>
                <Text variant="bodyMedium" color={colors.textInverse} style={styles.heroBtnTitle}>
                  New Request
                </Text>
              </View>
            </Pressable>

            {/* Receiving entry */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('create_container');
              }}
              style={({ pressed }) => [
                styles.heroBtnSecondary,
                pressed && styles.heroBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Receive goods"
            >
              <View style={styles.heroBtnTopRow}>
                <View style={styles.secondaryIconWell}>
                  <PackagePlus size={18} color={colors.textPrimary} strokeWidth={2.2} />
                </View>
                <ArrowRight size={16} color={colors.textMuted} />
              </View>

              <View style={styles.heroBtnContent}>
                <Text variant="bodyMedium" color={colors.textPrimary} style={styles.heroBtnTitle}>
                  Receive Goods
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 3. Quiet Operational Safety Bar (Integrated, non-intrusive) */}
        <View style={styles.section}>
          <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
            Floor Safety & Controls
          </Text>

          <View style={styles.safetyStrip}>
            {/* Soft Hold Toggle */}
            <Pressable
              style={({ pressed }) => [
                styles.safetyStripBtn,
                isHolding && styles.safetyStripBtnHolding,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Pause unavailable"
              disabled
              accessibilityState={{ disabled: true }}
            >
              <PauseCircle
                size={18}
                color={isHolding ? colors.warningText : colors.textSecondary}
                strokeWidth={2}
              />
              <View style={styles.safetyStripTextCol}>
                <Text
                  variant="bodyMedium"
                  color={isHolding ? colors.warningText : colors.textPrimary}
                  style={styles.safetyBtnTitle}
                >
                  Pause Unavailable
                </Text>
              </View>
            </Pressable>

            <View style={styles.safetyDivider} />

            {/* Corridor Hazard Report */}
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('block_path');
              }}
              style={({ pressed }) => [styles.safetyStripBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Report corridor hazard"
            >
              <AlertOctagon size={18} color={colors.dangerText} strokeWidth={2} />
              <View style={styles.safetyStripTextCol}>
                <Text variant="bodyMedium" color={colors.textPrimary} style={styles.safetyBtnTitle}>
                  Report Hazard
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* 4. Recent Dispatches Section */}
        <View style={styles.section}>
          <View style={styles.recentSectionHeader}>
            <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
              Recent Dispatches
            </Text>
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                navigate('transport_history');
              }}
              style={({ pressed }) => [styles.viewHistoryBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="View history"
            >
              <Text variant="caption" color={colors.primaryText} style={styles.viewHistoryText}>
                {recent.data === undefined ? 'View All' : `View All (${totalRecords})`}
              </Text>
              <ChevronRight size={14} color={colors.primaryText} />
            </Pressable>
          </View>

          {recent.data === undefined ? <EmptyState compact
            title={recent.error ? 'Dispatches Unavailable' : recent.fetchStatus === 'paused' ? 'Waiting For Connection' : 'Loading Dispatches…'}
            message={recent.error ? recent.error.message : 'Recent requests have not loaded yet.'}
            actionTitle={recent.error ? 'Retry' : undefined} onAction={() => { void refetch(); }} /> :
            recent.error ? <EmptyState compact tone="warning" title="Could Not Refresh Dispatches"
              message="Showing the last loaded requests." actionTitle="Retry" onAction={() => { void refetch(); }} /> :
            dispatches.length === 0 ? <EmptyState compact title="No Dispatches Yet" message="Create a transport request to get started." /> : null}
          <View style={styles.recentCardsCol}>
            {dispatches.map((dispatch) => {
              const label =
                (dispatch as any).statusLabel ||
                JOB_STATUS_PRESENTATION[dispatch.status as keyof typeof JOB_STATUS_PRESENTATION]?.label ||
                String(dispatch.status);
              return (
                <Pressable
                  key={dispatch.id}
                  onPress={() => {
                    triggerHaptic('tap');
                    navigate('transport_detail', { requestId: dispatch.requestId });
                  }}
                  style={({ pressed }) => [
                    styles.dispatchCard,
                    pressed && styles.dispatchCardPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Dispatch ${dispatch.id}, ${dispatch.type}`}
                >
                  {/* Top: TR Badge + Workflow Name stacked on left, Status Pill on right */}
                  <View style={[styles.dispatchTopRow, { alignItems: 'flex-start' }]}>
                    <View style={{ flex: 1, minWidth: 0, marginRight: 8, gap: 4 }}>
                      <View style={[styles.trCodeChip, { alignSelf: 'flex-start' }]}>
                        <Text variant="caption" color={colors.primaryText} style={styles.trCodeText}>
                          {dispatch.id}
                        </Text>
                      </View>
                      <Text variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.dispatchTypeName}>
                        {dispatch.type}
                      </Text>
                    </View>

                    <StatusPill status={dispatch.status} label={label} />
                  </View>

                  {/* Route */}
                  <Text variant="body" color={colors.textPrimary} numberOfLines={1} style={styles.dispatchRoute}>
                    {dispatch.route}
                  </Text>

                  {/* Footer: Robot (no-wrap), Container summary, Time */}
                  <View style={styles.dispatchFooter}>
                    <View style={[styles.dispatchMetaGroup, { flex: 1, minWidth: 0, marginRight: 8 }]}>
                      <Text
                        variant="caption"
                        color={colors.textPrimary}
                        numberOfLines={1}
                        style={[styles.boldText, { flexShrink: 0 }]}
                      >
                        {dispatch.containerCount} Containers
                      </Text>
                      <Text variant="caption" color={colors.textMuted}>·</Text>
                      <Text variant="caption" color={colors.textPrimary} numberOfLines={1} style={[styles.boldMono, { flexShrink: 1 }]}>
                        {dispatch.container}
                      </Text>
                    </View>
                    <Text variant="caption" color={colors.textMuted} style={{ flexShrink: 0 }}>
                      {dispatch.time}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 5. Inventory & SKU Catalog Lookup Card */}
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            navigate('inventory_lookup');
          }}
          style={({ pressed }) => [
            styles.historyEntryCard,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Inventory catalog and SKU lookup"
        >
          <View style={styles.historyLeft}>
            <View style={styles.historyIconWell}>
              <Search size={18} color={colors.primaryText} />
            </View>
            <Text variant="bodyMedium" color={colors.textPrimary} style={styles.historyTitle}>
              Inventory & SKU Catalog
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 18,
  },
  screenHeader: {
    paddingTop: 6,
    paddingBottom: 2,
    gap: 2,
  },
  eyebrow: {
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pageTitle: {
    fontWeight: '800',
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  heroBtnPrimary: {
    flex: 1,
    minHeight: 90,
    backgroundColor: colors.darkAction, // Warm Dark Gray (Graphite)
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.darkActionBorder,
    padding: 14,
    justifyContent: 'space-between',
    ...shadows.md,
  },
  heroBtnSecondary: {
    flex: 1,
    minHeight: 90,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    justifyContent: 'space-between',
    ...shadows.sm,
  },
  heroBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  heroBtnTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryIconWell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryIconWell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnContent: {
    gap: 2,
    marginTop: 10,
  },
  heroBtnTitle: {
    fontWeight: '700',
  },
  activeAlertCard: {
    backgroundColor: colors.dangerBg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: 14,
    gap: 10,
    ...shadows.sm,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertTitle: {
    fontWeight: '700',
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  alertDesc: {
    lineHeight: 16,
  },
  rescueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    backgroundColor: colors.danger,
    borderRadius: radii.md,
  },
  rescueBtnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  safetyStrip: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 4,
    ...shadows.sm,
  },
  safetyStripBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  safetyStripBtnHolding: {
    backgroundColor: colors.warningBg,
    borderRadius: radii.md,
  },
  safetyStripTextCol: {
    flex: 1,
    gap: 1,
  },
  safetyBtnTitle: {
    fontWeight: '700',
  },
  safetyDivider: {
    width: 1,
    height: 36,
    backgroundColor: colors.border,
  },
  recentSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  viewHistoryText: {
    fontWeight: '600',
  },
  recentCardsCol: {
    gap: 10,
  },
  dispatchCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.sm,
  },
  dispatchCardPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  dispatchTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dispatchBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trCodeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
    backgroundColor: colors.primaryLight,
  },
  trCodeText: {
    fontWeight: '700',
  },
  dispatchTypeName: {
    fontWeight: '700',
  },
  dispatchRoute: {
    fontWeight: '600',
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  boldMono: {
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  dispatchFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  dispatchMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.sm,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  historyIconWell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTextCol: {
    flex: 1,
    gap: 2,
  },
  historyHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyTitle: {
    fontWeight: '700',
  },
  recordsPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceSubtle,
  },
  recordsText: {
    fontWeight: '600',
  },
  beaconContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  beaconPing: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.danger,
  },
  beaconCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  pressed: {
    opacity: 0.85,
  },
});
