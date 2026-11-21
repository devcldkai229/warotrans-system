import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Hand, MapPin, ScanLine, Truck } from 'lucide-react-native';
import {
  deliverCancelledCargo, getCancellation, getRecoveryPoints, getUserErrorMessage, handOverCancelledCargo, listStorageLocations,
  requestManualCargoHandover, sendCancelledCargoToRecovery,
  type CancellationAction, type CancellationItem,
} from '../../shared/api';
import { toast } from '../../shared/context/ToastContext';
import { t } from '../../shared/i18n';
import { Scanner, type ScanFeedback } from '../../shared/scan/Scanner';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, Card, StatusPill, Text, TextField } from '../../shared/ui';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import {
  BLOCKED_ACTION_TEXT, CANCELLATION_STAGE_TEXT, CANCELLATION_STATUS_TEXT, cancellationTone, cargoStillOnRobot, isCancellationActive,
  matchScannedContainer, openActions, robotNextStep,
} from './cancellationData';

interface CancellationCardProps {
  requestId: string;
  requestStatus: string;
  warehouseId: string;
  onChanged: () => void;
}

/**
 * TRN-03 Cancellation Progress, one block per robot: where it is, where the destination policy sends it, and the next
 * steps the server leaves open (continue delivery, send to a recovery point, ask for a manual handover, unload by scan).
 */
