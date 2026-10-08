import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Badge } from '../../shared/components/Badge';
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';
import { AmrChassisDeckVisualizer } from './AmrChassisDeckVisualizer';
import { ContainerSlotCard } from './ContainerSlotCard';
import { MOCK_JOBS } from './jobData';
import { JobStepper } from './JobStepper';

export function JobDetailScreen() {
  const { navigate, params } = useNavigation();
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const jobId = params?.jobId || 'JOB-2026-0881';
  const job = MOCK_JOBS.find((j) => j.id === jobId) || MOCK_JOBS[0];

  const handleNudge = (delta: string) => {
    setToastMsg(`Nudged ${job.assignedRobotCode} by ${delta}. Dock alignment recalibrated.`);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleProceedToMonitoring = () => {
    navigate('job_monitoring', { jobId: job.id });
  };

  return (
    <View style={styles.root}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Job Header Bar */}
        <View style={styles.jobHeader}>
          <View>
            <View style={styles.robotRow}>
              <View style={styles.robotPill}>
                <Text style={styles.robotPillText}>{job.assignedRobotCode || 'UNASSIGNED'}</Text>
              </View>
              <Text style={styles.workflowText}>{job.workflowName}</Text>
            </View>
            <Text style={styles.jobNo}>{job.jobNo}</Text>
          </View>
          <Badge label={job.status} tone="info" size="md" />
        </View>

        {/* Nudge Feedback Toast */}
        {toastMsg && (
          <View style={styles.toastCard}>
            <Text style={styles.toastText}>{toastMsg}</Text>
          </View>
        )}

        {/* Live Telemetry Progress Banner (SCR-STF-09) */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryTopRow}>
            <View style={styles.enRoutePill}>
              <View style={styles.pulseDot} />
              <Text style={styles.enRouteText}>AMR EN ROUTE TO STATION</Text>
            </View>
            <Text style={styles.distanceText}>Distance: 8m away</Text>
          </View>

          <View style={styles.etaRow}>
            <View>
              <Text style={styles.etaLabel}>Estimated Arrival</Text>
              <Text style={styles.etaValue}>ETA 45s ⏳</Text>
            </View>
            <View style={styles.progressCol}>
              <Text style={styles.progressLabel}>Navigation Progress</Text>
              <Text style={styles.progressValue}>75%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: '75%' }]} />
          </View>

          {/* Telemetry Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>SPEED</Text>
              <Text style={styles.statVal}>0.8 m/s</Text>
            </View>
            <View style={[styles.statItem, styles.statDivider]}>
              <Text style={styles.statLabel}>BATTERY</Text>
              <Text style={styles.statVal}>78%</Text>
            </View>
            <View style={[styles.statItem, styles.statDivider]}>
              <Text style={styles.statLabel}>NAV2 PATH</Text>
              <Text style={[styles.statVal, styles.statSuccess]}>Clear 🟢</Text>
            </View>
          </View>

          {/* Docking Micro-Nudge Controls */}
          <View style={styles.nudgeSection}>
            <View style={styles.nudgeHeader}>
              <Text style={styles.nudgeTitle}>DOCKING ALIGNMENT NUDGE</Text>
              <Text style={styles.nudgeBadge}>STAFF BOUNDARY ±10CM</Text>
            </View>
            <View style={styles.nudgeButtons}>
              <Pressable
                onPress={() => handleNudge('-10cm')}
                style={({ pressed }) => [
                  styles.nudgeBtn,
                  pressed && styles.nudgeBtnPressed,
                ]}
              >
                <Text style={styles.nudgeBtnText}>‹ Nudge -10cm</Text>
              </Pressable>
              <Pressable
                onPress={() => handleNudge('+10cm')}
                style={({ pressed }) => [
                  styles.nudgeBtn,
                  pressed && styles.nudgeBtnPressed,
                ]}
              >
                <Text style={styles.nudgeBtnText}>Nudge +10cm ›</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* 3-Slot Physical Flatbed Chassis Visualizer */}
        <AmrChassisDeckVisualizer
          slots={job.slots}
          robotCode={job.assignedRobotCode}
        />

        {/* Cargo Containers Manifest List */}
        <View style={styles.manifestSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>CARGO MANIFEST · DECK PAYLOAD</Text>
            <Text style={styles.sectionBadge}>
              {job.slots.filter((s) => s.action !== 'EMPTY').length} / 3 SLOTS
            </Text>
          </View>

          {job.slots.map((slot) => (
            <ContainerSlotCard
              key={slot.slotNo}
              slot={slot}
              onVerifyPress={handleProceedToMonitoring}
            />
          ))}
        </View>

        {/* Multi-Step Workflow Timeline */}
        <JobStepper steps={job.steps} />
      </ScrollView>

      {/* Primary Execution CTA Bar */}
      <View style={styles.bottomBar}>
        <Button
          label="PROCEED TO EXECUTION & SCAN ➔"
          onPress={handleProceedToMonitoring}
          size="lg"
          variant="primary"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  robotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  robotPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  robotPillText: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primaryDark,
  },
  workflowText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  jobNo: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  toastCard: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  toastText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  telemetryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  telemetryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  enRoutePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 6,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
  },
  enRouteText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textInverse,
    letterSpacing: 0.5,
  },
  distanceText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.primary,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  etaLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  etaValue: {
    fontSize: 20,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  progressCol: {
    alignItems: 'flex-end',
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.primaryLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
    paddingTop: 10,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.surfaceSubtle,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
  },
  statVal: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
    marginTop: 2,
  },
  statSuccess: {
    color: colors.success,
  },
  nudgeSection: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nudgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  nudgeTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  nudgeBadge: {
    fontSize: 8,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textMuted,
  },
  nudgeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  nudgeBtn: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  nudgeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  manifestSection: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  sectionBadge: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  bottomBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
  },
});
