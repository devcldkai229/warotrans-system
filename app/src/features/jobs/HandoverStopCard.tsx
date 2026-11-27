import { AlertTriangle, Bot, Check, ChevronRight, Lock, Route, ScanLine } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  beginHandoverStop, claimHandoverStop, confirmHandoverStop, extendHandoverStop,
  getHandoverStopAction, getUserErrorMessage, isHandoverStopActionAllowed, releaseHandoverStop,
} from '../../shared/api';
import { t } from '../../shared/i18n';
import { useLanguage } from '../../shared/i18n/LanguageContext';
import { Scanner, type ScanFeedback } from '../../shared/scan/Scanner';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type { HandoverStopResponse, JobDetailResponse } from '../../shared/types/contracts';
import { BarcodeScanField, Button, Card, StatusPill, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  handoverStopOwnerState, handoverStopPhase, recordStopScan, stopScanProgress,
} from './handoverData';
import { formatDeadlineCountdown, formatJobClockTime, type JobContainerItem } from './jobData';

export interface HandoverStopJobMeta {
  workflowName?: string;
  routeLabel?: string;
  robotCode?: string;
  productSummary?: string;
  otherContainers?: JobContainerItem[];
}

interface HandoverStopCardProps {
  stop: HandoverStopResponse;
  placeName: string;
  jobMeta?: HandoverStopJobMeta;
  accountId?: string | null;
  canOperate: boolean;
  showJobLink?: boolean;
  onOpenJob?: () => void;
  onUpdated: (updated: HandoverStopResponse) => void;
  onConfirmedJob?: (job: JobDetailResponse) => void;
  onReportContainerProblem?: (category: 'WRONG_CONTAINER' | 'MISSING_CONTAINER', containerId?: string) => void;
  onRefresh: () => Promise<unknown>;
}