export function CancellationCard({ requestId, requestStatus, warehouseId, onChanged }: CancellationCardProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const queryClient = useQueryClient();
  const key = ['transport-request-cancellation', requestId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getCancellation(requestId),
    enabled: ['CANCELLING', 'CANCELLED', 'PARTIALLY_COMPLETED'].includes(requestStatus),
    refetchInterval: q => isCancellationActive(q.state.data) ? 3_000 : false,
  });
  const [unloading, setUnloading] = useState<CancellationItem | null>(null);
  const [choosingPoint, setChoosingPoint] = useState<CancellationItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cancellation = query.data;
  if (!cancellation) return null;
  const active = cancellation.status !== 'FINALIZED';

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    onChanged();
  };
  const run = async (id: string, action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(id);
    try {
      await action();
      toast.success(success);
      refresh();
    } catch (failure) {
      toast.error(getUserErrorMessage(failure, fallback));
    } finally {
      setBusy(null);
    }
  };
  const robotName = (item: CancellationItem) => item.robotCode ?? item.jobNo;

  return (
    <Card gap={12}>
      <View style={styles.heading}>
        <Text variant="headline" style={styles.flex}>{cancellation.scope === 'DETAILS' ? 'Containers Cancelled' : 'Cancellation'}</Text>
        <StatusPill status={cancellation.status} label={t(CANCELLATION_STATUS_TEXT[cancellation.status])} tone={cancellationTone(cancellation.status)} dot />
      </View>
      <View style={styles.tiles}>
        <Tile label="Delivered" value={cancellation.delivered} color={colors.successText} />
        <Tile label="Unloaded" value={cancellation.handedOver} color={colors.textSecondary} />
        <Tile label="Not Picked Up" value={cancellation.notPickedUp} color={colors.textSecondary} />
        <Tile label="On A Robot" value={cancellation.onRobot} color={cancellation.onRobot > 0 ? colors.warningText : colors.textSecondary} />
      </View>
      {cancellation.reason ? <Text variant="caption">{cancellation.reason}</Text> : null}
      {cancellation.lastError ? <Text variant="body" color={colors.dangerText}>{cancellation.lastError}</Text> : null}
      {cancellation.items.map(item => {
        const step = robotNextStep(item);
        const actions = openActions(item);
        const blocked = item.blockedActions ?? {};
        const onboard = cargoStillOnRobot(item).length;
        const shows = (action: CancellationAction) => active && onboard > 0 && (actions.has(action) || !!blocked[action]);
        const reasons = Array.from(new Set(Object.values(blocked).filter((why): why is string => !!why && why !== 'already_requested')));
        return (
          <View key={item.jobId} style={[styles.item, step.warn && styles.itemWarn]}>
            <View style={styles.heading}>
              <Text variant="bodyMedium" style={styles.flex}>{robotName(item)}</Text>
              <StatusPill status={item.stage} label={t(CANCELLATION_STAGE_TEXT[item.stage])} size="sm"
                tone={item.stage === 'DONE' ? 'success'
                  : item.stage === 'MANUAL' || item.stage === 'WAITING_ROBOT' || item.stage === 'SAFE_STOP' ? 'danger'
                    : item.stage === 'DELIVERING' || item.stage === 'TO_RECOVERY' ? 'info' : 'warning'} />
            </View>
            <View style={styles.where}>
              <MapPin size={14} color={step.warn ? colors.dangerText : colors.textMuted} />
              <View style={styles.flex}>
                <Text variant="body">{t(step.where, step.params)}</Text>
                {step.next ? (
                  <Text variant="caption" color={step.warn ? colors.dangerText : undefined}>
                    {t('Next: {step}', { step: t(step.next, step.params) })}
                  </Text>
                ) : null}
              </View>
            </View>
            {item.containers.map(container => (
              <View key={container.containerId} style={styles.containerRow}>
                <Text variant="code" style={styles.flex}>{container.barcode ?? container.containerId.slice(0, 8)}</Text>
                <StatusPill status={container.resolution ?? container.jobContainerStatus} size="sm" />
              </View>
            ))}
            {active && onboard > 0 && actions.has('UNLOAD_BY_SCAN') ? (
              <Button title={t('Unload By Scan ({count})', { count: onboard })} onPress={() => setUnloading(item)} fullWidth icon={ScanLine} />
            ) : null}
            {shows('CONTINUE_DELIVERY') ? (
              <Button
                title={item.phase === 'AT_DROPOFF' ? 'Confirm At The Drop-Off' : 'Continue Delivery'}
                variant="secondary" icon={Truck} fullWidth
                disabled={!actions.has('CONTINUE_DELIVERY')}
                loading={busy === `${item.jobId}:deliver`}
                onPress={() => { void run(`${item.jobId}:deliver`, () => deliverCancelledCargo(requestId, item.jobId),
                  t('{robot} is delivering the cargo on board.', { robot: robotName(item) }), 'The cargo could not be sent on.'); }}
              />
            ) : null}
            {shows('SEND_TO_RECOVERY') ? (
              <Button title="Send To Recovery Point" variant="outline" icon={MapPin} fullWidth
                disabled={!actions.has('SEND_TO_RECOVERY')} onPress={() => setChoosingPoint(item)} />
            ) : null}
            {shows('REQUEST_MANUAL_HANDOVER') ? (
              <Button title="Request Manual Handover" variant="ghost" icon={Hand} fullWidth
                disabled={!actions.has('REQUEST_MANUAL_HANDOVER')}
                loading={busy === `${item.jobId}:handover`}
                onPress={() => { void run(`${item.jobId}:handover`, () => requestManualCargoHandover(requestId, item.jobId),
                  t('A person was asked to unload {robot}.', { robot: robotName(item) }), 'The handover could not be requested.'); }}
              />
            ) : null}
            {active && onboard > 0 ? reasons.map(why => (
              <Text key={why} variant="caption">{t(BLOCKED_ACTION_TEXT[why] ?? why)}</Text>
            )) : null}
            {item.handoverRequestedAt && active && onboard > 0 ? (
              <Text variant="caption">{t('A person was asked to unload this robot.')}</Text>
            ) : null}
          </View>
        );
      })}
      {unloading ? (
        <UnloadByScanSheet
          requestId={requestId}
          warehouseId={warehouseId}
          item={cancellation.items.find(item => item.jobId === unloading.jobId) ?? unloading}
          onDone={() => { setUnloading(null); refresh(); }}
          onScanned={refresh}
        />
      ) : null}
      {choosingPoint ? (
        <RecoveryPointSheet
          requestId={requestId}
          item={choosingPoint}
          onClose={() => setChoosingPoint(null)}
          onSent={code => {
            setChoosingPoint(null);
            toast.success(t('{robot} takes its cargo to {code}.', { robot: robotName(choosingPoint), code }));
            refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.tile}>
      <Text variant="headline" color={color}>{String(value)}</Text>
      <Text variant="caption" numberOfLines={1}>{t(label)}</Text>
    </View>
  );
}

/** Pick the wait / queue point the robot takes its cargo to (the nearest free one is chosen first). */
function RecoveryPointSheet({ requestId, item, onClose, onSent }: {
  requestId: string; item: CancellationItem; onClose: () => void; onSent: (code: string) => void;
}) {
  const { styles, colors } = useThemedStyles(createStyles);
  const points = useQuery({
    queryKey: ['transport-request-cancellation', requestId, item.jobId, 'recovery-points'],
    queryFn: () => getRecoveryPoints(requestId, item.jobId),
  });
  const [chosen, setChosen] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = points.data ?? [];
  const selected = chosen ?? list.find(point => point.free)?.endpointId ?? null;

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await sendCancelledCargoToRecovery(requestId, item.jobId, selected);
      onSent(list.find(point => point.endpointId === selected)?.code ?? '');
    } catch (failure) {
      toast.error(getUserErrorMessage(failure, 'The robot could not be sent to the recovery point.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet onClose={onClose} accessibilityLabel={t('Send To Recovery Point')}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text variant="headline">{t('Send {robot} To A Recovery Point', { robot: item.robotCode ?? item.jobNo })}</Text>
        <Text variant="caption">{t('The robot drives its cargo there through traffic and holds still, so it can be unloaded by scan.')}</Text>
        {points.isPending ? <ActivityIndicator color={colors.primary} /> : null}
        {points.isError ? <Text variant="body" color={colors.dangerText}>{t('Recovery points could not be loaded.')}</Text> : null}
        {!points.isPending && !points.isError && list.length === 0 ? (
          <Text variant="body" color={colors.dangerText}>{t('This map has no wait / queue point.')}</Text>
        ) : null}
        {list.map(point => (
          <Pressable key={point.endpointId} disabled={!point.free} onPress={() => setChosen(point.endpointId)}
            style={[styles.point, point.endpointId === selected && styles.shelfOn, !point.free && styles.pointTaken]}
            accessibilityRole="radio" accessibilityState={{ selected: point.endpointId === selected, disabled: !point.free }}>
            {point.endpointId === selected ? <Check size={16} color={colors.primaryText} /> : <MapPin size={16} color={colors.textMuted} />}
            <View style={styles.flex}>
              <Text variant="bodyMedium">{point.code}</Text>
              <Text variant="caption">{point.name}</Text>
            </View>
            <Text variant="caption">
              {point.free ? (point.distanceMeters != null ? `${point.distanceMeters.toFixed(1)} m` : '') : t('Taken')}
            </Text>
          </Pressable>
        ))}
        <Button title="Send Robot" onPress={() => { void send(); }} loading={sending} disabled={!selected} fullWidth icon={MapPin} />
        <Button title="Cancel" variant="outline" onPress={onClose} fullWidth />
      </ScrollView>
    </BottomSheet>
  );
}

interface UnloadByScanSheetProps {
  requestId: string;
  warehouseId: string;
  item: CancellationItem;
  onScanned: () => void;
  onDone: () => void;
}

/** Choose where the containers go, then scan each one as it comes off the robot. */
function UnloadByScanSheet({ requestId, warehouseId, item, onScanned, onDone }: UnloadByScanSheetProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [shelfId, setShelfId] = useState<string | null>(null);
  const [level, setLevel] = useState('1');
  const [scanning, setScanning] = useState(false);
  const shelves = useQuery({
    queryKey: ['storage-locations', warehouseId, 'active'],
    queryFn: () => listStorageLocations({ warehouseId, activeOnly: true }),
  });
  const levelNo = Number.parseInt(level, 10);
  const shelf = shelves.data?.items.find(location => location.id === shelfId);

  const onScan = async (barcode: string): Promise<ScanFeedback> => {
    const match = matchScannedContainer(item, barcode);
    if (match.kind === 'already') return { ok: true, message: t('{code} was already unloaded.', { code: match.barcode }) };
    if (match.kind === 'not_on_robot') return { ok: false, message: t('{code} is not on this robot.', { code: match.barcode }) };
    try {
      await handOverCancelledCargo(requestId, item.jobId, {
        containerId: match.containerId, scannedBarcode: barcode.trim(), storageLocationId: shelfId!, levelNo,
      });
      onScanned();
      return { ok: true, message: t('{code} unloaded to {shelf} level {level}.', { code: match.barcode, shelf: shelf?.code ?? '', level: levelNo }) };
    } catch (failure) {
      return { ok: false, message: getUserErrorMessage(failure, 'This container could not be unloaded.') };
    }
  };

  return (
    <>
      <BottomSheet onClose={onDone} accessibilityLabel={t('Unload By Scan')}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text variant="headline">{t('Unload {robot}', { robot: item.robotCode ?? item.jobNo })}</Text>
          <Text variant="caption">{t('Take each container off the stopped robot, put it on the shelf you choose, and scan its label.')}</Text>
          <Text variant="label">{t('Shelf')}</Text>
          {shelves.isPending ? <ActivityIndicator color={colors.primary} /> : null}
          {shelves.isError ? <Text variant="body" color={colors.dangerText}>{t('Shelves could not be loaded.')}</Text> : null}
          <View style={styles.shelves}>
            {shelves.data?.items.map(location => (
              <Pressable key={location.id} onPress={() => setShelfId(location.id)}
                style={[styles.shelf, location.id === shelfId && styles.shelfOn]}
                accessibilityRole="radio" accessibilityState={{ selected: location.id === shelfId }}>
                {location.id === shelfId ? <Check size={16} color={colors.primaryText} /> : null}
                <Text variant="bodyMedium">{location.name || location.code}</Text>
              </Pressable>
            ))}
          </View>
          <TextField label="Level" value={level} onChangeText={setLevel} keyboardType="number-pad" maxLength={2} />
          <Button title={t('Scan Containers ({count} On Robot)', { count: cargoStillOnRobot(item).length })}
            onPress={() => setScanning(true)} disabled={!shelfId || !(levelNo >= 1)} fullWidth />
          <Button title="Done" variant="outline" onPress={onDone} fullWidth />
        </ScrollView>
      </BottomSheet>
      <Scanner
        visible={scanning}
        continuous
        expect={['CONTAINER']}
        title="Scan Each Container"
        onClose={() => setScanning(false)}
        onScanResult={barcode => onScan(barcode)}
      />
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  body: { padding: 20, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  item: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  itemWarn: { borderWidth: 1, borderColor: colors.dangerText },
  where: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  containerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shelves: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shelf: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  point: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  pointTaken: { opacity: 0.5 },
  shelfOn: { borderColor: colors.primary, backgroundColor: colors.infoBg },
});
