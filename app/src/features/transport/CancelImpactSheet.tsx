import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, Square } from 'lucide-react-native';
import { cancelTransportRequest, getCancelPreview, getUserErrorMessage } from '../../shared/api';
import { t } from '../../shared/i18n';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, StatusPill, Text, TextField } from '../../shared/ui';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { newIdempotencyKey } from './cancellationData';

interface CancelImpactSheetProps {
  requestId: string;
  requestCode: string;
  onClose: () => void;
  onCancelled: () => void;
}

/**
 * TRN-03 Cancel Impact Preview on the phone: delivered stays delivered, cargo on a robot is stopped and then delivered or
 * unloaded by scan. Optionally only some containers not picked up yet. The server checks everything again on confirm.
 */
export function CancelImpactSheet({ requestId, requestCode, onClose, onCancelled }: CancelImpactSheetProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const [reasonCode, setReasonCode] = useState('OPERATOR_REQUESTED');
  const [reason, setReason] = useState('');
  const [onlySome, setOnlySome] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({ queryKey: ['cancel-preview', requestId], queryFn: () => getCancelPreview(requestId) });
  const data = preview.data;
  const cancellable = data?.details.filter(detail => detail.canCancelAlone) ?? [];
  const canSubmit = !!data?.canCancel && reason.trim().length > 0 && (!onlySome || chosen.length > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      await cancelTransportRequest(requestId, reason.trim(), { reasonCode, idempotencyKey, detailIds: onlySome ? chosen : undefined });
      onCancelled();
    } catch (failure) {
      setError(getUserErrorMessage(failure, 'The request could not be cancelled.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet onClose={busy ? () => {} : onClose} accessibilityLabel={t('Cancel {code}', { code: requestCode })}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text variant="headline">{t('Cancel {code}', { code: requestCode })}</Text>
        {preview.isPending ? <ActivityIndicator color={colors.primary} /> : null}
        {preview.isError ? <Text variant="body" color={colors.dangerText}>{t('The preview could not be loaded.')}</Text> : null}
        {data ? (
          <>
            <View style={styles.tiles}>
              <Tile value={data.totalContainers} label="Containers" styles={styles} />
              <Tile value={data.delivered} label="Delivered" styles={styles} />
              <Tile value={data.onRobot} label="On A Robot" styles={styles} warn={data.onRobot > 0} />
              <Tile value={data.notPickedUp} label="Not Picked Up" styles={styles} />
            </View>
            {data.jobs.map(job => (
              <View key={job.jobId} style={styles.jobRow}>
                <Text variant="bodyMedium">{job.robotCode ?? t('No Robot Yet')}</Text>
                <Text variant="caption">
                  {job.onRobot > 0
                    ? t('Carrying {onRobot} of {total}', { onRobot: job.onRobot, total: job.total })
                    : t('Delivered {delivered} of {total}', { delivered: job.delivered, total: job.total })}
                  {job.robotCode && !job.robotOnline ? ` · ${t('Offline')}` : ''}
                </Text>
              </View>
            ))}
            <Text variant="caption">{t('Containers already delivered stay delivered; nothing is undone.')}</Text>
            {data.onRobot > 0 ? (
              <Text variant="caption" color={colors.warningText}>
                {t('Robots carrying cargo are told to stop. Then deliver the cargo anyway or unload each container by scanning it.')}
              </Text>
            ) : null}
            <Text variant="caption">{t('This is not an emergency stop. If a robot is unsafe, use its physical E-stop.')}</Text>
            {!data.canCancel ? (
              <Text variant="body" color={colors.dangerText}>{t('This request cannot be cancelled now.')}</Text>
            ) : null}

            {cancellable.length > 0 && data.details.length > 1 ? (
              <Pressable style={styles.toggle} onPress={() => setOnlySome(!onlySome)} accessibilityRole="checkbox" accessibilityState={{ checked: onlySome }}>
                {onlySome ? <Check size={18} color={colors.primaryText} /> : <Square size={18} color={colors.textMuted} />}
                <Text variant="body">{t('Cancel Only Some Containers (Not Picked Up Yet)')}</Text>
              </Pressable>
            ) : null}
            {onlySome ? data.details.map(detail => {
              const on = chosen.includes(detail.detailId);
              return (
                <Pressable
                  key={detail.detailId}
                  disabled={!detail.canCancelAlone}
                  style={[styles.toggle, !detail.canCancelAlone && styles.disabled]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !detail.canCancelAlone }}
                  onPress={() => setChosen(current => on ? current.filter(id => id !== detail.detailId) : [...current, detail.detailId])}
                >
                  {on ? <Check size={18} color={colors.primaryText} /> : <Square size={18} color={colors.textMuted} />}
                  <Text variant="code">{detail.containerBarcode ?? detail.containerId.slice(0, 8)}</Text>
                  <StatusPill status={detail.jobContainerStatus ?? detail.detailStatus} size="sm" />
                </Pressable>
              );
            }) : null}

            <Text variant="label">{t('Reason')}</Text>
            <View style={styles.chips}>
              {data.reasonCodes.map(code => (
                <Pressable key={code} onPress={() => setReasonCode(code)} style={[styles.chip, code === reasonCode && styles.chipOn]}
                  accessibilityRole="radio" accessibilityState={{ selected: code === reasonCode }}>
                  <StatusPill status={code} size="sm" tone={code === reasonCode ? 'info' : 'neutral'} />
                </Pressable>
              ))}
            </View>
            <TextField label="Explain" value={reason} onChangeText={setReason} placeholder="e.g. the customer cancelled the order"
              multiline maxLength={500} editable={!busy} />
          </>
        ) : null}
        {error ? <Text variant="body" color={colors.dangerText}>{error}</Text> : null}
        <Button
          title={onlySome ? t('Cancel {count} Container(s)', { count: chosen.length }) : 'Cancel The Request'}
          variant="danger" onPress={submit} loading={busy} disabled={!canSubmit} fullWidth
        />
        <Button title="Keep The Request" variant="outline" onPress={onClose} disabled={busy} fullWidth />
      </ScrollView>
    </BottomSheet>
  );
}

function Tile({ value, label, styles, warn = false }: { value: number; label: string; styles: ReturnType<typeof createStyles>; warn?: boolean }) {
  return (
    <View style={[styles.tile, warn && styles.tileWarn]}>
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  body: { padding: 20, gap: 12 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  tileWarn: { backgroundColor: colors.warningBg },
  jobRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  disabled: { opacity: 0.45 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center' },
  chipOn: {},
});
