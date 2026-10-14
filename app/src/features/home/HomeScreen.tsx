import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ArrowRight, ArrowUpRight, BatteryMedium, Boxes } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import {
  Button,
  Card,
  ProgressMeter,
  StatusPill,
  Text,
} from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { MOCK_JOBS } from '../jobs/jobData';
import { FacilityMapPreview, MapPreviewRobot } from './FacilityMapPreview';

/** The handover the operator is expected to work next. */
const NEXT_JOB_ID = 'JOB-2026-0812';

/**
 * The hero reads its cargo out of `jobData` rather than repeating it.
 *
 * This screen used to hardcode `BOX-101 · Electronics · 45 pcs` while the Jobs
 * list and the job fixture both said 12. On a mission-critical handheld, a
 * quantity that differs between the screen you act from and the screen you
 * verify in is worse than a missing one, so the number has exactly one home.
 */
const NEXT_JOB = MOCK_JOBS.find((job) => job.id === NEXT_JOB_ID) ?? MOCK_JOBS[0];
const NEXT_JOB_CONTAINER = NEXT_JOB.containers[0];

const FLEET: Array<{
  id: string;
  status: 'IN_TRANSIT' | 'AVAILABLE';
  statusLabel: string;
  locationLabel: string;
  location: string;
  battery: number;
  payload: string;
  /** Placement on the Home map preview — the preview adds the `id` back. */
  map: Omit<MapPreviewRobot, 'id'>;
}> = [
  {
    id: 'AMR-01',
    status: 'IN_TRANSIT',
    statusLabel: 'In Transit',
    locationLabel: 'Destination',
    location: 'Rack A-02',
    battery: 85,
    payload: '2 Containers',
    map: { xPercent: 46, yPercent: 62, headingDeg: 40, tone: 'primary' },
  },
  {
    id: 'AMR-02',
    status: 'AVAILABLE',
    statusLabel: 'Available / Standby',
    locationLabel: 'Location',
    location: 'Docking Bay 02',
    battery: 94,
    payload: '0 Containers',
    // Sits in the corridor below Zone B rather than on top of its label: the
    // puck is opaque and would cover the only word that says where it is.
    map: { xPercent: 68, yPercent: 64, headingDeg: 180, tone: 'success' },
  },
];

/**
 * Home — what to do next, what the fleet is doing, and where it all is.
 *
 * Three sections, in the order an operator asks the questions: my task, my
 * robots, the floor. The hero handover card is the only thing on this screen
 * with a filled primary button, because it is the only action that is always
 * correct to take.
 *
 * Data still comes from the Phase 0 mock: the hero reads `MOCK_JOBS` directly
 * (it used to restate the job in its own JSX — including a cargo quantity that
 * disagreed with the fixture), while the fleet list is local to this screen
 * because `RobotSummary` has no fixture yet. Both swap to the contract DTOs in
 * the contract-migration pass.
 */
