import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  beginHandoverStop, claimHandoverStop, getHandoverStopAction, getUserErrorMessage,
  isHandoverStopActionAllowed, releaseHandoverStop,
} from '../../shared/api';
import { t } from '../../shared/i18n';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import type { HandoverStopResponse } from '../../shared/types/contracts';
import { Button, Card, StatusPill, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { handoverStopOwnerState, handoverStopPhase } from './handoverData';

interface HandoverStopCardProps {
  stop: HandoverStopResponse;
  placeName: string;
  accountId?: string | null;
  canOperate: boolean;
  showJobLink?: boolean;
  onOpenJob?: () => void;
  onUpdated: (updated: HandoverStopResponse) => void;
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
  onRefresh,
}: HandoverStopCardProps) {
  const styles = useThemedStyles(createStyles);
  const [busy, setBusy] = useState<'claim' | 'begin' | 'release' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [stop.id, stop.moveId, stop.version]);

  const owner = handoverStopOwnerState(stop, accountId);
  const phase = handoverStopPhase(stop, accountId);
  const canClaim = canOperate && isHandoverStopActionAllowed(stop, 'CLAIM');
  const canBegin = canOperate && isHandoverStopActionAllowed(stop, 'BEGIN');
  const canRelease = canOperate && isHandoverStopActionAllowed(stop, 'RELEASE');
  const beginAction = getHandoverStopAction(stop, 'BEGIN');
  const waitingForArrival = owner === 'mine' && !stop.beganAt && beginAction?.reason === 'handover_robot_not_ready';

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
