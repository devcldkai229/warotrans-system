import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  CheckCircle2,
  Clock3,
  Layers,
  Lock,
  MapPin,
  Maximize2,
  MoreVertical,
  Navigation,
  PauseCircle,
  RefreshCw,
  SlidersHorizontal,
  Truck,
  UserMinus,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { useTopInset } from '../../shared/theme/layout';
import { toast } from '../../shared/context/ToastContext';
import { useSafetyHold } from '../../shared/context/SafetyHoldContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { Button, Card, ProgressMeter, StatusPill, Text } from '../../shared/ui';
import { AmrChassisDeckVisualizer } from './AmrChassisDeckVisualizer';
import { JobStepper } from './JobStepper';
import { AppJobItem, JOB_STATUS_PRESENTATION, MOCK_JOBS } from './jobData';
import { VerifyModal } from './VerifyModal';
import { IncidentCategory, IssueReportingModal } from '../monitoring/IssueReportingModal';
import { reportTaskProblem } from '../../shared/api';

export function JobDetailScreen() {
  const { navigate, goBack, params } = useNavigation();
  const topInset = useTopInset();

  const initialModal = params?.modal;
  const isInitialVerify =
    initialModal === 'verify' || initialModal === 'handover' || initialModal === 'mismatch';
  const isInitialMismatch = initialModal === 'mismatch';
  const isInitialIssue = initialModal === 'issue' || initialModal === 'exception';

  const [isVerifyOpen, setIsVerifyOpen] = useState(isInitialVerify);
  const [isMismatch, setIsMismatch] = useState(isInitialMismatch);
  const [isIssueOpen, setIsIssueOpen] = useState(isInitialIssue);
  const [showMenu, setShowMenu] = useState(false);
  const [showOtherContainers, setShowOtherContainers] = useState(false);
  const [showNudgeControls, setShowNudgeControls] = useState(false);

  /** Shared safety hold context */
  const { isHolding, toggleHold } = useSafetyHold();

  const jobId = params?.jobId || 'JOB-2026-0812';
  const job = MOCK_JOBS.find((j) => j.id === jobId) || MOCK_JOBS[0];

  const targetContainers =
    job.containers?.filter((c) => c.action === 'UNLOAD' || c.action === 'PICKUP') || [];
  const otherContainers =
    job.containers?.filter((c) => c.action !== 'UNLOAD' && c.action !== 'PICKUP') || [];
  const primaryTarget = targetContainers[0] || job.containers?.[0];

  const [targetContainer, setTargetContainer] = useState(primaryTarget?.code || 'BOX-101');

  const isEnRoute = job.status === 'RUNNING';
  const isWaiting = job.status === 'ASSIGNED';
  const isCompleted = job.status === 'COMPLETED';

  const statusPresentation = JOB_STATUS_PRESENTATION[job.status];

  const handleNudge = (delta: string) => {
    triggerHaptic('tap');
    toast.info(`Nudged ${job.robot} ${delta}. Dock alignment recalibrated.`);
  };

  const handleToggleSoftHold = () => {
    triggerHaptic('tap');
    if (!isHolding) {
      toggleHold();
      toast.warning(`HOLD ACTIVE: Soft-paused ${job.robot} within 3m safety perimeter.`);
    } else {
      toggleHold();
      toast.success(`HOLD RELEASED: ${job.robot} resumed operation.`);
    }
  };

  const handleOpenVerify = (containerCode?: string) => {
    triggerHaptic('tap');
    if (containerCode) setTargetContainer(containerCode);
    setIsVerifyOpen(true);
  };

  const handleVerifySuccess = (scannedCode: string) => {
    setIsVerifyOpen(false);
    toast.success(`Handover verified for ${scannedCode}. Robot cleared for next waypoint.`);
  };

  const handleIssueSubmit = async (cat: IncidentCategory) => {
    if (!isHolding) toggleHold();
    try {
      await reportTaskProblem(job.id, {
        reason: cat,
        note: `Staff reported ${cat} on AMR ${job.robot} during job ${job.id}`,
      });
    } catch (err) {
      console.warn('Backend report problem returned error, simulated locally:', err);
    }
    setIsIssueOpen(false);
    toast.error(`Incident recorded: ${cat}. Supervisor alerted and robot held.`);
  };

  return (
    <View style={styles.root}>
      {/* Top Navigation Bar */}
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
          accessibilityRole="button"
          accessibilityLabel="Back to jobs"
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.headerTitleCol}>
          <View style={styles.headerTitleRow}>
            <Text variant="headline" style={styles.jobIdText}>
              {job.id}
            </Text>
            <View style={styles.robotPill}>
              <Text variant="caption" color={colors.primary} style={styles.robotPillText}>
                {job.robot}
              </Text>
            </View>
          </View>
          <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {job.workflowName}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="View on map"
          >
            <Maximize2 size={18} color={colors.primary} />
          </Pressable>

          <Pressable
            onPress={() => setShowMenu((prev) => !prev)}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <MoreVertical size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Context Menu Dropdown */}
      {showMenu && (
        <>
          <Pressable style={styles.menuDismiss} onPress={() => setShowMenu(false)} />
          <View style={[styles.menuDropdown, { top: topInset + 56 }]}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleToggleSoftHold();
              }}
            >
              <PauseCircle size={16} color={isHolding ? colors.primary : colors.warning} />
              <Text variant="body" style={styles.menuItemText}>
                {isHolding ? 'Release Soft Hold' : 'Soft Hold Robot (3m)'}
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                setShowNudgeControls((prev) => !prev);
              }}
            >
              <SlidersHorizontal size={16} color={colors.primary} />
              <Text variant="body" style={styles.menuItemText}>
                Dock Alignment Nudge
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                toast.info('Task released back to unassigned fleet pool.');
                goBack();
              }}
            >
              <UserMinus size={16} color={colors.danger} />
              <Text variant="body" color={colors.danger} style={styles.menuItemText}>
                Release Task to Pool
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Main Content Body */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Mission Status Hero Card */}
        <Card padding="md" gap={12}>
          <View style={styles.cardHeaderRow}>
            <StatusPill
              status={job.status}
              label={statusPresentation.label}
              tone={statusPresentation.tone}
              size="md"
              dot
            />
            {isHolding && (
              <View style={styles.holdBannerBadge}>
                <PauseCircle size={13} color="#ffffff" style={{ marginRight: 4 }} />
                <Text variant="caption" style={styles.holdBannerText}>
                  3m Soft Hold Active
                </Text>
              </View>
            )}
          </View>

          {/* Current Stop & Location */}
          <View style={styles.locationBlock}>
            <View style={styles.locationRow}>
              <MapPin size={16} color={colors.primary} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text variant="headline" style={styles.currentStopText}>
                  {job.currentStop}
                </Text>
                <Text variant="caption" color={colors.textSecondary} style={{ marginTop: 2 }}>
                  Route: {job.route}
                </Text>
              </View>
            </View>
          </View>

          {/* Telemetry Strip */}
          <View style={styles.telemetryStrip}>
            <View style={styles.telemetryItem}>
              <Text variant="caption" color={colors.textSecondary} style={styles.telemetryLabel}>
                Carrier
              </Text>
              <Text variant="caption" color={colors.textPrimary} style={styles.telemetryValueMono}>
                {job.robot}
              </Text>
            </View>

            <View style={styles.telemetryDivider} />

            <View style={styles.telemetryItem}>
              <Text variant="caption" color={colors.textSecondary} style={styles.telemetryLabel}>
                Battery
              </Text>
              <Text variant="caption" color={colors.textPrimary} style={styles.telemetryValueBold}>
                {job.battery}
              </Text>
            </View>

            <View style={styles.telemetryDivider} />

            <View style={styles.telemetryItem}>
              <Text variant="caption" color={colors.textSecondary} style={styles.telemetryLabel}>
                {isWaiting ? 'Timing' : 'ETA'}
              </Text>
              <Text
                variant="caption"
                color={isWaiting ? colors.warning : colors.primary}
                style={styles.telemetryValueBold}
              >
                {isWaiting ? 'At Station' : job.etaSeconds ? `${Math.floor(job.etaSeconds / 60)}m` : '01m 24s'}
              </Text>
            </View>
          </View>

          {/* Progress Bar (En Route) */}
          {isEnRoute && (
            <View style={styles.enRouteProgressBlock}>
              <View style={styles.progressHeader}>
                <Text variant="caption" color={colors.textSecondary}>
                  Nav2 Waypoint Progress
                </Text>
                <Text variant="caption" color={colors.primary} style={{ fontWeight: '700' }}>
                  {job.progressPercent || 75}%
                </Text>
              </View>
              <ProgressMeter value={job.progressPercent || 75} tone="primary" />
            </View>
          )}

          {/* Dock Nudge Quick Controls (When expanded) */}
          {showNudgeControls && (
            <View style={styles.nudgeBox}>
              <View style={styles.nudgeBoxHeader}>
                <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                  Dock Alignment Micro-Nudge
                </Text>
                <Pressable onPress={() => setShowNudgeControls(false)}>
                  <X size={14} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.nudgeButtonsRow}>
                <Button
                  title="◀ -10cm"
                  variant="outline"
                  size="sm"
                  onPress={() => handleNudge('-10cm')}
                  style={{ flex: 1 }}
                />
                <Button
                  title="+10cm ▶"
                  variant="outline"
                  size="sm"
                  onPress={() => handleNudge('+10cm')}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}
        </Card>

        {/* Primary Handover Focus Card (When waiting at station) */}
        {isWaiting && primaryTarget && (
          <Card padding="md" gap={12} style={styles.focusCard}>
            <View style={styles.focusHeader}>
              <View style={styles.focusTargetPill}>
                <Text variant="caption" style={styles.focusTargetPillText}>
                  Action Required · Handover
                </Text>
              </View>
              <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                {primaryTarget.slot}
              </Text>
            </View>

            <View style={styles.focusBody}>
              <Text variant="caption" color={colors.textSecondary} style={styles.focusLabel}>
                Container to Unload
              </Text>
              <Text variant="title" style={styles.focusBarcode}>
                {primaryTarget.code}
              </Text>
              <Text variant="bodyMedium" color={colors.textSecondary} style={{ marginTop: 2 }}>
                <Text style={styles.boldQty}>{primaryTarget.qty} pcs</Text> · {primaryTarget.product}
              </Text>
              <View style={styles.focusDestinationRow}>
                <Text variant="caption" color={colors.textSecondary}>
                  Destination Shelf:
                </Text>
                <Text variant="caption" color={colors.textPrimary} style={{ fontWeight: '700' }}>
                  {primaryTarget.location || job.target}
                </Text>
              </View>
            </View>

            {/* Other containers onboard accordion */}
            {otherContainers.length > 0 && (
              <View style={styles.otherContainersSection}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setShowOtherContainers((prev) => !prev);
                  }}
                  style={styles.otherContainersHeader}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle other containers"
                >
                  <View style={styles.otherContainersLeft}>
                    <Lock size={13} color={colors.textMuted} />
                    <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                      {otherContainers.length} Other {otherContainers.length === 1 ? 'Tote' : 'Totes'} Remaining Onboard
                    </Text>
                  </View>
                  <Text variant="caption" color={colors.primary} style={{ fontWeight: '600' }}>
                    {showOtherContainers ? 'Hide ▲' : 'Show ▼'}
                  </Text>
                </Pressable>

                {showOtherContainers && (
                  <View style={styles.otherContainersList}>
                    {otherContainers.map((item) => (
                      <View key={item.code} style={styles.otherContainerItem}>
                        <View style={{ flex: 1 }}>
                          <Text variant="caption" color={colors.textPrimary} style={styles.otherContainerCode}>
                            {item.code} ({item.slot})
                          </Text>
                          <Text variant="caption" color={colors.textSecondary}>
                            <Text style={styles.boldQty}>{item.qty} pcs</Text> · {item.product}
                          </Text>
                        </View>
                        <View style={styles.keepTag}>
                          <Lock size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
                          <Text variant="caption" color={colors.textMuted} style={{ fontSize: 11, fontWeight: '600' }}>
                            Keep
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </Card>
        )}

        {/* Chassis Deck Visualizer (3 Trays) */}
        <AmrChassisDeckVisualizer
          containers={job.containers}
          slots={job.slots}
          targetCode={primaryTarget?.code}
          isWaiting={isWaiting}
          robotId={job.robot}
          onSelectSlot={(code) => handleOpenVerify(code)}
        />

        {/* Stepper Itinerary */}
        {job.steps && job.steps.length > 0 ? (
          <JobStepper steps={job.steps} />
        ) : null}
      </ScrollView>

      {/* Sticky Bottom Action Console */}
      <View style={styles.bottomConsole}>
        {/* Tier 1 Safety & Utilities Strip */}
        <View style={styles.consoleUtilityRow}>
          <Pressable
            onPress={handleToggleSoftHold}
            style={({ pressed }) => [
              styles.utilityBtn,
              isHolding && styles.utilityBtnActive,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Soft hold"
          >
            <PauseCircle
              size={15}
              color={isHolding ? '#ffffff' : colors.warning}
              style={{ marginRight: 6 }}
            />
            <Text
              variant="caption"
              color={isHolding ? '#ffffff' : colors.textPrimary}
              style={{ fontWeight: '600' }}
            >
              {isHolding ? 'Hold Active (3m)' : 'Soft Hold (3m)'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setShowNudgeControls((prev) => !prev)}
            style={({ pressed }) => [
              styles.utilityBtn,
              showNudgeControls && styles.utilityBtnSelected,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Nudge dock alignment"
          >
            <SlidersHorizontal size={14} color={colors.primary} style={{ marginRight: 6 }} />
            <Text variant="caption" color={colors.textPrimary} style={{ fontWeight: '600' }}>
              Dock Nudge
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setIsIssueOpen(true)}
            style={({ pressed }) => [
              styles.utilityBtnDanger,
              pressed && styles.btnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Report issue"
          >
            <AlertTriangle size={14} color={colors.danger} style={{ marginRight: 6 }} />
            <Text variant="caption" color={colors.danger} style={{ fontWeight: '600' }}>
              Report Issue
            </Text>
          </Pressable>
        </View>

        {/* Tier 2 Commanding Action Button (Machined Obsidian #121317) */}
        <View style={styles.consoleCtaRow}>
          {isWaiting ? (
            <Button
              title="Verify Handover"
              variant="primary"
              size="lg"
              fullWidth
              icon={ArrowRight}
              iconPosition="right"
              onPress={() => handleOpenVerify(targetContainer)}
              accessibilityLabel="Verify handover payload"
            />
          ) : isEnRoute ? (
            <Button
              title="Track on Map"
              variant="primary"
              size="lg"
              fullWidth
              icon={Maximize2}
              iconPosition="right"
              onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
              accessibilityLabel="View live AMR tracking"
            />
          ) : isCompleted ? (
            <Button
              title="Back to Jobs"
              variant="primary"
              size="lg"
              fullWidth
              icon={ArrowLeft}
              iconPosition="left"
              onPress={goBack}
              accessibilityLabel="Back to jobs"
            />
          ) : (
            <Button
              title="View Live Map"
              variant="primary"
              size="lg"
              fullWidth
              icon={Maximize2}
              iconPosition="right"
              onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
              accessibilityLabel="View map"
            />
          )}
        </View>
      </View>

      {/* Verification Modal Sheet */}
      <VerifyModal
        visible={isVerifyOpen}
        targetContainer={targetContainer}
        jobStepId={`${job.id}-step-02`}
        operatorId="staff-01"
        robotCode={job.robot}
        location={job.currentStop || 'Rack A-02'}
        targetShelf={job.target || 'Rack A · Level 2 · Bin 03'}
        initialMismatch={isMismatch}
        otherContainers={job.containers
          ?.filter((c) => c.code !== targetContainer)
          .map((c) => ({ code: c.code, slot: c.slot }))}
        onClose={() => setIsVerifyOpen(false)}
        onSuccess={handleVerifySuccess}
        onReportIssue={() => {
          setIsVerifyOpen(false);
          setIsIssueOpen(true);
        }}
      />

      {/* Issue Reporting Modal */}
      <IssueReportingModal
        visible={isIssueOpen}
        robotCode={job.robot}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
  },
  headerTitleCol: {
    flex: 1,
    paddingHorizontal: 8,
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobIdText: {
    fontWeight: '700',
  },
  robotPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  robotPillText: {
    fontWeight: '700',
    fontSize: 11,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuDismiss: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
  },
  menuDropdown: {
    position: 'absolute',
    right: 16,
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    zIndex: 50,
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.sm,
  },
  menuItemText: {
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
    gap: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holdBannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  holdBannerText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  locationBlock: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  currentStopText: {
    fontWeight: '700',
  },
  telemetryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  telemetryDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  telemetryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  telemetryValueBold: {
    fontWeight: '700',
    fontSize: 12,
  },
  telemetryValueMono: {
    fontWeight: '700',
    fontSize: 12,
    fontFamily: typography.fontMono,
  },
  enRouteProgressBlock: {
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nudgeBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 10,
    gap: 8,
  },
  nudgeBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nudgeButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  focusCard: {
    borderWidth: 1.5,
    borderColor: colors.darkAction,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusTargetPill: {
    backgroundColor: colors.darkAction,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  focusTargetPillText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  focusBody: {
    gap: 2,
  },
  focusLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  focusBarcode: {
    fontWeight: '800',
    fontSize: 24,
    fontFamily: typography.fontMono,
    letterSpacing: 0.5,
  },
  boldQty: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  otherContainerCode: {
    fontWeight: '700',
    fontFamily: typography.fontMono,
  },
  focusDestinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  otherContainersSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    gap: 8,
  },
  otherContainersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  otherContainersLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  otherContainersList: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: 8,
    gap: 8,
  },
  otherContainerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  keepTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bottomConsole: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 16,
    gap: 10,
    ...shadows.lg,
  },
  consoleUtilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  utilityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  utilityBtnActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  utilityBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  utilityBtnDanger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  consoleCtaRow: {
    width: '100%',
  },
});
