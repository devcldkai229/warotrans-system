import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Layers,
  Lock,
  MapPin,
  Maximize2,
  MoreVertical,
  PauseCircle,
  RefreshCw,
  Sparkles,
  Timer,
  UserMinus,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { HoldToConfirmButton } from '../../shared/components/HoldToConfirmButton';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { useTopInset } from '../../shared/theme/layout';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { AmrChassisDeckVisualizer } from './AmrChassisDeckVisualizer';
import { AppJobItem, MOCK_JOBS } from './jobData';
import { VerifyModal } from './VerifyModal';
import { IncidentCategory, IssueReportingModal } from '../monitoring/IssueReportingModal';

function SpinningRefreshIcon({ size = 15, color = colors.primary }: { size?: number; color?: string }) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2500,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate: spin }] }}>
      <RefreshCw size={size} color={color} />
    </Animated.View>
  );
}

export function JobDetailScreen() {
  const { navigate, goBack, params } = useNavigation();
  const topInset = useTopInset();
  const initialModal = params?.modal;
  const isInitialVerify = initialModal === 'verify' || initialModal === 'handover' || initialModal === 'mismatch';
  const isInitialMismatch = initialModal === 'mismatch';
  const isInitialIssue = initialModal === 'issue' || initialModal === 'exception';

  const [isVerifyOpen, setIsVerifyOpen] = useState(isInitialVerify);
  const [isMismatch, setIsMismatch] = useState(isInitialMismatch);
  const [isIssueOpen, setIsIssueOpen] = useState(isInitialIssue);
  const [isSoftHold, setIsSoftHold] = useState(false);
  const [showDoneStops, setShowDoneStops] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const jobId = params?.jobId || 'JOB-2026-0812';
  const job = MOCK_JOBS.find((j) => j.id === jobId) || MOCK_JOBS[0];

  const [showOtherContainers, setShowOtherContainers] = useState(false);

  const isDockStation = Boolean(
    job.currentStop?.toLowerCase().includes('dock') ||
    job.target?.toLowerCase().includes('dock') ||
    job.sourceEndpointCode?.toLowerCase().includes('dock')
  );

  const targetContainers =
    job.containers?.filter((c) => c.action === 'UNLOAD' || c.action === 'PICKUP') || [];
  const otherContainers =
    job.containers?.filter((c) => c.action !== 'UNLOAD' && c.action !== 'PICKUP') || [];
  const primaryTarget = targetContainers[0] || job.containers?.[0];

  const activeUnload = primaryTarget;
  const [targetContainer, setTargetContainer] = useState(primaryTarget?.code || 'BOX-101');

  const isEnRoute = job.kind === 'transit';
  const isWaiting = job.kind === 'waiting';
  const isCompleted = job.kind === 'complete';
  const isQueued = job.kind === 'queued';

  const handleNudge = (delta: string) => {
    toast.info(`Nudged ${job.robot} ${delta}. Dock alignment recalibrated.`);
  };

  const handleToggleSoftHold = () => {
    if (!isSoftHold) {
      setIsSoftHold(true);
      toast.warning(`HOLD ROBOT: Soft-paused ${job.robot} within 3m perimeter. (Local pause, not warehouse E-Stop)`);
    } else {
      setIsSoftHold(false);
      toast.success(`HOLD RELEASED: ${job.robot} ready to proceed.`);
    }
  };

  const handleOpenVerify = (containerCode?: string) => {
    setTargetContainer(containerCode || activeUnload?.code || 'BOX-101');
    setIsVerifyOpen(true);
  };

  const handleVerifySuccess = (scannedCode: string) => {
    setIsVerifyOpen(false);
    toast.success(`Handover verified for ${scannedCode}. Robot released to fleet.`);
  };

  const handleIssueSubmit = (cat: IncidentCategory, notes: string) => {
    setIsSoftHold(true);
    toast.error(`Incident logged: ${cat}. Supervisor notified and AMR soft-paused.`);
  };

  return (
    <View style={styles.root}>
      {/* Sticky App Header */}
      <View style={[styles.header, { paddingTop: topInset, minHeight: topInset + 56 }]}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.tactilePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.headerTitleCol}>
          <View style={styles.headerMetaRow}>
            <View style={styles.robotBadge}>
              <Text style={styles.robotBadgeText}>{job.robot}</Text>
            </View>
            <Text style={styles.workflowEyebrow} numberOfLines={1}>
              {job.workflowName}
            </Text>
          </View>
          <Text style={styles.jobIdHeading} numberOfLines={1}>
            {job.id}
          </Text>
        </View>

        <Pressable
          onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
          style={({ pressed }) => [
            styles.liveMapBtn,
            pressed && styles.tactilePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open live map"
        >
          <Maximize2 size={16} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={() => setShowMenu(!showMenu)}
          style={({ pressed }) => [
            styles.menuBtn,
            pressed && styles.tactilePressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <MoreVertical size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Dropdown Menu Popover */}
      {showMenu && (
        <>
          <Pressable style={styles.menuDismiss} onPress={() => setShowMenu(false)} />
          <View style={styles.menuDropdown}>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                toast.info('Task released back to pool.');
                goBack();
              }}
            >
              <UserMinus size={15} color={colors.danger} />
              <Text style={[styles.menuItemText, { color: colors.danger }]}>Release Task</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                handleToggleSoftHold();
              }}
            >
              <PauseCircle size={15} color={colors.warning} />
              <Text style={[styles.menuItemText, { color: colors.warning }]}>
                Hold Robot (3m)
              </Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setShowMenu(false);
                toast.info('Nav2 Telemetry refreshed.');
              }}
            >
              <RefreshCw size={15} color={colors.primary} />
              <Text style={styles.menuItemText}>Refresh Route</Text>
            </Pressable>
          </View>
        </>
      )}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* AT-STATION CARD (Waiting Handover) */}
        {isWaiting && (
          <View style={styles.stationCard}>
            <View style={styles.stationHeader}>
              <View style={styles.stationBadge}>
                <Clock3 size={12} color="#92400e" />
                <Text style={styles.stationBadgeText}>AT STATION</Text>
              </View>
              <View style={styles.remainingPill}>
                <Text style={styles.remainingText}>04:45 remaining</Text>
              </View>
            </View>

            <View style={styles.stationTitleWrap}>
              <Text style={styles.stationTitle}>
                {job.robot} Docked at {job.currentStop}
              </Text>
            </View>

            <View style={styles.perimeterRow}>
              <View style={styles.perimeterLeft}>
                <View style={styles.greenPingDot} />
                <Text style={styles.perimeterBold}>Safety Perimeter Active</Text>
              </View>
              <Text style={styles.batteryText}>Battery: {job.battery}</Text>
            </View>
          </View>
        )}

        {/* EN ROUTE CARD */}
        {isEnRoute && (
          <View style={styles.enRouteCard}>
            <View style={styles.stationHeader}>
              <View style={styles.enRouteBadge}>
                <Timer size={12} color="#ffffff" />
                <Text style={styles.enRouteBadgeText}>EN ROUTE</Text>
              </View>
              <Text style={styles.distanceText}>Distance: {job.distanceRemaining || '18m'}</Text>
            </View>

            <View style={styles.enRouteEtaRow}>
              <View>
                <Text style={styles.etaLabel}>Approaching Station</Text>
                <Text style={styles.etaValue}>
                  ETA {job.etaSeconds ? `${Math.floor(job.etaSeconds / 60).toString().padStart(2, '0')}m ${(job.etaSeconds % 60).toString().padStart(2, '0')}s` : '01m 24s'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.etaLabel}>PROGRESS</Text>
                <Text style={styles.progressPercentText}>{job.progressPercent || 75}%</Text>
              </View>
            </View>

            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${job.progressPercent || 75}%` }]} />
            </View>

            <View style={styles.telemetryGrid}>
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>SPEED</Text>
                <Text style={styles.telemetryVal}>{job.speed}</Text>
              </View>
              <View style={[styles.telemetryItem, styles.telemetryDivider]}>
                <Text style={styles.telemetryLabel}>BATTERY</Text>
                <Text style={styles.telemetryVal}>{job.battery}</Text>
              </View>
              <View style={[styles.telemetryItem, styles.telemetryDivider]}>
                <Text style={styles.telemetryLabel}>NAV2 PATH</Text>
                <Text style={[styles.telemetryVal, { color: colors.success }]}>Clear 🟢</Text>
              </View>
            </View>
          </View>
        )}

        {/* Visual 3-Slot Physical Chassis Map */}
        <AmrChassisDeckVisualizer
          containers={job.containers}
          targetCode={activeUnload?.code}
          isWaiting={isWaiting}
          robotId={job.robot}
        />

        {/* Dynamic Multi-Container Payload Manifest (Target Highlighted + Collapsible Others) */}
        <View style={styles.manifestCard}>
          <View style={styles.manifestHeader}>
            <View>
              <Text style={styles.manifestEyebrow}>CARGO HANDOVER · TARGET SLOT</Text>
              <Text style={styles.manifestCount}>
                {isDockStation
                  ? `Batch Transfer (${job.containers?.length || 0} Containers)`
                  : primaryTarget
                  ? `Target: ${primaryTarget.code} (${primaryTarget.slot})`
                  : 'Deck Empty'}
              </Text>
            </View>
            <View style={styles.manifestSlotsBadge}>
              <Text style={styles.manifestSlotsText}>
                {job.containers?.length || 0} / 3 SLOTS
              </Text>
            </View>
          </View>

          {/* Primary Target Container */}
          {primaryTarget && (
            <View style={[styles.containerItem, styles.containerItemUnload]}>
              <View style={styles.containerTopRow}>
                <View style={styles.containerBadgeRow}>
                  <View style={[styles.containerActionBadge, styles.containerBadgeUnload]}>
                    <Text style={[styles.containerActionText, styles.textWhite]}>
                      {isDockStation ? 'BATCH HANDOVER' : 'UNLOAD TARGET'}
                    </Text>
                  </View>
                  <Text style={styles.containerSlotText}>{primaryTarget.slot}</Text>
                </View>

                <Text style={[styles.containerStopStatus, styles.textPrimary]}>
                  {job.currentStop || 'Active Stop'}
                </Text>
              </View>

              <View style={styles.containerBodyRow}>
                <View style={styles.containerInfoCol}>
                  <Text style={styles.containerCode}>{primaryTarget.code}</Text>
                  <Text style={styles.containerLocation}>{primaryTarget.location || job.target}</Text>
                  <Text style={styles.containerQty}>
                    {primaryTarget.qty} × {primaryTarget.product}
                  </Text>
                </View>

                {isWaiting && (
                  <Pressable
                    onPress={() => handleOpenVerify(primaryTarget.code)}
                    style={({ pressed }) => [
                      styles.verifyBtn,
                      pressed && styles.verifyBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Verify ${primaryTarget.code}`}
                  >
                    <Check size={14} color="#ffffff" style={{ marginRight: 4 }} />
                    <Text style={styles.verifyBtnText}>
                      {isDockStation ? 'Verify All' : 'Verify'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* Collapsible Secondary Containers (Keep Onboard) */}
          {!isDockStation && otherContainers.length > 0 && (
            <View style={styles.otherContainersSection}>
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setShowOtherContainers(!showOtherContainers);
                }}
                style={styles.otherContainersToggle}
                accessibilityRole="button"
                accessibilityLabel="Toggle other containers"
              >
                <View style={styles.otherToggleLeft}>
                  <Lock size={12} color="#64748b" />
                  <Text style={styles.otherToggleTitle}>
                    {otherContainers.length} Other {otherContainers.length === 1 ? 'Container' : 'Containers'} (Keep Onboard)
                  </Text>
                </View>
                <Text style={styles.otherToggleAction}>
                  {showOtherContainers ? 'Hide ▲' : 'Details ▼'}
                </Text>
              </Pressable>

              {showOtherContainers && (
                <View style={styles.otherContainersList}>
                  {otherContainers.map((c) => (
                    <View key={c.code} style={styles.otherContainerRow}>
                      <View style={styles.otherContainerLeft}>
                        <Text style={styles.otherContainerCode}>{c.code}</Text>
                        <Text style={styles.otherContainerSlot}>{c.slot}</Text>
                        <Text style={styles.otherContainerProd}>{c.qty} × {c.product}</Text>
                      </View>
                      <View style={styles.otherKeepBadge}>
                        <Lock size={9} color="#64748b" style={{ marginRight: 3 }} />
                        <Text style={styles.otherKeepText}>KEEP</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Multi-Stop Tour Itinerary (Matching Prototype 100%) */}
        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>MULTI-STOP TOUR ITINERARY (TASK ➔ STEP)</Text>
            <Text style={styles.timelineDoneCount}>
              {job.stopsList?.filter((s) => s.state === 'done').length || 0} / {job.stopsList?.length || 0} STOPS DONE
            </Text>
          </View>
          <View style={styles.timelineDivider} />

          <View style={{ gap: 14 }}>
            {/* Completed Stops Collapsible */}
            {(() => {
              const doneStops = job.stopsList?.filter((s) => s.state === 'done') || [];
              const remainingStops = job.stopsList?.filter((s) => s.state !== 'done') || [];

              return (
                <>
                  {doneStops.length > 0 && (
                    <View style={styles.doneStopsContainer}>
                      <Pressable
                        onPress={() => {
                          triggerHaptic('tap');
                          setShowDoneStops(!showDoneStops);
                        }}
                        style={styles.doneStopsToggle}
                        accessibilityRole="button"
                        accessibilityLabel="Toggle completed stops details"
                      >
                        <View style={styles.doneStopsLeft}>
                          <View style={styles.doneCheckCircle}>
                            <Check size={14} color="#16a34a" strokeWidth={2.5} />
                          </View>
                          <Text style={styles.doneStopsTitle}>
                            {doneStops.length} {doneStops.length === 1 ? 'Stop' : 'Stops'} Completed
                          </Text>
                        </View>
                        <Text style={styles.doneStopsAction}>
                          {showDoneStops ? 'Hide ▲' : 'Details ▼'}
                        </Text>
                      </Pressable>

                      {showDoneStops && (
                        <View style={styles.doneStopsList}>
                          {doneStops.map((stop) => (
                            <View key={stop.id} style={styles.doneStopItem}>
                              <View style={styles.doneStopHeaderRow}>
                                <CheckCircle2 size={13} color="#16a34a" />
                                <Text style={styles.stopNameDone}>{stop.name}</Text>
                              </View>
                              <Text style={styles.stopDescDone}>{stop.description}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {/* Active and Future Stops */}
                  {remainingStops.map((stop) => {
                    if (stop.state === 'active') {
                      return (
                        <View key={stop.id} style={styles.activeStopRowContainer}>
                          {/* Left solid blue vertical rail */}
                          <View style={styles.activeStopIndicatorBar} />

                          {/* Active Stop Card */}
                          <View style={styles.activeStopCard}>
                            <View style={styles.activeStopHeader}>
                              <View style={styles.activeStopLeft}>
                                <SpinningRefreshIcon size={16} color={colors.primary} />
                                <Text style={styles.activeStopTitle} numberOfLines={1}>
                                  {stop.name}
                                </Text>
                              </View>
                              <View style={styles.activeStopBadge}>
                                <Text style={styles.activeStopBadgeText}>{job.robot}</Text>
                              </View>
                            </View>
                            <Text style={styles.activeStopDesc}>{stop.description}</Text>

                            {stop.steps && stop.steps.length > 0 && (
                              <View style={styles.stepsList}>
                                {stop.steps.map((st, idx) => {
                                  const isDone = st.status === 'done';
                                  const isWaiting = st.status === 'waiting' || st.status === 'running';

                                  return (
                                    <View key={idx} style={styles.stepRow}>
                                      {isDone ? (
                                        <CheckCircle2 size={16} color="#16a34a" />
                                      ) : isWaiting ? (
                                        <Clock3 size={16} color="#b45309" />
                                      ) : (
                                        <Clock3 size={16} color="#64748b" />
                                      )}
                                      <Text
                                        style={[
                                          styles.stepLabel,
                                          isDone && styles.stepLabelDone,
                                          isWaiting && styles.stepLabelWaiting,
                                          !isDone && !isWaiting && styles.stepLabelFuture,
                                        ]}
                                      >
                                        {st.label}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View key={stop.id} style={styles.futureStopRow}>
                        <View style={styles.futureStopRing}>
                          <Clock3 size={15} color="#64748b" />
                        </View>
                        <View style={styles.futureStopTextCol}>
                          <Text style={styles.futureStopTitle}>{stop.name}</Text>
                          <Text style={styles.futureStopDesc}>{stop.description}</Text>
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()}
          </View>
        </View>
      </ScrollView>

      {/* Fixed Sticky Bottom Action Footer (Matching Prototype lines 1919-1978) */}
      <View style={styles.stickyFooter}>
        {isWaiting ? (
          <View style={styles.footerCol}>
            {/* Tier 1: Micro-Docking Safety & Nudge Toolbar */}
            <View style={styles.tier1Toolbar}>
              <View style={styles.dockNudgeGroup}>
                <Text style={styles.dockNudgeLabel}>DOCK NUDGE:</Text>
                <Pressable
                  onPress={() => handleNudge('-10cm')}
                  style={({ pressed }) => [
                    styles.dockNudgeBtn,
                    pressed && styles.tactilePressed,
                  ]}
                >
                  <Text style={styles.dockNudgeBtnText}>◀ -10cm</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleNudge('+10cm')}
                  style={({ pressed }) => [
                    styles.dockNudgeBtn,
                    pressed && styles.tactilePressed,
                  ]}
                >
                  <Text style={styles.dockNudgeBtnText}>+10cm ▶</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={handleToggleSoftHold}
                style={({ pressed }) => [
                  styles.softHoldTier1Btn,
                  isSoftHold && styles.softHoldTier1Active,
                  pressed && styles.tactilePressed,
                ]}
              >
                <PauseCircle
                  size={12}
                  color={isSoftHold ? '#ffffff' : colors.warning}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.softHoldTier1Text,
                    isSoftHold && styles.textWhite,
                  ]}
                >
                  {isSoftHold ? 'Hold Active (3m)' : 'Soft Hold (3m)'}
                </Text>
              </Pressable>
            </View>

            {/* Tier 2: Primary Handover Confirmation & Issue Reporting */}
            <View style={styles.tier2Row}>
              <Pressable
                onPress={() => setIsIssueOpen(true)}
                style={({ pressed }) => [
                  styles.reportIssueTier2Btn,
                  pressed && styles.tactilePressed,
                ]}
              >
                <AlertTriangle size={18} color={colors.danger} />
                <Text style={styles.reportIssueTier2Text}>Report Issue</Text>
              </Pressable>

              <View style={styles.holdToConfirmTier2Wrap}>
                <HoldToConfirmButton
                  onConfirm={() => handleOpenVerify(targetContainer)}
                />
              </View>
            </View>
          </View>
        ) : isEnRoute ? (
          <View style={styles.tier2Row}>
            <Pressable
              onPress={() => setIsIssueOpen(true)}
              style={({ pressed }) => [
                styles.reportIssueTier2Btn,
                pressed && styles.tactilePressed,
              ]}
            >
              <AlertTriangle size={18} color={colors.danger} />
              <Text style={styles.reportIssueTier2Text}>Report Obstacle</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
              style={({ pressed }) => [
                styles.trackLiveMapBtn,
                pressed && styles.tactilePressed,
              ]}
            >
              <Maximize2 size={18} color="#ffffff" />
              <Text style={styles.trackLiveMapText}>Live Map</Text>
            </Pressable>
          </View>
        ) : isCompleted ? (
          <View style={styles.tier2Row}>
            <Pressable
              onPress={() => toast.success('Audit PDF downloaded to device.')}
              style={({ pressed }) => [
                styles.reportIssueTier2Btn,
                pressed && styles.tactilePressed,
              ]}
            >
              <FileText size={18} color={colors.textPrimary} />
              <Text style={[styles.reportIssueTier2Text, { color: colors.textPrimary }]}>
                Audit Log
              </Text>
            </Pressable>
            <Pressable
              onPress={goBack}
              style={({ pressed }) => [
                styles.trackLiveMapBtn,
                pressed && styles.tactilePressed,
              ]}
            >
              <ArrowLeft size={18} color="#ffffff" />
              <Text style={styles.trackLiveMapText}>Back to Jobs</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.tier2Row}>
            <Pressable
              onPress={() => {
                toast.info('Mission cancelled.');
                goBack();
              }}
              style={({ pressed }) => [
                styles.reportIssueTier2Btn,
                pressed && styles.tactilePressed,
              ]}
            >
              <X size={18} color={colors.danger} />
              <Text style={styles.reportIssueTier2Text}>Cancel Job</Text>
            </Pressable>
            <Pressable
              onPress={() => toast.info('Job priority escalated to URGENT.')}
              style={({ pressed }) => [
                styles.trackLiveMapBtn,
                pressed && styles.tactilePressed,
              ]}
            >
              <Sparkles size={18} color="#ffffff" />
              <Text style={styles.trackLiveMapText}>Expedite</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Verification Modal (SCR-STF-14 / SCR-STF-15) */}
      <VerifyModal
        visible={isVerifyOpen}
        targetContainer={targetContainer}
        robotCode={job.robot}
        location={job.currentStop || 'Stop 2/3: Rack A-02'}
        targetShelf={job.target || 'Rack A · Level 2 · Bin 03'}
        initialMismatch={isMismatch}
        otherContainers={job.containers?.filter(c => c.code !== targetContainer).map(c => ({ code: c.code, slot: c.slot }))}
        isBulkMode={isDockStation}
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
    position: 'relative',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 0,
    paddingBottom: 12,
    minHeight: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 6,
    zIndex: 30,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  robotBadge: {
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  robotBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 8,
    fontWeight: '900',
    color: colors.primary,
  },
  workflowEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    color: colors.primary,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  jobIdHeading: {
    fontFamily: typography.fontMono,
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 1,
  },
  liveMapBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  menuDropdown: {
    position: 'absolute',
    right: 12,
    top: 56,
    width: 210,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 50,
    padding: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  menuItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 160,
    gap: 16,
  },
  stationCard: {
    backgroundColor: '#fffbeb',
    borderWidth: 2,
    borderColor: '#f59e0b',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  stationBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: '#ffffff',
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  remainingPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  remainingText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '900',
    color: '#92400e',
  },
  stationTitleWrap: {
    marginTop: 10,
  },
  stationTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  stationSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 17,
    fontFamily: typography.fontSans,
  },
  perimeterRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 8,
    padding: 10,
  },
  perimeterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  greenPingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  perimeterBold: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  batteryText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    color: colors.textMuted,
  },
  nudgeBox: {
    marginTop: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  nudgeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  nudgeEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  nudgeDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  staffBoundaryBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staffBoundaryText: {
    fontFamily: typography.fontMono,
    fontSize: 8,
    fontWeight: '700',
    color: colors.textMuted,
  },
  nudgeBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nudgeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    height: 36,
    gap: 6,
    backgroundColor: colors.surface,
  },
  nudgeBtnPressed: {
    backgroundColor: '#f8fafc',
  },
  nudgeBtnText: {
    fontFamily: typography.fontMono,
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  nudgeNote: {
    fontSize: 9,
    color: colors.textMuted,
    lineHeight: 13,
  },
  enRouteCard: {
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: 'rgba(0, 102, 204, 0.3)',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  enRouteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  enRouteBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#ffffff',
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  distanceText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  enRouteEtaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  etaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  etaValue: {
    fontFamily: typography.fontMono,
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 2,
  },
  progressPercentText: {
    fontFamily: typography.fontMono,
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: 'rgba(0, 102, 204, 0.2)',
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 5,
  },
  telemetryGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 102, 204, 0.15)',
    paddingTop: 10,
    marginTop: 6,
  },
  telemetryItem: {
    flex: 1,
    alignItems: 'center',
  },
  telemetryDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  telemetryLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  telemetryVal: {
    fontFamily: typography.fontMono,
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
  },
  manifestCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  manifestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  manifestEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  manifestCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  manifestSlotsBadge: {
    backgroundColor: 'rgba(0, 102, 204, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 204, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  manifestSlotsText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
  },
  containersList: {
    marginTop: 12,
    gap: 10,
  },
  containerItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(241, 245, 249, 0.2)',
    padding: 12,
  },
  containerItemUnload: {
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 102, 204, 0.04)',
  },
  containerItemPickup: {
    borderWidth: 2,
    borderColor: colors.warning,
    backgroundColor: '#fffbeb',
  },
  containerItemDelivered: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
  },
  containerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  containerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  containerActionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  containerBadgeUnload: {
    backgroundColor: colors.primary,
  },
  containerBadgePickup: {
    backgroundColor: colors.warning,
  },
  containerBadgeKeep: {
    backgroundColor: '#f1f5f9',
  },
  containerActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  containerSlotText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  containerStopStatus: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
    flexShrink: 0,
  },
  containerBodyRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  containerInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  containerCode: {
    fontFamily: typography.fontMono,
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  containerLocation: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  containerQty: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 6,
  },
  verifyBtnPressed: {
    opacity: 0.85,
  },
  verifyBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  otherContainersSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  otherContainersToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  otherToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  otherToggleTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  otherToggleAction: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  otherContainersList: {
    marginTop: 8,
    gap: 6,
  },
  otherContainerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  otherContainerLeft: {
    flex: 1,
  },
  otherContainerCode: {
    fontFamily: typography.fontMono,
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  otherContainerSlot: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
  otherContainerProd: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  otherKeepBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 4,
  },
  otherKeepText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#64748b',
    fontFamily: typography.fontSans,
  },
  timelineCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timelineTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1e3a5f',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
    flex: 1,
  },
  timelineDoneCount: {
    fontFamily: typography.fontMono,
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  timelineDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 10,
    marginBottom: 14,
  },
  doneStopsContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  doneStopsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
  },
  doneStopsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  doneCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneStopsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    fontFamily: typography.fontSans,
  },
  doneStopsAction: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  doneStopsList: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    gap: 10,
  },
  doneStopItem: {
    gap: 2,
  },
  doneStopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stopNameDone: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
    fontFamily: typography.fontSans,
  },
  stopDescDone: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    paddingLeft: 19,
  },
  activeStopRowContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  activeStopIndicatorBar: {
    width: 3.5,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  activeStopCard: {
    flex: 1,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
  },
  activeStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeStopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  activeStopTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
  activeStopBadge: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeStopBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
  },
  activeStopDesc: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
    marginTop: 5,
    lineHeight: 16,
    fontFamily: typography.fontSans,
  },
  stepsList: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
    paddingTop: 10,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepLabel: {
    fontSize: 11.5,
    fontFamily: typography.fontSans,
    flex: 1,
    lineHeight: 16,
  },
  stepLabelDone: {
    fontWeight: '800',
    color: '#15803d',
  },
  stepLabelWaiting: {
    fontWeight: '800',
    color: '#92400e',
  },
  stepLabelFuture: {
    fontWeight: '700',
    color: '#334155',
  },
  futureStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  futureStopRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  futureStopTextCol: {
    flex: 1,
    minWidth: 0,
  },
  futureStopTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    fontFamily: typography.fontSans,
  },
  futureStopDesc: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748b',
    marginTop: 2,
    lineHeight: 15,
    fontFamily: typography.fontSans,
  },
  stickyFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    paddingBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 20,
  },
  footerCol: {
    gap: 8,
  },
  tier1Toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(241, 245, 249, 0.6)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  dockNudgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  dockNudgeLabel: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    paddingLeft: 4,
  },
  dockNudgeBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    height: 28,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockNudgeBtnText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  softHoldTier1Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.warning,
    paddingHorizontal: 8,
    height: 28,
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  softHoldTier1Active: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  softHoldTier1Text: {
    fontSize: 10,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontSans,
  },
  tier2Row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  reportIssueTier2Btn: {
    flex: 0.38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 12,
    height: 64,
    gap: 6,
    backgroundColor: colors.surface,
  },
  reportIssueTier2Text: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.danger,
    fontFamily: typography.fontSans,
  },
  holdToConfirmTier2Wrap: {
    flex: 0.62,
  },
  trackLiveMapBtn: {
    flex: 0.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 64,
    borderBottomWidth: 3,
    borderBottomColor: '#004bb0',
    gap: 6,
  },
  trackLiveMapText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: typography.fontSans,
  },
  /**
   * Shared tactile press state for every interactive control on this screen.
   * 2% scale + slight opacity drop reads as mechanical key travel on both the flat
   * chip buttons and the beveled 64pt tier-2 actions.
   */
  tactilePressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  textWhite: {
    color: '#ffffff',
  },
  textPrimary: {
    color: colors.primary,
  },
  textMuted: {
    color: colors.textMuted,
  },
});
