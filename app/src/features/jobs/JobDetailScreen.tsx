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

  const activeUnload =
    job.containers?.find((c) => c.action === 'UNLOAD' || c.action === 'PICKUP') ||
    job.containers?.[0];
  const [targetContainer, setTargetContainer] = useState(activeUnload?.code || 'BOX-101');

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
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={styles.backBtn}
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
          style={styles.liveMapBtn}
          accessibilityRole="button"
          accessibilityLabel="Open live map"
        >
          <Maximize2 size={16} color={colors.primary} />
        </Pressable>

        <Pressable
          onPress={() => setShowMenu(!showMenu)}
          style={styles.menuBtn}
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
                Hold Robot (Soft Pause 3m)
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
              <Text style={styles.menuItemText}>Refresh Nav2 Path</Text>
            </Pressable>
          </View>
        </>
      )}

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* SCR-STF-09: AT-STATION CARD (Waiting Handover) */}
        {isWaiting && (
          <View style={styles.stationCard}>
            <View style={styles.stationHeader}>
              <View style={styles.stationBadge}>
                <Clock3 size={12} color="#92400e" />
                <Text style={styles.stationBadgeText}>SCR-STF-09 · AT STATION</Text>
              </View>
              <View style={styles.remainingPill}>
                <Text style={styles.remainingText}>04:45 remaining</Text>
              </View>
            </View>

            <View style={styles.stationTitleWrap}>
              <Text style={styles.stationTitle}>
                {job.robot} Docked at {job.currentStop}
              </Text>
              <Text style={styles.stationSubtitle}>
                AMR has engaged mechanical brakes. Waiting for operator handover verification.
              </Text>
            </View>

            <View style={styles.perimeterRow}>
              <View style={styles.perimeterLeft}>
                <View style={styles.greenPingDot} />
                <Text style={styles.perimeterBold}>Safety Perimeter Active</Text>
              </View>
              <Text style={styles.batteryText}>Battery: {job.battery}</Text>
            </View>

            {/* Docking Micro-Nudge Controls */}
            <View style={styles.nudgeBox}>
              <View style={styles.nudgeHeader}>
                <View>
                  <Text style={styles.nudgeEyebrow}>DOCKING ALIGNMENT NUDGE</Text>
                  <Text style={styles.nudgeDesc}>Adjust robot position (±10cm) for shelf clearance</Text>
                </View>
                <View style={styles.staffBoundaryBadge}>
                  <Text style={styles.staffBoundaryText}>STAFF BOUNDARY</Text>
                </View>
              </View>

              <View style={styles.nudgeBtnRow}>
                <Pressable
                  onPress={() => handleNudge('-10cm')}
                  style={({ pressed }) => [styles.nudgeBtn, pressed && styles.nudgeBtnPressed]}
                >
                  <ArrowLeft size={14} color={colors.textPrimary} />
                  <Text style={styles.nudgeBtnText}>Nudge -10cm</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleNudge('+10cm')}
                  style={({ pressed }) => [styles.nudgeBtn, pressed && styles.nudgeBtnPressed]}
                >
                  <Text style={styles.nudgeBtnText}>Nudge +10cm</Text>
                  <ArrowRight size={14} color={colors.textPrimary} />
                </Pressable>
              </View>

              <Text style={styles.nudgeNote}>
                Virtual Joystick teleoperation is restricted to Admin. Floor staff may execute ±10cm micro-nudges at dock.
              </Text>
            </View>
          </View>
        )}

        {/* SCR-STF-09: EN ROUTE CARD */}
        {isEnRoute && (
          <View style={styles.enRouteCard}>
            <View style={styles.stationHeader}>
              <View style={styles.enRouteBadge}>
                <Timer size={12} color="#ffffff" />
                <Text style={styles.enRouteBadgeText}>SCR-STF-09 · EN ROUTE</Text>
              </View>
              <Text style={styles.distanceText}>Distance: {job.distanceRemaining || '18m'}</Text>
            </View>

            <View style={styles.enRouteEtaRow}>
              <View>
                <Text style={styles.etaLabel}>Robot Approaching Station</Text>
                <Text style={styles.etaValue}>ETA 01m 24s ⏳</Text>
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

        {/* Dynamic Multi-Container Payload Manifest */}
        <View style={styles.manifestCard}>
          <View style={styles.manifestHeader}>
            <View>
              <Text style={styles.manifestEyebrow}>CARGO MANIFEST · DECK PAYLOAD</Text>
              <Text style={styles.manifestCount}>
                {job.containers?.length || 0} Containers Allocated
              </Text>
            </View>
            <View style={styles.manifestSlotsBadge}>
              <Text style={styles.manifestSlotsText}>
                {job.containers?.length || 0} / 3 SLOTS
              </Text>
            </View>
          </View>

          <View style={styles.containersList}>
            {job.containers?.map((c) => {
              const isUnload = c.action === 'UNLOAD';
              const isPickup = c.action === 'PICKUP';
              const isDelivered = c.action === 'DELIVERED';

              return (
                <View
                  key={c.code}
                  style={[
                    styles.containerItem,
                    isUnload && styles.containerItemUnload,
                    isPickup && styles.containerItemPickup,
                    isDelivered && styles.containerItemDelivered,
                  ]}
                >
                  <View style={styles.containerTopRow}>
                    <View style={styles.containerBadgeRow}>
                      <View
                        style={[
                          styles.containerActionBadge,
                          isUnload
                            ? styles.containerBadgeUnload
                            : isPickup
                            ? styles.containerBadgePickup
                            : styles.containerBadgeKeep,
                        ]}
                      >
                        <Text
                          style={[
                            styles.containerActionText,
                            (isUnload || isPickup) && styles.textWhite,
                          ]}
                        >
                          {isUnload ? 'UNLOAD HERE' : isPickup ? 'PICKUP HERE' : c.action}
                        </Text>
                      </View>
                      <Text style={styles.containerSlotText}>{c.slot}</Text>
                    </View>

                    <Text
                      style={[
                        styles.containerStopStatus,
                        isUnload ? styles.textPrimary : styles.textMuted,
                      ]}
                    >
                      {isUnload ? 'Stop 2: Active' : isPickup ? 'Target Stop' : 'Future Stop'}
                    </Text>
                  </View>

                  <View style={styles.containerBodyRow}>
                    <View style={styles.containerInfoCol}>
                      <Text style={styles.containerCode}>{c.code}</Text>
                      <Text style={styles.containerLocation}>{c.location}</Text>
                      <Text style={styles.containerQty}>
                        {c.qty} × {c.product}
                      </Text>
                    </View>

                    {isWaiting && (isUnload || isPickup) && (
                      <Pressable
                        onPress={() => handleOpenVerify(c.code)}
                        style={({ pressed }) => [
                          styles.verifyBtn,
                          pressed && styles.verifyBtnPressed,
                        ]}
                      >
                        <Check size={14} color="#ffffff" style={{ marginRight: 4 }} />
                        <Text style={styles.verifyBtnText}>Verify</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Multi-Stop Routing & Stepper with Progressive Disclosure */}
        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <Text style={styles.manifestEyebrow}>MULTI-STOP TOUR ITINERARY (TASK ➔ STEP)</Text>
            <Text style={styles.timelineDoneCount}>
              {job.stopsList?.filter((s) => s.state === 'done').length || 0} / {job.stopsList?.length || 0} STOPS DONE
            </Text>
          </View>

          <View style={{ gap: 12 }}>
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
                      >
                        <View style={styles.doneStopsLeft}>
                          <View style={styles.doneCheckCircle}>
                            <Check size={12} color={colors.success} />
                          </View>
                          <Text style={styles.doneStopsTitle}>
                            {doneStops.length} {doneStops.length === 1 ? 'Stop' : 'Stops'} Completed
                          </Text>
                        </View>
                        <Text style={styles.doneStopsAction}>
                          {showDoneStops ? 'Hide ▲' : 'View Details ▼'}
                        </Text>
                      </Pressable>

                      {showDoneStops && (
                        <View style={styles.doneStopsList}>
                          {doneStops.map((stop) => (
                            <View key={stop.id} style={styles.doneStopItem}>
                              <Text style={styles.stopNameDone}>✓ {stop.name}</Text>
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
                        <View key={stop.id} style={styles.activeStopWrapper}>
                          <View style={styles.activeStopCard}>
                            <View style={styles.activeStopHeader}>
                              <View style={styles.activeStopLeft}>
                                <SpinningRefreshIcon size={15} color={colors.primary} />
                                <Text style={styles.activeStopTitle}>{stop.name}</Text>
                              </View>
                              <View style={styles.activeStopBadge}>
                                <Text style={styles.activeStopBadgeText}>{job.robot}</Text>
                              </View>
                            </View>
                            <Text style={styles.activeStopDesc}>{stop.description}</Text>

                            {stop.steps && stop.steps.length > 0 && (
                              <View style={styles.stepsList}>
                                {stop.steps.map((st, idx) => (
                                  <View key={idx} style={styles.stepRow}>
                                    <View
                                      style={[
                                        styles.stepDot,
                                        st.status === 'done'
                                          ? styles.stepDotDone
                                          : st.status === 'waiting'
                                          ? styles.stepDotWaiting
                                          : styles.stepDotFuture,
                                      ]}
                                    />
                                    <Text
                                      style={[
                                        styles.stepLabel,
                                        st.status === 'waiting' && styles.stepLabelActive,
                                      ]}
                                    >
                                      {st.label}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View key={stop.id} style={styles.futureStopRow}>
                        <View style={styles.futureStopDot} />
                        <View style={{ flex: 1 }}>
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
                  style={styles.dockNudgeBtn}
                >
                  <Text style={styles.dockNudgeBtnText}>◀ -10cm</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleNudge('+10cm')}
                  style={styles.dockNudgeBtn}
                >
                  <Text style={styles.dockNudgeBtnText}>+10cm ▶</Text>
                </Pressable>
              </View>

              <Pressable
                onPress={handleToggleSoftHold}
                style={[
                  styles.softHoldTier1Btn,
                  isSoftHold && styles.softHoldTier1Active,
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
                style={styles.reportIssueTier2Btn}
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
              style={styles.reportIssueTier2Btn}
            >
              <AlertTriangle size={18} color={colors.danger} />
              <Text style={styles.reportIssueTier2Text}>Report Obstacle</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('live_map', { jobId: job.id, robotId: job.robot })}
              style={styles.trackLiveMapBtn}
            >
              <Maximize2 size={18} color="#ffffff" />
              <Text style={styles.trackLiveMapText}>Track on Live Map</Text>
            </Pressable>
          </View>
        ) : isCompleted ? (
          <View style={styles.tier2Row}>
            <Pressable
              onPress={() => toast.success('Audit PDF downloaded to device.')}
              style={styles.reportIssueTier2Btn}
            >
              <FileText size={18} color={colors.textPrimary} />
              <Text style={[styles.reportIssueTier2Text, { color: colors.textPrimary }]}>
                Audit Log
              </Text>
            </Pressable>
            <Pressable onPress={goBack} style={styles.trackLiveMapBtn}>
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
              style={styles.reportIssueTier2Btn}
            >
              <X size={18} color={colors.danger} />
              <Text style={styles.reportIssueTier2Text}>Cancel Job</Text>
            </Pressable>
            <Pressable
              onPress={() => toast.info('Job priority escalated to URGENT.')}
              style={styles.trackLiveMapBtn}
            >
              <Sparkles size={18} color="#ffffff" />
              <Text style={styles.trackLiveMapText}>Expedite Priority</Text>
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
    paddingTop: Platform.OS === 'ios' ? 48 : 12,
    paddingBottom: 12,
    minHeight: Platform.OS === 'ios' ? 104 : 68,
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
    inset: 0,
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
  },
  stationSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 17,
  },
  perimeterRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  nudgeDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 2,
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
  },
  manifestCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
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
  },
  containerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  },
  containerBodyRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  containerInfoCol: {
    flex: 1,
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
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
    marginBottom: 12,
  },
  timelineDoneCount: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  doneStopsContainer: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  doneStopsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
  },
  doneStopsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  doneCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneStopsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  doneStopsAction: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  doneStopsList: {
    padding: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  doneStopItem: {
    gap: 2,
  },
  stopNameDone: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.success,
  },
  stopDescDone: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  activeStopWrapper: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: 14,
    marginLeft: 8,
  },
  activeStopCard: {
    backgroundColor: 'rgba(0, 92, 209, 0.06)',
    borderWidth: 2,
    borderColor: 'rgba(0, 92, 209, 0.35)',
    borderRadius: 12,
    padding: 14,
  },
  activeStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeStopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeStopTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
  },
  activeStopBadge: {
    backgroundColor: 'rgba(0, 92, 209, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 92, 209, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeStopBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
  },
  activeStopDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 4,
  },
  stepsList: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 102, 204, 0.15)',
    paddingTop: 10,
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stepDotDone: {
    backgroundColor: colors.success,
  },
  stepDotWaiting: {
    backgroundColor: colors.warning,
  },
  stepDotFuture: {
    backgroundColor: colors.border,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
  },
  stepLabelActive: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  futureStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
  },
  futureStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  futureStopTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  futureStopDesc: {
    fontSize: 10,
    color: colors.textMuted,
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
  },
  dockNudgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
