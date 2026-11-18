import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  claimJobStep, confirmHandover, confirmHandoverBatch, getUserErrorMessage, releaseJobStep, takeOverJobStep,
  type HandoverBatchResult,
} from '../../shared/api';
import { HoldToConfirmButton } from '../../shared/components/HoldToConfirmButton';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import type { JobDetailResponse, JobStepResponse } from '../../shared/types/contracts';
import { Button, Card, ReasonSheet, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { batchHandoverCandidates, claimState } from './handoverData';

const BATCH_OUTCOME_TEXT: Record<string, string> = {
  confirmed: 'Confirmed',
  already_confirmed: 'Already confirmed',
  mismatch: 'Not this stop or not this container',
  not_reached: 'Robot not there yet',
  refused: 'Refused, nothing changed',
};

interface HandoverActionsCardProps {
  jobId: string;
  step: JobStepResponse;
  tasks: { contextValues?: { containerId?: string } | null; steps: JobStepResponse[] }[];
  /** Expected container of the waiting step (UUID) and its barcode for display. */
  containerId?: string;
  containerCode: string;
  containerLabel: (containerId: string) => string;
  accountId?: string | null;
  canOperate: boolean;
  canTakeOver: boolean;
  onUpdated: (job: JobDetailResponse) => void;
}

/**
 * Web parity for a waiting PICKUP_CONFIRM / DROPOFF_CONFIRM (JobDetailPage StepRow + HandoverBatchPanel): take / give back /
 * take over the step, confirm the expected container without scanning, and confirm every handover of this stop at once.
 * The server enforces the claim, the order and the container identity; these buttons only call it.
 */
export function HandoverActionsCard({
  jobId, step, tasks, containerId, containerCode, containerLabel, accountId, canOperate, canTakeOver, onUpdated,
}: HandoverActionsCardProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [takeover, setTakeover] = useState(false);
  const [results, setResults] = useState<HandoverBatchResult[] | null>(null);
  const claim = claimState(step, accountId);
  const batch = batchHandoverCandidates(tasks);
  const clock = (value?: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

  const run = async (key: string, action: () => Promise<JobDetailResponse>) => {
    if (busy) return;
    setBusy(key); setError(null);
    try { onUpdated(await action()); if (key === 'confirm') triggerHaptic('success'); }
    catch (failure) { setError(getUserErrorMessage(failure, 'The action failed. Refresh the job and try again.')); }
    finally { setBusy(null); }
  };
  const confirmAll = async () => {
    if (busy || !batch.type) return;
    setBusy('batch'); setError(null);
    try {
      const response = await confirmHandoverBatch(jobId, batch.type, batch.items.map(item => item.containerId), 'Confirmed from the app (batch)');
      setResults(response.results);
      onUpdated(response.job);
    } catch (failure) { setError(getUserErrorMessage(failure, 'The batch confirmation failed.')); }
    finally { setBusy(null); }
  };

  if (!canOperate) return null;
  return (
    <Card padding="md" gap={10}>
      <Text variant="label">Who Handles This</Text>
      <Text variant="body" color={colors.textSecondary}>
        {claim === 'mine' ? `You are handling this until ${clock(step.claimExpiresAt)}.`
          : claim === 'other' ? `${step.claimedByName || 'Someone else'} is handling this until ${clock(step.claimExpiresAt)}.`
            : 'Nobody is handling this yet.'}
        {step.deadlineAt ? ` Deadline ${clock(step.deadlineAt)}.` : ''}
      </Text>
      <View style={styles.row}>
        {claim === 'free' ? <Button title="Take This" variant="outline" size="md" onPress={() => run('claim', () => claimJobStep(step.id))}
          loading={busy === 'claim'} disabled={!!busy} style={styles.half} /> : null}
        {claim === 'mine' ? <Button title="Give Back" variant="outline" size="md" onPress={() => run('release', () => releaseJobStep(step.id))}
          loading={busy === 'release'} disabled={!!busy} style={styles.half} /> : null}
        {claim === 'other' && canTakeOver ? <Button title="Take Over" variant="outline" size="md" onPress={() => setTakeover(true)}
          disabled={!!busy} style={styles.half} /> : null}
      </View>

      {containerId ? (
        <View style={styles.confirmBox}>
          <Text variant="caption" color={colors.textSecondary}>Confirm without scanning (the container is checked by the server)</Text>
          <HoldToConfirmButton
            label={busy === 'confirm' ? 'Confirming…' : `Hold To Confirm ${containerCode}`}
            confirmingLabel="Confirming…"
            disabled={!!busy || claim === 'other'}
            onConfirm={() => { void run('confirm', () => confirmHandover({ jobStepId: step.id, containerId, note: `Confirmed from the app (${containerCode})` })); }}
          />
        </View>
      ) : null}

      {batch.items.length >= 2 ? (
        <Button title={`Confirm All ${batch.type === 'PICKUP' ? 'Pickups' : 'Drop-offs'} Here (${batch.items.length})`} variant="primary" size="md"
          onPress={confirmAll} loading={busy === 'batch'} disabled={!!busy} fullWidth />
      ) : null}
      {results ? results.map(item => (
        <Text key={item.containerId} variant="caption"
          color={item.outcome === 'confirmed' || item.outcome === 'already_confirmed' ? colors.textSecondary : colors.dangerText}>
          {containerLabel(item.containerId)}: {BATCH_OUTCOME_TEXT[item.outcome] || item.outcome}{item.code ? ` (${item.code})` : ''}
        </Text>
      )) : null}
      {error ? <Text variant="body" color={colors.dangerText}>{error}</Text> : null}

      {takeover ? <ReasonSheet title="Take Over This Handover" required confirmTitle="Take Over"
        message={`${step.claimedByName || 'Someone else'} holds it now. Your reason is recorded.`}
        onClose={() => setTakeover(false)}
        onSubmit={async reason => { onUpdated(await takeOverJobStep(step.id, reason)); setTakeover(false); }} /> : null}
    </Card>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  half: { flexGrow: 1, minWidth: 140 },
  confirmBox: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
});