export function HomeScreen() {
  const { navigate, switchTab, dockHeight } = useNavigation();

  /**
   * 100pt is the floor the layout was drawn against: the bar measures 64pt on
   * the web phone frame, and a short page should still end with air under the
   * map card rather than flush against the bar. On a notched device the
   * measurement is taller (90pt + gutter) and wins.
   */
  const bottomInset = Math.max(100, dockReservedSpace(dockHeight));

  const handleStartHandover = () => {
    triggerHaptic('tap');
    navigate('job_detail', { jobId: NEXT_JOB_ID });
  };

  const handleOpenLiveMap = () => {
    triggerHaptic('tap');
    switchTab('live_map');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
    >
      {/* 1. Next handover task */}
      <Card padding="md" gap={14}>
        <View style={styles.heroHeader}>
          <StatusPill status={NEXT_JOB.status} label="Waiting Handover" tone="warning" dot />
          <Text variant="bodyMedium" style={styles.heroJobId}>
            {NEXT_JOB_ID}
          </Text>
        </View>

        <View style={styles.inset}>
          <Text variant="caption" color={colors.textSecondary}>
            Target location
          </Text>
          <Text variant="headline" numberOfLines={1}>
            {NEXT_JOB.target}
          </Text>

          <View style={styles.insetRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Cargo
            </Text>
            <Text variant="body" numberOfLines={1} style={styles.insetValue}>
              {NEXT_JOB_CONTAINER.code} · Electronics · {NEXT_JOB_CONTAINER.qty} pcs
            </Text>
          </View>

          <View style={styles.insetRow}>
            <Text variant="caption" color={colors.textSecondary}>
              Assigned robot
            </Text>
            <Text variant="body" numberOfLines={1} style={styles.insetValue}>
              {NEXT_JOB.robot} · {NEXT_JOB.distanceRemaining}
            </Text>
          </View>

          <ProgressMeter
            value={68}
            tone="warning"
            style={styles.heroMeter}
            accessibilityLabel="Handover readiness 68 percent"
          />
        </View>

        <Button
          title="Start Handover"
          onPress={handleStartHandover}
          variant="primary"
          size="lg"
          icon={ArrowRight}
          iconPosition="right"
          fullWidth
        />
      </Card>

      {/* 2. Active fleet */}
      <View style={styles.section}>
        <Text variant="headline">Active Fleet ({FLEET.length} AMRs)</Text>

        <View style={styles.fleetList}>
          {FLEET.map((robot) => (
            <Card key={robot.id} padding="md" gap={12}>
              <View style={styles.fleetHeader}>
                <Text variant="bodyMedium" style={styles.fleetId}>
                  {robot.id}
                </Text>
                <StatusPill
                  status={robot.status}
                  label={robot.statusLabel}
                  size="sm"
                  dot
                />
              </View>

              <View style={styles.fleetDetail}>
                <Text variant="caption" color={colors.textSecondary}>
                  {robot.locationLabel}
                </Text>
                <Text variant="body" numberOfLines={1}>
                  {robot.location}
                </Text>
              </View>

              <View style={styles.batteryRow}>
                <BatteryMedium
                  size={16}
                  color={robot.battery >= 40 ? colors.success : colors.warning}
                />
                <Text variant="label">{robot.battery}%</Text>
                <ProgressMeter
                  value={robot.battery}
                  tone={robot.battery >= 40 ? 'success' : 'warning'}
                  style={styles.batteryMeter}
                  accessibilityLabel={`${robot.id} battery ${robot.battery} percent`}
                />
              </View>

              <View style={styles.payloadRow}>
                <Boxes size={15} color={colors.textMuted} />
                <Text variant="caption" color={colors.textSecondary}>
                  Payload · {robot.payload}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      {/* 3. Facility map thumbnail */}
      <View style={styles.section}>
        <Card padding="none">
          <FacilityMapPreview robots={FLEET.map((r) => ({ id: r.id, ...r.map }))} />

          <View style={styles.mapFooter}>
            <Text variant="label">Facility map</Text>
            <Text variant="caption" color={colors.textSecondary}>
              Live position of both AMRs, refreshed every second
            </Text>
            <Button
              title="Open Live Telemetry Map"
              onPress={handleOpenLiveMap}
              variant="secondary"
              size="md"
              fullWidth
              icon={ArrowUpRight}
              iconPosition="right"
              accessibilityLabel="Open live telemetry map"
              style={styles.mapCta}
            />
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroJobId: {
    flexShrink: 1,
    fontWeight: '700',
  },
  inset: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 14,
    gap: 8,
  },
  insetRow: {
    gap: 2,
  },
  insetValue: {
    fontWeight: '500',
  },
  heroMeter: {
    marginTop: 4,
  },
  section: {
    gap: 12,
  },
  fleetList: {
    gap: 12,
  },
  fleetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fleetId: {
    fontWeight: '600',
  },
  fleetDetail: {
    gap: 2,
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  batteryMeter: {
    flex: 1,
  },
  /** The last row of the card is separated by a rule, not by extra air alone. */
  payloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mapFooter: {
    padding: 16,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  mapCta: {
    marginTop: 10,
  },
});