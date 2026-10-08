import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
  Maximize2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Badge } from '../../shared/components/Badge';
import { Button } from '../../shared/components/Button';
import { HoldToConfirmButton } from '../../shared/components/HoldToConfirmButton';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { AmrChassisDeckVisualizer } from './AmrChassisDeckVisualizer';
import { ContainerSlotCard } from './ContainerSlotCard';
import { MOCK_JOBS } from './jobData';
import { JobStepper } from './JobStepper';
import { VerifyModal } from './VerifyModal';
import { IncidentCategory, IssueReportingModal } from '../monitoring/IssueReportingModal';

export function JobDetailScreen() {
  const { navigate, goBack, params } = useNavigation();
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);
  const [isSoftHold, setIsSoftHold] = useState(false);
  const [targetContainer, setTargetContainer] = useState('BOX-101');
  const [isHandoverCompleted, setIsHandoverCompleted] = useState(false);

  const jobId = params?.jobId || 'JOB-2026-0881';
  const job = MOCK_JOBS.find((j) => j.id === jobId) || MOCK_JOBS[0];

  const handleNudge = (delta: string) => {
    toast.info(`Nudged ${job.assignedRobotCode} by ${delta}. Dock alignment recalibrated.`);
  };

  const handleToggleSoftHold = () => {
    if (isSoftHold) {
      setIsSoftHold(false);
      toast.success(`HOLD RELEASED: ${job.assignedRobotCode} ready to resume Nav2 path.`);
    } else {
      setIsSoftHold(true);
      toast.warning(`HOLD ACTIVE: ${job.assignedRobotCode} soft-paused within 3m perimeter.`);
    }
  };

  const handleOpenVerify = (containerCode?: string) => {
    setTargetContainer(containerCode || 'BOX-101');
    setIsVerifyOpen(true);
  };

  const handleVerifySuccess = (scannedCode: string) => {
    setIsVerifyOpen(false);
    setIsHandoverCompleted(true);
    toast.success(`Handover verified for ${scannedCode}. Robot released to fleet.`);
  };

  const handleIssueSubmit = (cat: IncidentCategory, notes: string) => {
    setIsSoftHold(true);
    toast.error(`Incident logged: ${cat}. Supervisor notified and AMR soft-paused.`);
  };

  return (
    <View style={styles.root}>
      {/* 1. Header with Live Map Shortcut */}
      <SubScreenHeader
        label={`${job.assignedRobotCode || 'AMR'} · ${job.workflowName}`}
        title={job.jobNo}
        onBack={goBack}
        rightAction={
          <Pressable
            onPress={() =>
              navigate('live_map', {
                jobId: job.id,
                robotId: job.assignedRobotCode,
              })
            }
            style={({ pressed }) => [
              styles.liveMapHeaderBtn,
              pressed && styles.liveMapHeaderBtnPressed,
            ]}
          >
            <Maximize2 size={15} color={colors.primary} />
            <Text style={styles.liveMapHeaderText}>Live Map</Text>
          </Pressable>
        }
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Handover Success Banner if completed */}
        {isHandoverCompleted && (
          <View style={styles.successBanner}>
            <CheckCircle2 size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.successTitle}>Handover Completed</Text>
              <Text style={styles.successSubtitle}>
                Container {targetContainer} stored at {job.destinationEndpointCode}. AMR released.
              </Text>
            </View>
          </View>
        )}

        {/* Live Telemetry Progress Banner (SCR-STF-09) */}
        <View style={styles.telemetryCard}>
          <View style={styles.telemetryTopRow}>
            <View style={styles.enRoutePill}>
              <View style={styles.pulseDot} />
              <Text style={styles.enRouteText}>AMR AT DOCKING STATION</Text>
            </View>
            <Text style={styles.distanceText}>Docked: 0m</Text>
          </View>

          <View style={styles.etaRow}>
            <View>
              <Text style={styles.etaLabel}>Station Handover Window</Text>
              <View style={styles.inlineIconRow}>
                <Text style={styles.etaValue}>04:45 remaining</Text>
                <Clock3 size={13} color="#f59e0b" />
              </View>
            </View>
            <View style={styles.progressCol}>
              <Text style={styles.progressLabel}>Navigation Progress</Text>
              <Text style={styles.progressValue}>100%</Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: '100%' }]} />
          </View>

          {/* Telemetry Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>SPEED</Text>
              <Text style={styles.statVal}>0.0 m/s</Text>
            </View>
            <View style={[styles.statItem, styles.statDivider]}>
              <Text style={styles.statLabel}>BATTERY</Text>
              <Text style={styles.statVal}>78%</Text>
            </View>
            <View style={[styles.statItem, styles.statDivider]}>
              <Text style={styles.statLabel}>BRAKES</Text>
              <View style={styles.inlineIconRow}>
                <Text style={[styles.statVal, styles.statSuccess]}>Engaged</Text>
                <CheckCircle2 size={12} color={colors.success} />
              </View>
            </View>
          </View>

          {/* Docking Micro-Nudge Controls & Soft-Hold Toolbar */}
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
                <ChevronLeft size={14} color="#475569" />
                <Text style={styles.nudgeBtnText}>Nudge -10cm</Text>
              </Pressable>
              <Pressable
                onPress={() => handleNudge('+10cm')}
                style={({ pressed }) => [
                  styles.nudgeBtn,
                  pressed && styles.nudgeBtnPressed,
                ]}
              >
                <Text style={styles.nudgeBtnText}>Nudge +10cm</Text>
                <ChevronRight size={14} color="#475569" />
              </Pressable>
              <Pressable
                onPress={handleToggleSoftHold}
                style={[
                  styles.softHoldBtn,
                  isSoftHold && styles.softHoldBtnActive,
                ]}
              >
                <PauseCircle size={13} color={isSoftHold ? '#ffffff' : colors.warning} />
                <Text
                  style={[
                    styles.softHoldText,
                    isSoftHold && styles.softHoldTextActive,
                  ]}
                >
                  {isSoftHold ? 'Hold Active' : 'Hold (3m)'}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Live Radar Map Shortcut */}
          <Pressable
            onPress={() =>
              navigate('live_map', {
                jobId: job.id,
                robotId: job.assignedRobotCode,
              })
            }
            style={({ pressed }) => [
              styles.liveMapLinkBtn,
              pressed && styles.liveMapLinkBtnPressed,
            ]}
          >
            <Compass size={14} color={colors.primary} />
            <Text style={styles.liveMapLinkText}>
              Open Real-Time Radar & Nav2 Trajectory
            </Text>
            <ChevronRight size={14} color={colors.primary} />
          </Pressable>
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
              onVerifyPress={() => handleOpenVerify(slot.containerBarcode)}
            />
          ))}
        </View>

        {/* Multi-Step Workflow Timeline */}
        <JobStepper steps={job.steps} />
      </ScrollView>

      {/* Primary Bottom Actions: Report Issue & Hold To Confirm */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomActionsGrid}>
          <Button
            label="Report Issue"
            variant="outline"
            icon={<AlertTriangle size={16} color={colors.danger} />}
            onPress={() => setIsIssueOpen(true)}
            style={styles.bottomIssueBtn}
            textStyle={{ color: colors.danger, fontSize: 12 }}
          />

          <View style={styles.holdToConfirmWrap}>
            <HoldToConfirmButton
              onConfirm={() => handleOpenVerify(targetContainer)}
              label="HOLD 1.5s TO CONFIRM"
              confirmingLabel="CONFIRMING..."
            />
          </View>
        </View>
      </View>

      {/* Verification Modal (SCR-STF-14 / SCR-STF-15) */}
      <VerifyModal
        visible={isVerifyOpen}
        targetContainer={targetContainer}
        robotCode={job.assignedRobotCode}
        location={job.destinationEndpointCode}
        onClose={() => setIsVerifyOpen(false)}
        onSuccess={handleVerifySuccess}
        onReportIssue={() => {
          setIsVerifyOpen(false);
          setIsIssueOpen(true);
        }}
      />

      {/* Incident Issue Reporting Modal (SCR-STF-16 / SCR-STF-17) */}
      <IssueReportingModal
        visible={isIssueOpen}
        robotCode={job.assignedRobotCode}
        jobId={job.id}
        onClose={() => setIsIssueOpen(false)}
        onSubmit={handleIssueSubmit}
      />
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
    padding: 14,
    paddingBottom: 24,
  },
  liveMapHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  liveMapHeaderBtnPressed: {
    backgroundColor: 'rgba(37, 99, 235, 0.16)',
  },
  liveMapHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  toastCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: colors.success,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.success,
  },
  successSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  telemetryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    ...shadows.panel,
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
    gap: 6,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  enRouteText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  distanceText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  etaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  etaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  inlineIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  etaValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#b45309',
    fontFamily: typography.fontMono,
  },
  progressCol: {
    alignItems: 'flex-end',
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    marginTop: 2,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.surfaceSubtle,
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
    marginBottom: 2,
  },
  statVal: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  statSuccess: {
    color: colors.success,
  },
  nudgeSection: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  nudgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nudgeTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  nudgeBadge: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  nudgeButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  nudgeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 7,
    borderRadius: 6,
  },
  nudgeBtnPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  nudgeBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  softHoldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
  },
  softHoldBtnActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  softHoldText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309',
  },
  softHoldTextActive: {
    color: '#ffffff',
  },
  liveMapLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.15)',
    padding: 8,
    borderRadius: 8,
  },
  liveMapLinkBtnPressed: {
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
  },
  liveMapLinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
    marginLeft: 6,
  },
  manifestSection: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  sectionBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  bottomBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    ...shadows.sheet,
  },
  bottomActionsGrid: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  bottomIssueBtn: {
    flex: 0.38,
    height: 50,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  holdToConfirmWrap: {
    flex: 0.62,
  },
});