export function HandoverStopCard({
  stop,
  placeName,
  jobMeta,
  accountId,
  canOperate,
  showJobLink = false,
  onOpenJob,
  onUpdated,
  onConfirmedJob,
  onReportContainerProblem,
  onRefresh,
}: HandoverStopCardProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const { language } = useLanguage();
  const [busy, setBusy] = useState<'claim' | 'begin' | 'release' | 'extend' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedByContainerId, setScannedByContainerId] = useState<Record<string, string>>({});
  const scansRef = useRef<Record<string, string>>({});
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showOtherContainers, setShowOtherContainers] = useState(false);

  const hasDeadline = Boolean(stop.beginDeadline || stop.workDeadline);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasDeadline) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [hasDeadline, stop.beginDeadline, stop.workDeadline]);

  useEffect(() => {
    setError(null);
  }, [stop.id, stop.moveId, stop.version]);

  useEffect(() => {
    scansRef.current = {};
    setScannedByContainerId({});
    setManualCode('');
    setScanError(null);
    setScannerOpen(false);
    setShowOtherContainers(false);
  }, [stop.id, stop.moveId]);

  const owner = handoverStopOwnerState(stop, accountId);
  const phase = handoverStopPhase(stop, accountId);
  const claimAction = getHandoverStopAction(stop, 'CLAIM');
  const canClaim = canOperate && isHandoverStopActionAllowed(stop, 'CLAIM');
  const canBegin = canOperate && isHandoverStopActionAllowed(stop, 'BEGIN');
  const canRelease = canOperate && isHandoverStopActionAllowed(stop, 'RELEASE');
  const canExtend = canOperate && isHandoverStopActionAllowed(stop, 'EXTEND');
  const confirmAction = getHandoverStopAction(stop, 'CONFIRM');
  const canConfirm = canOperate && isHandoverStopActionAllowed(stop, 'CONFIRM');
  const beginAction = getHandoverStopAction(stop, 'BEGIN');
  const waitingForArrival = owner === 'mine' && !stop.beganAt && beginAction?.reason === 'handover_robot_not_ready';
  const blockedByZonePriority = owner === 'free' && !canClaim && claimAction?.reason === 'handover_work_zone_priority';
  const progress = stopScanProgress(stop, scannedByContainerId);
  const isScanningPhase = owner === 'mine' && Boolean(stop.beganAt) && canOperate;

  const runAction = async (
    kind: 'claim' | 'begin' | 'release' | 'extend',
    action: () => Promise<HandoverStopResponse>,
  ) => {
    if (busy) return;
    triggerHaptic('tap');
    setBusy(kind);
    setError(null);
    try {
      const updated = await action();
      if (kind === 'claim' || kind === 'begin') triggerHaptic('success');
      onUpdated(updated);
    } catch (failure) {
      setError(getUserErrorMessage(failure, 'The handover action failed. Refresh and try again.'));
      void onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const applyScan = (rawCode: string): ScanFeedback => {
    const trimmed = rawCode.trim();
    const { matchedContainerId, duplicate, nextScans } = recordStopScan(stop, scansRef.current, trimmed);
    if (!matchedContainerId) {
      const msg = t('Code "{code}" is not in this handover stop.', { code: trimmed || '—' });
      setScanError(msg);
      return { ok: false, message: msg };
    }
    scansRef.current = nextScans;
    setScannedByContainerId(nextScans);
    setManualCode('');
    setScanError(null);
    const nextProgress = stopScanProgress(stop, nextScans);
    if (nextProgress.complete) {
      setScannerOpen(false);
    }
    const label = nextScans[matchedContainerId];
    triggerHaptic('success');
    return {
      ok: true,
      message: duplicate
        ? t('Already scanned: {code}', { code: label })
        : t('Verified: {code}', { code: label }),
    };
  };

  const handleConfirmAll = async () => {
    if (busy || !canConfirm || !progress.complete) return;
    triggerHaptic('tap');
    setBusy('confirm');
    setError(null);
    try {
      const updatedJob = await confirmHandoverStop(
        stop.jobId,
        stop.id,
        stop.moveId,
        stop.version,
        progress.payload,
      );
      triggerHaptic('success');
      scansRef.current = {};
      setScannedByContainerId({});
      onConfirmedJob?.(updatedJob);
      void onRefresh();
    } catch (failure) {
      setError(getUserErrorMessage(failure, 'The handover confirmation failed. Refresh and try again.'));
      void onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const turnLabel =
    stop.action === 'PICKUP'
      ? 'Pickup Turn'
      : stop.action === 'DROPOFF'
        ? 'Drop-off Turn'
        : stop.action;

  const ownerLabel =
    owner === 'mine'
      ? 'Claimed by You'
      : owner === 'other'
        ? t('Claimed by {name}', { name: stop.claimedByName || t('Another Operator') })
        : 'Unclaimed';

  const containersList = stop.containers
    .map(item => item.barcode || item.containerId)
    .join(', ');

  const workCountdown = formatDeadlineCountdown(stop.workDeadline, nowMs, language);
  const workClock = formatJobClockTime(stop.workDeadline);
  const beginCountdown = formatDeadlineCountdown(stop.beginDeadline, nowMs, language);
  const beginClock = formatJobClockTime(stop.beginDeadline);
  const startedClock = formatJobClockTime(stop.beganAt);
  const otherContainers = jobMeta?.otherContainers ?? [];

  const titleBlock = (
    <View style={styles.titleBlock}>
      <View style={styles.titleMainRow}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="headline" numberOfLines={2}>
            {showJobLink ? `${stop.jobNo} · ${placeName}` : placeName}
          </Text>
          {jobMeta?.routeLabel || jobMeta?.robotCode ? (
            <View style={styles.jobMetaInline}>
              {jobMeta.routeLabel ? (
                <View style={styles.jobMetaPiece}>
                  <Route size={13} color={colors.textMuted} style={{ flexShrink: 0 }} />
                  <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {jobMeta.routeLabel}
                  </Text>
                </View>
              ) : null}
              {jobMeta.robotCode ? (
                <View style={styles.jobMetaPiece}>
                  <Bot size={13} color={colors.textMuted} style={{ flexShrink: 0 }} />
                  <Text variant="code" color="textSecondary">{jobMeta.robotCode}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        {showJobLink && onOpenJob ? (
          <ChevronRight size={18} color={colors.textMuted} style={{ flexShrink: 0 }} />
        ) : null}
      </View>
    </View>
  );

  return (
    <Card
      padding="md"
      gap={10}
      style={phase === 'claimed_ready' || phase === 'in_progress' ? styles.mineCard : undefined}
    >
      <View style={styles.headerRow}>
        <Text variant="label" color="textPrimary">
          {turnLabel}
        </Text>
        <StatusPill
          status={stop.robotReadyAt ? 'READY' : 'EN_ROUTE'}
          label={stop.robotReadyAt ? t('Robot Ready at Stop') : t('En Route · Pre-arrival Offer')}
          tone={stop.robotReadyAt ? 'success' : 'info'}
          size="sm"
          dot
        />
      </View>

      {showJobLink && onOpenJob ? (
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            onOpenJob();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${t('Open Job')} · ${stop.jobNo}`}
          style={({ pressed }) => [pressed && { opacity: 0.72 }]}
        >
          {titleBlock}
        </Pressable>
      ) : titleBlock}

      {!isScanningPhase ? (
        <View style={styles.metaBox}>
          <Text variant="caption" color="textSecondary">
            {t('Containers ({count})', { count: stop.containers.length })}
          </Text>
          <Text variant="body" color="textPrimary" style={styles.monoText}>
            {containersList || '—'}
          </Text>
          {jobMeta?.productSummary ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {jobMeta.productSummary}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statusGroup}>
        <Text
          variant="body"
          color={owner === 'mine' ? 'primaryText' : owner === 'other' ? 'warningText' : 'textSecondary'}
          fontWeight={owner === 'mine' ? '700' : '500'}
        >
          {ownerLabel}
        </Text>

        {stop.beganAt ? (
          <>
            <Text variant="caption" color="successText" style={styles.tabularNums}>
              {t('Handover Started: {time} · Ownership locked until completion', {
                time: startedClock ?? '—',
              })}
            </Text>
            {stop.workDeadline ? (
              <View style={styles.deadlineRow}>
                <Text
                  variant="caption"
                  color={workCountdown?.urgent ? 'dangerText' : 'warningText'}
                  fontWeight={workCountdown?.urgent ? '600' : '500'}
                  style={[styles.deadlineText, styles.tabularNums]}
                >
                  {t('Work Deadline: {time}', {
                    time: workCountdown
                      ? `${workCountdown.text}${workClock ? ` · ${workClock}` : ''}`
                      : (workClock ?? '—'),
                  })}
                </Text>
                {canExtend ? (
                  <Pressable
                    onPress={() => {
                      void runAction('extend', () =>
                        extendHandoverStop(stop.jobId, stop.id, stop.moveId, stop.version),
                      );
                    }}
                    disabled={!!busy}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Extend Time')}
                    style={({ pressed }) => [
                      styles.extendChip,
                      pressed && styles.extendChipPressed,
                      !!busy && styles.extendChipDisabled,
                    ]}
                  >
                    <Text variant="caption" color="primaryText" fontWeight="600">
                      {busy === 'extend' ? t('Extending…') : t('Extend')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </>
        ) : stop.beginDeadline ? (
          <Text
            variant="caption"
            color={beginCountdown?.urgent ? 'dangerText' : 'warningText'}
            fontWeight={beginCountdown?.urgent ? '600' : '500'}
            style={styles.tabularNums}
          >
            {t('Begin Deadline: {time}', {
              time: beginCountdown
                ? `${beginCountdown.text}${beginClock ? ` · ${beginClock}` : ''}`
                : (beginClock ?? '—'),
            })}
          </Text>
        ) : owner === 'mine' && !stop.robotReadyAt ? (
          <Text variant="caption" color="textSecondary">
            Pre-arrival claim: begin window starts once robot arrives.
          </Text>
        ) : null}

        {blockedByZonePriority ? (
          <Text variant="caption" color="warningText">
            {stop.warehouseOpensAt
              ? t('Reserved for work zone until {time}', { time: formatJobClockTime(stop.warehouseOpensAt) ?? '—' })
              : t('Reserved for Staff in this work zone')}
          </Text>
        ) : null}

        {waitingForArrival ? (
          <Text variant="caption" color="textSecondary">
            Wait until the robot reaches this stop to begin handover.
          </Text>
        ) : null}
      </View>

      {isScanningPhase ? (
        <View style={styles.confirmSection}>
          {confirmAction?.reason === 'handover_issue_blocking' ? (
            <View style={styles.blockingNotice}>
              <Text variant="caption" color="dangerText">
                Confirm All is blocked by an open wrong or missing container issue. Verify and resolve that issue before confirming.
              </Text>
            </View>
          ) : null}

          {stop.containers.map((item) => {
            const label = item.barcode || item.containerId;
            const isScanned = Boolean(scannedByContainerId[item.containerId]);
            return (
              <View key={item.containerId} style={styles.manifestRow}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="body" color="textPrimary" style={styles.monoText}>
                    {label}
                  </Text>
                  {stop.containers.length === 1 && jobMeta?.productSummary ? (
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {jobMeta.productSummary}
                    </Text>
                  ) : null}
                </View>
                <StatusPill
                  status={isScanned ? 'CONFIRMED' : 'WAITING'}
                  label={isScanned ? t('Scanned') : t('Scan Required')}
                  tone={isScanned ? 'success' : 'neutral'}
                  size="sm"
                  dot
                />
              </View>
            );
          })}

          <BarcodeScanField
            value={manualCode}
            onChangeText={(text) => {
              setManualCode(text);
              if (scanError) setScanError(null);
            }}
            onSubmit={() => {
              triggerHaptic('tap');
              applyScan(manualCode);
            }}
            onOpenScanner={() => {
              triggerHaptic('tap');
              setScannerOpen(true);
            }}
            error={scanError}
            disabled={!!busy}
          />

          {scanError && onReportContainerProblem ? (
            <Button
              title="Report Wrong Container"
              variant="outline"
              size="sm"
              disabled={!!busy}
              onPress={() =>
                onReportContainerProblem('WRONG_CONTAINER', progress.missingIds[0] || stop.containers[0]?.containerId)
              }
            />
          ) : null}

          {progress.complete ? (
            <Button
              title={t('Confirm Handover ({done}/{total})', { done: progress.scanned, total: progress.total })}
              variant="primary"
              size="md"
              fullWidth
              icon={Check}
              loading={busy === 'confirm'}
              disabled={!!busy || !canConfirm}
              onPress={() => {
                void handleConfirmAll();
              }}
            />
          ) : (
            <Button
              title={t('Scan Container ({done}/{total})', { done: progress.scanned, total: progress.total })}
              variant="primary"
              size="md"
              fullWidth
              icon={ScanLine}
              disabled={!!busy}
              onPress={() => {
                triggerHaptic('tap');
                setScannerOpen(true);
              }}
            />
          )}

          {onReportContainerProblem && !scanError && progress.missingIds.length > 0 ? (
            <Pressable
              onPress={() => onReportContainerProblem('MISSING_CONTAINER', progress.missingIds[0])}
              disabled={!!busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.missingLink, pressed && { opacity: 0.7 }]}
            >
              <AlertTriangle size={14} color={colors.dangerText} />
              <Text variant="caption" color="dangerText" fontWeight="600">
                Report Missing Container
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {otherContainers.length > 0 ? (
        <View style={styles.otherSection}>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setShowOtherContainers((prev) => !prev);
            }}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityState={{ expanded: showOtherContainers }}
            style={styles.otherHeader}
          >
            <View style={styles.otherHeaderLeft}>
              <Lock size={13} color={colors.textMuted} />
              <Text variant="caption" color="textSecondary" fontWeight="600">
                {otherContainers.length === 1
                  ? t('1 other container remaining onboard')
                  : t('{count} other containers remaining onboard', { count: otherContainers.length })}
              </Text>
            </View>
            <Text variant="caption" color="primaryText" fontWeight="600">
              {showOtherContainers ? t('Hide') : t('Show')}
            </Text>
          </Pressable>
          {showOtherContainers ? (
            <View style={styles.otherList}>
              {otherContainers.map((item) => (
                <View key={item.code} style={styles.otherRow}>
                  <Text variant="code" color="textPrimary" style={{ flex: 1 }}>{item.code}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {item.product !== 'Unknown Product' ? item.product : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text variant="caption" color="dangerText">
          {error}
        </Text>
      ) : null}

      {(canClaim || canBegin || canRelease) ? (
        <View style={styles.actionsRow}>
          {canClaim ? (
            <Button
              title="Claim Turn"
              variant="primary"
              size="sm"
              loading={busy === 'claim'}
              disabled={!!busy}
              onPress={() => {
                void runAction('claim', () =>
                  claimHandoverStop(stop.jobId, stop.id, stop.moveId, stop.version),
                );
              }}
              style={styles.actionBtn}
            />
          ) : null}

          {canBegin ? (
            <Button
              title="Begin Handover"
              variant="primary"
              size="sm"
              loading={busy === 'begin'}
              disabled={!!busy}
              onPress={() => {
                void runAction('begin', () =>
                  beginHandoverStop(stop.jobId, stop.id, stop.moveId, stop.version),
                );
              }}
              style={styles.actionBtn}
            />
          ) : null}

          {canRelease ? (
            <Button
              title="Release Turn"
              variant="outline"
              size="sm"
              loading={busy === 'release'}
              disabled={!!busy}
              onPress={() => {
                void runAction('release', () =>
                  releaseHandoverStop(stop.jobId, stop.id, stop.moveId, stop.version),
                );
              }}
              style={styles.actionBtn}
            />
          ) : null}
        </View>
      ) : null}

      <Scanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        expect={['CONTAINER']}
        continuous={!progress.complete}
        title="Scan Handover Containers"
        manualLabel="Container Barcode"
        onScanResult={(barcode) => applyScan(barcode)}
      />
    </Card>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    mineCard: {
      borderColor: colors.primaryBorder,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    titleBlock: {
      gap: 4,
    },
    titleMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    jobMetaInline: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
    },
    jobMetaPiece: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 1,
      minWidth: 0,
    },
    metaBox: {
      gap: 3,
      padding: 10,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceSubtle,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '600',
    },
    tabularNums: {
      fontVariant: ['tabular-nums'],
    },
    statusGroup: {
      gap: 4,
    },
    deadlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 2,
    },
    deadlineText: {
      flex: 1,
      minWidth: 0,
    },
    extendChip: {
      minHeight: 32,
      paddingHorizontal: 10,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.primaryBorder,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    extendChipPressed: {
      opacity: 0.78,
    },
    extendChipDisabled: {
      opacity: 0.5,
    },
    confirmSection: {
      gap: 10,
      paddingTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    blockingNotice: {
      padding: 10,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerBg,
    },
    manifestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 2,
    },
    missingLink: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    otherSection: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingTop: 8,
      gap: 6,
    },
    otherHeader: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    otherHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      minWidth: 0,
    },
    otherList: {
      backgroundColor: colors.surfaceSubtle,
      borderRadius: radii.sm,
      padding: 8,
      gap: 6,
    },
    otherRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    actionBtn: {
      flexGrow: 1,
      minWidth: 120,
    },
  });
