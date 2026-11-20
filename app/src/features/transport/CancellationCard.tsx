import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ScanLine } from 'lucide-react-native';
import {
  deliverCancelledCargo, getCancellation, getUserErrorMessage, handOverCancelledCargo, listStorageLocations,
  type CancellationItem,
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
  CANCELLATION_STAGE_TEXT, CANCELLATION_STATUS_TEXT, cancellationTone, cargoStillOnRobot, isCancellationActive, matchScannedContainer,
} from './cancellationData';

interface CancellationCardProps {
  requestId: string;
  requestStatus: string;
  warehouseId: string;
  onChanged: () => void;
}

/**
 * TRN-03 Cancellation Progress: which robot stopped, what is still on a robot, what needs a person. A stopped robot's
 * cargo is delivered anyway, or unloaded here: choose the shelf, then scan each container as it comes off.
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
  const [delivering, setDelivering] = useState<string | null>(null);
  const cancellation = query.data;
  if (!cancellation) return null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    onChanged();
  };
  const deliver = async (item: CancellationItem) => {
    setDelivering(item.jobId);
    try {
      await deliverCancelledCargo(requestId, item.jobId);
      toast.success(t('{robot} is delivering the cargo on board.', { robot: item.robotCode ?? item.jobNo }));
      refresh();
    } catch (failure) {
      toast.error(getUserErrorMessage(failure, 'The cargo could not be sent on.'));
    } finally {
      setDelivering(null);
    }
  };

  return (
    <Card gap={12}>
      <View style={styles.heading}>
        <Text variant="headline" style={styles.flex}>{cancellation.scope === 'DETAILS' ? 'Containers Cancelled' : 'Cancellation'}</Text>
        <StatusPill status={cancellation.status} label={t(CANCELLATION_STATUS_TEXT[cancellation.status])} tone={cancellationTone(cancellation.status)} dot />
      </View>
      <Text variant="caption">
        {t('{delivered} delivered · {handedOver} unloaded by scan · {notPickedUp} never picked up · {onRobot} still on a robot', {
          delivered: cancellation.delivered, handedOver: cancellation.handedOver, notPickedUp: cancellation.notPickedUp, onRobot: cancellation.onRobot,
        })}
      </Text>
      {cancellation.reason ? <Text variant="caption">{cancellation.reason}</Text> : null}
      {cancellation.lastError ? <Text variant="body" color={colors.dangerText}>{cancellation.lastError}</Text> : null}
      {cancellation.items.map(item => (
        <View key={item.jobId} style={styles.item}>
          <View style={styles.heading}>
            <Text variant="bodyMedium" style={styles.flex}>{item.robotCode ?? item.jobNo}</Text>
            <StatusPill status={item.stage} label={t(CANCELLATION_STAGE_TEXT[item.stage])} size="sm"
              tone={item.stage === 'DONE' ? 'success' : item.stage === 'MANUAL' || item.stage === 'WAITING_ROBOT' ? 'danger' : 'warning'} />
          </View>
          {item.containers.map(container => (
            <View key={container.containerId} style={styles.containerRow}>
              <Text variant="code" style={styles.flex}>{container.barcode ?? container.containerId.slice(0, 8)}</Text>
              <StatusPill status={container.resolution ?? container.jobContainerStatus} size="sm" />
            </View>
          ))}
          {item.canHandOver ? (
            <Button title={t('Unload By Scan ({count})', { count: cargoStillOnRobot(item).length })} onPress={() => setUnloading(item)} fullWidth
              icon={ScanLine} />
          ) : null}
          {item.canDeliver ? (
            <Button title="Deliver Anyway" variant="outline" onPress={() => { void deliver(item); }} loading={delivering === item.jobId} fullWidth />
          ) : null}
        </View>
      ))}
      {unloading ? (
        <UnloadByScanSheet
          requestId={requestId}
          warehouseId={warehouseId}
          item={cancellation.items.find(item => item.jobId === unloading.jobId) ?? unloading}
          onDone={() => { setUnloading(null); refresh(); }}
          onScanned={refresh}
        />
      ) : null}
    </Card>
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
  item: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  containerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shelves: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shelf: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  shelfOn: { borderColor: colors.primary, backgroundColor: colors.infoBg },
});
