import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  beginHandoverStop, claimHandoverStop, confirmHandoverStop, getHandoverStopAction,
  getUserErrorMessage, isHandoverStopActionAllowed, releaseHandoverStop,
} from '../../shared/api';
import { t } from '../../shared/i18n';
import { Scanner, type ScanFeedback } from '../../shared/scan/Scanner';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type { HandoverStopResponse, JobDetailResponse } from '../../shared/types/contracts';
import { Button, Card, StatusPill, Text, TextField } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  handoverStopOwnerState, handoverStopPhase, recordStopScan, stopScanProgress,
} from './handoverData';

interface HandoverStopCardProps {
  stop: HandoverStopResponse;
  placeName: string;
  accountId?: string | null;
  canOperate: boolean;
  showJobLink?: boolean;
  onOpenJob?: () => void;
  onUpdated: (updated: HandoverStopResponse) => void;
  onConfirmedJob?: (job: JobDetailResponse) => void;
  onReportContainerProblem?: (category: 'WRONG_CONTAINER' | 'MISSING_CONTAINER', containerId?: string) => void;
  onRefresh: () => Promise<unknown>;
}

const formatClock = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

export function HandoverStopCard({
  stop,
  placeName,
  accountId,
  canOperate,
  showJobLink = false,
  onOpenJob,
  onUpdated,
  onConfirmedJob,
  onReportContainerProblem,
  onRefresh,
}: HandoverStopCardProps) {
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState<'claim' | 'begin' | 'release' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedByContainerId, setScannedByContainerId] = useState<Record<string, string>>({});
  const scansRef = useRef<Record<string, string>>({});
  const [manualCode, setManualCode] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    setError(null);
  }, [stop.id, stop.moveId, stop.version]);

  useEffect(() => {
    scansRef.current = {};
    setScannedByContainerId({});
    setManualCode('');
    setScanError(null);
    setScannerOpen(false);
  }, [stop.id, stop.moveId]);

  const owner = handoverStopOwnerState(stop, accountId);
  const phase = handoverStopPhase(stop, accountId);
  const canClaim = canOperate && isHandoverStopActionAllowed(stop, 'CLAIM');
  const canBegin = canOperate && isHandoverStopActionAllowed(stop, 'BEGIN');
  const canRelease = canOperate && isHandoverStopActionAllowed(stop, 'RELEASE');
  const confirmAction = getHandoverStopAction(stop, 'CONFIRM');
  const canConfirm = canOperate && isHandoverStopActionAllowed(stop, 'CONFIRM');
  const beginAction = getHandoverStopAction(stop, 'BEGIN');
  const waitingForArrival = owner === 'mine' && !stop.beganAt && beginAction?.reason === 'handover_robot_not_ready';
  const progress = stopScanProgress(stop, scannedByContainerId);

  const runAction = async (
    kind: 'claim' | 'begin' | 'release',
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

      <Text variant="headline" numberOfLines={2}>
        {showJobLink ? `${stop.jobNo} · ${placeName}` : placeName}
      </Text>

      <View style={styles.metaBox}>
        <Text variant="caption" color="textSecondary">
          {t('Containers ({count})', { count: stop.containers.length })}
        </Text>
        <Text variant="body" color="textPrimary" style={styles.monoText}>
          {containersList || '—'}
        </Text>
      </View>

      <View style={styles.statusGroup}>
        <Text
          variant="body"
          color={owner === 'mine' ? 'primaryText' : owner === 'other' ? 'warningText' : 'textSecondary'}
          fontWeight={owner === 'mine' ? '700' : '500'}
        >
          {ownerLabel}
        </Text>

        {stop.beganAt ? (
          <Text variant="caption" color="successText">
            {t('Handover Started: {time} · Ownership locked until completion', {
              time: formatClock(stop.beganAt),
            })}
          </Text>
        ) : stop.beginDeadline ? (
          <Text variant="caption" color="warningText">
            {t('Begin Deadline: {time}', { time: formatClock(stop.beginDeadline) })}
          </Text>
        ) : owner === 'mine' && !stop.robotReadyAt ? (
          <Text variant="caption" color="textSecondary">
            Pre-arrival claim: begin window starts once robot arrives.
          </Text>
        ) : null}

        {waitingForArrival ? (
          <Text variant="caption" color="textSecondary">
            Wait until the robot reaches this stop to begin handover.
          </Text>
        ) : null}
      </View>

      {owner === 'mine' && stop.beganAt && canOperate ? (
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
                <Text variant="body" color="textPrimary" style={styles.monoText}>
                  {label}
                </Text>
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

          <View style={styles.scanRow}>
            <View style={styles.scanInputWrap}>
              <TextField
                value={manualCode}
                onChangeText={setManualCode}
                placeholder={t('Scan or type container barcode')}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy}
                accessibilityLabel={t('Container Barcode')}
              />
            </View>
            <Button
              title="Verify"
              variant="outline"
              size="sm"
              disabled={!!busy || !manualCode.trim()}
              onPress={() => {
                triggerHaptic('tap');
                applyScan(manualCode);
              }}
            />
          </View>

          {scanError ? (
            <View style={styles.scanErrorGroup}>
              <Text variant="caption" color="dangerText">{scanError}</Text>
              {onReportContainerProblem ? (
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
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <Button
              title={scannerOpen ? 'Scanning…' : 'Scan Container'}
              variant="outline"
              size="sm"
              disabled={!!busy}
              onPress={() => {
                triggerHaptic('tap');
                setScannerOpen(true);
              }}
              style={styles.actionBtn}
            />
            <Button
              title={t('Confirm All ({done}/{total})', { done: progress.scanned, total: progress.total })}
              variant="primary"
              size="sm"
              loading={busy === 'confirm'}
              disabled={!!busy || !canConfirm || !progress.complete}
              onPress={() => {
                void handleConfirmAll();
              }}
              style={styles.actionBtn}
            />
          </View>

          {onReportContainerProblem && !scanError && progress.missingIds.length > 0 ? (
            <Button
              title="Report Missing Container"
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onPress={() => onReportContainerProblem('MISSING_CONTAINER', progress.missingIds[0])}
            />
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text variant="caption" color="dangerText">
          {error}
        </Text>
      ) : null}

      {(canClaim || canBegin || canRelease || (showJobLink && onOpenJob)) ? (
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

          {showJobLink && onOpenJob ? (
            <Button
              title="Open Job"
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onPress={() => {
                triggerHaptic('tap');
                onOpenJob();
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
    metaBox: {
      gap: 2,
      padding: 10,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceSubtle,
    },
    monoText: {
      fontFamily: typography.fontMono,
      fontWeight: '600',
    },
    statusGroup: {
      gap: 4,
    },
    confirmSection: {
      gap: 8,
      paddingTop: 6,
      borderTopWidth: 1,
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
      paddingVertical: 4,
    },
    scanRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    scanInputWrap: {
      flex: 1,
      minWidth: 0,
    },
    scanErrorGroup: {
      gap: 6,
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
