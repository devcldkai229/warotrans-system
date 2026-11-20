import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Lock, RefreshCw, ShieldAlert, Unlock } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { stopStatePresentation } from '../jobs/jobData';
import { isStopStateInFlight } from '../jobs/jobData';
import {
  acquireManualLease,
  getManualLease,
  getRobotStopState,
  getUserErrorMessage,
  listRobots,
  mobileCapabilities,
  releaseManualLease,
  resumeRobotMotion,
  stopRobot,
  teleopRobot,
} from '../../shared/api';
import { onAccessTokenChange } from '../../shared/api/client';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { formatBattery } from '../../shared/formatBattery';
import { t } from '../../shared/i18n';
import { robotStatusLabel } from '../../shared/maps/robotLabels';
import { useRealtime } from '../../shared/realtime';
import type { ThemeColors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type { ManualLeaseResponse, RobotResponse } from '../../shared/types/contracts';
import { Button, Card, EmptyState, ReasonSheet, SegmentedControl, StatusPill, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { ManualJoystickPad } from './ManualJoystickPad';
import {
  createTeleopController,
  MANUAL_LEASE_RENEW_MS,
  manualDriveBlockReason,
  SPEED_PRESETS,
} from './manualDriveLogic';

const SPEED_OPTIONS = SPEED_PRESETS.map((value) => ({
  label: `${value.toFixed(1)} m/s`,
  value: String(value),
}));

const formatClock = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export function ManualDriveScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { goBack, params, dockHeight } = useNavigation();
  const { isConnected, robotTelemetry } = useRealtime();
  const client = useQueryClient();

  const canDrivePermission = sessionCan(session, PERMISSIONS.robotManualDrive);
  const canTakeOver = sessionCan(session, PERMISSIONS.robotManage);
  const canStop = sessionCan(session, PERMISSIONS.robotStop);
  const canResumeMotion = sessionCan(session, PERMISSIONS.robotConfigure);

  const [appActive, setAppActive] = useState(
    AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
  );
  const [selectedRobotKey, setSelectedRobotKey] = useState<string>(
    typeof params?.robotId === 'string' ? params.robotId : '',
  );
  const [leaseDesired, setLeaseDesired] = useState(false);
  const [leaseError, setLeaseError] = useState<string | null>(null);
  const [teleopError, setTeleopError] = useState<string | null>(null);
  const [stopNotice, setStopNotice] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [interruptedNotice, setInterruptedNotice] = useState(false);
  const [linkInterrupted, setLinkInterrupted] = useState(false);
  const [assist, setAssist] = useState(true);
  const [maxLinear, setMaxLinear] = useState<number>(0.2);
  const [targetVelocity, setTargetVelocity] = useState({ linear: 0, angular: 0 });
  const [isMoving, setIsMoving] = useState(false);
  const [leaseBusy, setLeaseBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [takeoverOpen, setTakeoverOpen] = useState(false);

  const robotsQuery = useQuery({
    queryKey: ['manual-drive-robots', session?.id],
    queryFn: ({ signal }) => listRobots({}, signal),
    enabled: Boolean(session?.id && canDrivePermission && appActive),
    refetchInterval: appActive ? 2_000 : false,
    retry: false,
  });

  const robots = robotsQuery.data?.items ?? [];
  const selectedRobot: RobotResponse | null = useMemo(() => {
    if (!robots.length) return null;
    const requested = selectedRobotKey
      ? robots.find((r) => r.id === selectedRobotKey || r.code === selectedRobotKey)
      : undefined;
    return (
      requested ??
      robots.find((r) => r.isOnline && r.isEnabled) ??
      robots.find((r) => r.isOnline) ??
      robots[0] ??
      null
    );
  }, [robots, selectedRobotKey]);

  const selectedRobotId = selectedRobot?.id ?? '';

  const leaseQuery = useQuery({
    queryKey: ['manual-lease', session?.id, selectedRobotId],
    queryFn: ({ signal }) => getManualLease(selectedRobotId, signal),
    enabled: Boolean(session?.id && canDrivePermission && selectedRobotId && appActive),
    refetchInterval: appActive ? 5_000 : false,
    retry: false,
  });

  const stopStateQuery = useQuery({
    queryKey: ['manual-stop-state', session?.id, selectedRobotId],
    queryFn: ({ signal }) => getRobotStopState(selectedRobotId, signal),
    enabled: Boolean(session?.id && canDrivePermission && selectedRobotId && appActive),
    refetchInterval: (q) => (isStopStateInFlight(q.state.data?.state) ? 2_000 : 5_000),
    retry: false,
  });

  const lease = leaseQuery.data ?? null;
  const leaseRef = useRef<ManualLeaseResponse | null>(lease);
  leaseRef.current = lease;

  const blockReason = manualDriveBlockReason({
    hasPermission: canDrivePermission,
    teleopEnabled: mobileCapabilities.manualDriveTeleop,
    appActive,
    linkInterrupted,
    robot: selectedRobot,
    lease,
  });

  const canDriveRef = useRef(false);
  canDriveRef.current = blockReason === null;

  const sendTeleopRef = useRef<(linear: number, angular: number, signal: AbortSignal) => Promise<unknown>>(
    async () => {
      throw new Error('Robot not selected.');
    },
  );
  sendTeleopRef.current = (linear, angular, signal) => {
    if (!selectedRobotId) {
      return Promise.reject(new Error('Robot not selected.'));
    }
    return teleopRobot(selectedRobotId, linear, angular, assist, signal);
  };

  const controllerRef = useRef<ReturnType<typeof createTeleopController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createTeleopController({
      send: (linear, angular, signal) => sendTeleopRef.current(linear, angular, signal),
      canDrive: () => canDriveRef.current,
      onMovingChange: (moving) => setIsMoving(moving),
      onError: (failure) => {
        setTargetVelocity({ linear: 0, angular: 0 });
        const status =
          failure && typeof failure === 'object' && 'status' in failure
            ? (failure as { status?: unknown }).status
            : null;
        if (status === 0) {
          setLinkInterrupted(true);
          setLeaseDesired(false);
        } else if (status === 401 || status === 403 || status === 409) {
          setLeaseDesired(false);
          void leaseQuery.refetch();
        }
        setTeleopError(getUserErrorMessage(failure, 'Manual drive command failed.'));
      },
    });
  }

  const leaseDesiredRef = useRef(leaseDesired);
  leaseDesiredRef.current = leaseDesired;
  const robotIdRef = useRef(selectedRobotId);
  robotIdRef.current = selectedRobotId;

  useEffect(() => {
    controllerRef.current?.syncCanDrive();
    if (!canDriveRef.current) {
      setTargetVelocity({ linear: 0, angular: 0 });
    }
  }, [blockReason]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const nextActive = state === 'active';
      setAppActive(nextActive);
      if (!nextActive) {
        controllerRef.current?.interrupt();
        setTargetVelocity({ linear: 0, angular: 0 });
        setInterruptedNotice(true);
        if (leaseDesiredRef.current && robotIdRef.current) {
          setLeaseDesired(false);
          void releaseManualLease(robotIdRef.current).catch(() => {});
        }
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    return onAccessTokenChange(() => {
      controllerRef.current?.interrupt({ skipZeroSend: true });
      setTargetVelocity({ linear: 0, angular: 0 });
      setLeaseDesired(false);
    });
  }, []);

  const wasConnectedRef = useRef(isConnected);
  useEffect(() => {
    if (wasConnectedRef.current && !isConnected && (leaseDesiredRef.current || controllerRef.current?.isMoving)) {
      controllerRef.current?.interrupt({ skipZeroSend: true });
      setTargetVelocity({ linear: 0, angular: 0 });
      setLeaseDesired(false);
      setLinkInterrupted(true);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    if (!canDrivePermission || !selectedRobotId || !leaseDesired || !appActive) {
      return;
    }
    let cancelled = false;
    const syncLease = async () => {
      try {
        const granted = await acquireManualLease(selectedRobotId);
        if (cancelled) return;
        client.setQueryData(['manual-lease', session?.id, selectedRobotId], granted);
        setLeaseError(null);
        setLinkInterrupted(false);
        setInterruptedNotice(false);
      } catch (failure) {
        if (cancelled) return;
        controllerRef.current?.interrupt({ skipZeroSend: true });
        setTargetVelocity({ linear: 0, angular: 0 });
        setLeaseDesired(false);
        setLeaseError(getUserErrorMessage(failure, 'Could not switch manual lease state. Refresh and try again.'));
        void leaseQuery.refetch();
      }
    };
    void syncLease();
    const timer = setInterval(() => {
      void syncLease();
    }, MANUAL_LEASE_RENEW_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [canDrivePermission, selectedRobotId, leaseDesired, appActive, client, session?.id]);

  useEffect(() => {
    return () => {
      const activeRobot = robotIdRef.current;
      const hadLease = leaseDesiredRef.current || leaseRef.current?.heldByMe;
      controllerRef.current?.dispose();
      if (hadLease && activeRobot) {
        void releaseManualLease(activeRobot).catch(() => {});
      }
    };
  }, []);

  const handleSelectRobot = (nextRobot: RobotResponse) => {
    if (nextRobot.id === selectedRobotId) return;
    triggerHaptic('tap');
    controllerRef.current?.interrupt();
    setTargetVelocity({ linear: 0, angular: 0 });
    setTeleopError(null);
    setLeaseError(null);
    setStopNotice(null);
    setStopError(null);
    setLinkInterrupted(false);
    setInterruptedNotice(false);
    if (leaseDesiredRef.current && selectedRobotId) {
      setLeaseDesired(false);
      void releaseManualLease(selectedRobotId).catch(() => {});
    }
    setSelectedRobotKey(nextRobot.id);
  };

  const handleExit = () => {
    triggerHaptic('tap');
    controllerRef.current?.interrupt();
    setTargetVelocity({ linear: 0, angular: 0 });
    if ((leaseDesiredRef.current || lease?.heldByMe) && selectedRobotId) {
      setLeaseDesired(false);
      void releaseManualLease(selectedRobotId).catch(() => {});
    }
    goBack();
  };

  const handleToggleLease = async () => {
    if (!selectedRobotId || leaseBusy) return;
    triggerHaptic('tap');
    setLeaseBusy(true);
    setLeaseError(null);
    setTeleopError(null);
    try {
      if (leaseDesired || lease?.heldByMe) {
        controllerRef.current?.interrupt();
        setTargetVelocity({ linear: 0, angular: 0 });
        setLeaseDesired(false);
        await releaseManualLease(selectedRobotId);
        await leaseQuery.refetch();
      } else {
        setLinkInterrupted(false);
        setInterruptedNotice(false);
        const granted = await acquireManualLease(selectedRobotId);
        client.setQueryData(['manual-lease', session?.id, selectedRobotId], granted);
        setLeaseDesired(true);
      }
    } catch (failure) {
      setLeaseDesired(false);
      setLeaseError(getUserErrorMessage(failure, 'Could not switch manual lease state. Refresh and try again.'));
      void leaseQuery.refetch();
    } finally {
      setLeaseBusy(false);
    }
  };

  const handleTakeover = async (reason: string) => {
    if (!selectedRobotId) return;
    setLeaseError(null);
    setLinkInterrupted(false);
    setInterruptedNotice(false);
    const granted = await acquireManualLease(selectedRobotId, { takeover: true, reason });
    client.setQueryData(['manual-lease', session?.id, selectedRobotId], granted);
    setLeaseDesired(true);
    setTakeoverOpen(false);
  };

  const handleStopRobot = async () => {
    if (!selectedRobotId || stopBusy || !canStop) return;
    triggerHaptic('warning');
    controllerRef.current?.interrupt();
    setTargetVelocity({ linear: 0, angular: 0 });
    setStopBusy(true);
    setStopError(null);
    try {
      const stopState = await stopRobot(selectedRobotId, 'STOP', 'Operator manual stop');
      client.setQueryData(['manual-stop-state', session?.id, selectedRobotId], stopState);
      setStopNotice(t('Stop command requested. Verify stop state below before walking near the robot.'));
      void robotsQuery.refetch();
    } catch (failure) {
      setStopError(
        getUserErrorMessage(failure, 'Stop command failed. Refresh stop state and use the physical E-stop if needed.'),
      );
      void stopStateQuery.refetch();
    } finally {
      setStopBusy(false);
    }
  };

  const handleResumeMotion = async () => {
    if (!selectedRobotId || stopBusy || !canResumeMotion) return;
    triggerHaptic('tap');
    setStopBusy(true);
    setStopError(null);
    try {
      const stopState = await resumeRobotMotion(selectedRobotId);
      client.setQueryData(['manual-stop-state', session?.id, selectedRobotId], stopState);
      setStopNotice(t('Robot motion resume command requested.'));
      void robotsQuery.refetch();
    } catch (failure) {
      setStopError(getUserErrorMessage(failure, 'Could not resume robot motion.'));
      void stopStateQuery.refetch();
    } finally {
      setStopBusy(false);
    }
  };

  const handleBeginGesture = useCallback(() => {
    setTeleopError(null);
    setInterruptedNotice(false);
    return controllerRef.current?.beginGesture() ?? false;
  }, []);

  const handleVelocityChange = useCallback((linear: number, angular: number) => {
    if (!canDriveRef.current || controllerRef.current?.isInterrupted) {
      setTargetVelocity({ linear: 0, angular: 0 });
      return;
    }
    setTargetVelocity({ linear, angular });
    controllerRef.current?.updateGesture(linear, angular);
  }, []);

  const handleEndGesture = useCallback(() => {
    setTargetVelocity({ linear: 0, angular: 0 });
    controllerRef.current?.endGesture();
  }, []);

  if (!canDrivePermission) {
    return (
      <View style={styles.screen}>
        <SubScreenHeader title="Manual Drive" label="Technician Control" onBack={goBack} />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={ShieldAlert}
            tone="warning"
            title="Manual Drive Unavailable"
            message="Manual drive requires robot.manual.drive permission. Staff accounts cannot drive robots manually."
            actionTitle="Go Back"
            onAction={goBack}
          />
        </View>
      </View>
    );
  }

  const live = selectedRobot ? robotTelemetry[selectedRobot.code] : undefined;
  const speed = typeof live?.linearVelocity === 'number'
    ? live.linearVelocity
    : typeof selectedRobot?.linearVelocity === 'number'
      ? selectedRobot.linearVelocity
      : null;
  const battery = typeof live?.batteryPercent === 'number'
    ? live.batteryPercent
    : selectedRobot?.batteryPercent ?? null;
  const stopState = stopStateQuery.data;
  const stopMeta = stopStatePresentation(stopState?.state);

  return (
    <View style={styles.screen}>
      <SubScreenHeader
        title="Manual Drive"
        label={selectedRobot?.code || 'Technician Control'}
        onBack={handleExit}
        rightAction={
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              void robotsQuery.refetch();
              if (selectedRobotId) {
                void leaseQuery.refetch();
                void stopStateQuery.refetch();
              }
            }}
            style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t('Refresh')}
          >
            <RefreshCw size={18} color={colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: dockReservedSpace(dockHeight) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Robot Selector */}
        {robots.length === 0 ? (
          <Card padding="md" gap={8}>
            <Text variant="headline">{robotsQuery.isPending ? t('Loading…') : t('No Robots')}</Text>
            <Text variant="body" color="textSecondary">
              {robotsQuery.isError
                ? getUserErrorMessage(robotsQuery.error, 'No online robots are available in this warehouse.')
                : t('No online robots are available in this warehouse.')}
            </Text>
          </Card>
        ) : (
          <View style={styles.robotRow}>
            {robots.map((robot) => {
              const selected = robot.id === selectedRobot?.id;
              return (
                <Pressable
                  key={robot.id}
                  onPress={() => handleSelectRobot(robot)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.robotChip,
                    selected && styles.robotChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    variant="label"
                    color={selected ? 'primaryText' : 'textPrimary'}
                    style={styles.monoText}
                  >
                    {robot.code}
                  </Text>
                  <Text variant="caption" color={robot.isOnline ? 'successText' : 'textMuted'}>
                    {robot.isOnline ? t('Online') : t('Offline')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedRobot ? (
          <>
            {/* Live Telemetry Strip */}
            <Card padding="md" gap={10}>
              <View style={styles.rowBetween}>
                <Text variant="headline" style={styles.monoText}>
                  {selectedRobot.code}
                </Text>
                <StatusPill status={selectedRobot.status} label={robotStatusLabel(selectedRobot.status)} size="sm" dot />
              </View>
              <View style={styles.telemetryStrip}>
                <View style={styles.telemetryCell}>
                  <Text variant="caption" color="textSecondary">Battery</Text>
                  <Text variant="bodyMedium">{formatBattery(battery)}</Text>
                </View>
                <View style={styles.telemetryDivider} />
                <View style={styles.telemetryCell}>
                  <Text variant="caption" color="textSecondary">Speed</Text>
                  <Text variant="bodyMedium" style={styles.monoText}>
                    {speed !== null ? `${Math.abs(speed).toFixed(2)} m/s` : '—'}
                  </Text>
                </View>
                <View style={styles.telemetryDivider} />
                <View style={styles.telemetryCell}>
                  <Text variant="caption" color="textSecondary">Connection</Text>
                  <Text variant="bodyMedium" color={selectedRobot.isOnline ? 'successText' : 'dangerText'}>
                    {selectedRobot.isOnline ? t('Online') : t('Offline')}
                  </Text>
                </View>
              </View>
            </Card>

            {/* Lease Control */}
            <Card padding="md" gap={10}>
              <View style={styles.rowBetween}>
                <View style={styles.iconRow}>
                  {lease?.heldByMe ? (
                    <Lock size={16} color={colors.successText} />
                  ) : (
                    <Unlock size={16} color={colors.textSecondary} />
                  )}
                  <Text variant="headline">Manual Lease</Text>
                </View>
                <StatusPill
                  status={lease?.heldByMe ? 'ACTIVE' : lease?.active ? 'PAUSED' : 'IDLE'}
                  label={
                    lease?.heldByMe
                      ? t('Held by You')
                      : lease?.active
                        ? t('Held by {name}', { name: lease.holderName || t('Another Operator') })
                        : t('No Active Lease')
                  }
                  tone={lease?.heldByMe ? 'success' : lease?.active ? 'warning' : 'neutral'}
                  size="sm"
                  dot
                />
              </View>

              {lease?.active && lease.until ? (
                <Text variant="caption" color="textSecondary">
                  {t('Lease expires at {time}', { time: formatClock(lease.until) })}
                </Text>
              ) : null}

              {leaseError ? (
                <Text variant="caption" color="dangerText">
                  {leaseError}
                </Text>
              ) : null}

              <View style={styles.leaseBtnRow}>
                <Button
                  title={leaseDesired || lease?.heldByMe ? 'Release Lease' : 'Take Lease'}
                  variant={leaseDesired || lease?.heldByMe ? 'outline' : 'primary'}
                  size="md"
                  loading={leaseBusy}
                  disabled={
                    leaseBusy ||
                    (!leaseDesired &&
                      !lease?.heldByMe &&
                      (!mobileCapabilities.manualDriveTeleop || !selectedRobot.isOnline || !selectedRobot.isEnabled))
                  }
                  onPress={() => { void handleToggleLease(); }}
                  style={styles.flexBtn}
                />
                {lease?.active && !lease.heldByMe && canTakeOver ? (
                  <Button
                    title="Admin Takeover"
                    variant="secondary"
                    size="md"
                    disabled={leaseBusy || !mobileCapabilities.manualDriveTeleop}
                    onPress={() => setTakeoverOpen(true)}
                    style={styles.flexBtn}
                  />
                ) : null}
              </View>

              <Text variant="caption" color="textSecondary">
                Lease released on exit. Note: releasing a manual lease never resumes a paused Job.
              </Text>
            </Card>

            {/* Joystick & Assist Card */}
            <Card padding="md" gap={14}>
              <View style={styles.assistRow}>
                <View style={styles.flexText}>
                  <Text variant="bodyMedium" fontWeight="600">Drive Assist</Text>
                  <Text variant="caption" color="textSecondary">
                    Stops before obstacles detected in the direction of travel.
                  </Text>
                </View>
                <Switch
                  value={assist}
                  onValueChange={(next) => {
                    triggerHaptic('tap');
                    setAssist(next);
                  }}
                  accessibilityLabel={t('Drive Assist')}
                />
              </View>

              <View style={styles.speedSection}>
                <Text variant="label" color="textSecondary">Max Speed</Text>
                <SegmentedControl
                  options={SPEED_OPTIONS}
                  value={String(maxLinear)}
                  onChange={(value) => {
                    triggerHaptic('tap');
                    setMaxLinear(Number(value));
                  }}
                  size="sm"
                  accessibilityLabel="Max Speed"
                />
              </View>

              {(blockReason || interruptedNotice || teleopError) ? (
                <View style={styles.noticeWarn}>
                  <Text variant="caption" color={teleopError ? 'dangerText' : 'warningText'}>
                    {teleopError
                      ? teleopError
                      : interruptedNotice && blockReason === null
                        ? t('Control paused while app was inactive. Touch joystick again to resume.')
                        : t(blockReason || '')}
                  </Text>
                </View>
              ) : null}

              <ManualJoystickPad
                disabled={blockReason !== null}
                maxLinear={maxLinear}
                onBeginGesture={handleBeginGesture}
                onVelocityChange={handleVelocityChange}
                onEndGesture={handleEndGesture}
              />

              <Text
                variant="caption"
                color={isMoving ? 'primaryText' : 'textSecondary'}
                textAlign="center"
                style={styles.monoText}
              >
                {t('Target: {linear} m/s · {angular} rad/s', {
                  linear: targetVelocity.linear.toFixed(2),
                  angular: targetVelocity.angular.toFixed(2),
                })}
              </Text>
            </Card>

            {/* Dedicated STOP & Stop-State Verification Card */}
            <Card padding="md" gap={12}>
              <View style={styles.rowBetween}>
                <Text variant="headline">Robot Stop State</Text>
                {stopState ? (
                  <StatusPill
                    status={stopState.state}
                    label={t(stopMeta.label)}
                    tone={stopMeta.tone}
                    size="sm"
                    dot
                  />
                ) : null}
              </View>

              {canStop ? (
                <Button
                  title="STOP ROBOT"
                  variant="danger"
                  size="lg"
                  loading={stopBusy}
                  disabled={stopBusy || !selectedRobot.isOnline}
                  fullWidth
                  onPress={() => { void handleStopRobot(); }}
                />
              ) : null}

              {stopNotice ? (
                <Text variant="caption" color="warningText">
                  {stopNotice}
                </Text>
              ) : null}

              {stopError ? (
                <Text variant="caption" color="dangerText">
                  {stopError}
                </Text>
              ) : null}

              {stopState?.motionHeld && canResumeMotion ? (
                <Button
                  title="Resume Motion"
                  variant="outline"
                  size="md"
                  loading={stopBusy}
                  disabled={stopBusy}
                  fullWidth
                  onPress={() => { void handleResumeMotion(); }}
                />
              ) : null}

              <View style={styles.safetyFootnote}>
                <Info size={15} color={colors.infoText} style={styles.safetyIcon} />
                <Text variant="caption" color="infoText" style={styles.flexText}>
                  Teleop setpoints use best-effort delivery without motor ACKs, and physical robot checks (Semantic Mode authority/mux and iPhone deadman test) are still required.
                </Text>
              </View>
            </Card>
          </>
        ) : null}
      </ScrollView>

      {takeoverOpen ? (
        <ReasonSheet
          title="Take Over Manual Lease"
          message="Enter a reason to take over the manual-drive lease from the current operator."
          confirmTitle="Admin Takeover"
          required
          danger
          onClose={() => setTakeoverOpen(false)}
          onSubmit={handleTakeover}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    emptyWrap: {
      flex: 1,
      justifyContent: 'center',
      padding: 20,
    },
    refreshBtn: {
      width: 44,
      height: 44,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.72,
    },
    scroll: {
      flex: 1,
    },
    content: {
      padding: 16,
      gap: 14,
    },
    robotRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    robotChip: {
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      gap: 2,
    },
    robotChipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryLight,
    },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    iconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '700',
    },
    telemetryStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSubtle,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    telemetryCell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    telemetryDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    leaseBtnRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    flexBtn: {
      flexGrow: 1,
      minWidth: 130,
    },
    assistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    flexText: {
      flex: 1,
      minWidth: 0,
    },
    speedSection: {
      gap: 6,
    },
    noticeWarn: {
      padding: 10,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.warningBorder,
      backgroundColor: colors.warningBg,
    },
    safetyFootnote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.infoBorder,
      backgroundColor: colors.infoBg,
    },
    safetyIcon: {
      marginTop: 2,
      flexShrink: 0,
    },
  });
