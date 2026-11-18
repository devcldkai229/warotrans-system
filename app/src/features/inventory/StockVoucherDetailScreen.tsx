import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, FileText, MapPin } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { mobileCapabilities } from '../../shared/api/capabilities';
import { addStockVoucherLines, confirmStockVoucher, createContainerBatch, getStockVoucher } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, Text } from '../../shared/ui';
import { buildContainerBatchBody, createBatchRequestId, inboundBatchProblem } from './inboundBatch';
import { preparationDeviceStore } from './preparationDeviceStore';
import { canAllocateInboundBatch, canCreateVoucher, canReadVouchers, uncertainDraftWrite, voucherDate } from './stockVoucherData';
import { useVoucherPreparation } from './useVoucherPreparation';
import { createVoucherStyles } from './voucherStyles';
import { VoucherDraftWorkspace } from './VoucherDraftWorkspace';

export function StockVoucherDetailScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { session } = useAuth();
  const { params, goBack } = useNavigation();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const voucherId = typeof params?.voucherId === 'string' ? params.voucherId : '';
  const allowed = canReadVouchers(session);
  const query = useQuery({
    queryKey: ['stock-voucher', session?.id, voucherId], queryFn: ({ signal }) => getStockVoucher(voucherId, signal),
    enabled: allowed && !!voucherId, staleTime: 0, refetchInterval: 15_000, retry: false,
  });
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const data = allowed && !denied && query.data?.id === voucherId ? query.data : undefined;
  const inbound = data?.type === 'INBOUND';
  const prep = useVoucherPreparation(session?.id || '', data?.warehouseId || '', voucherId, data?.type || 'INBOUND');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(() => typeof params?.batchError === 'string' ? params.batchError : null);
  const alive = useRef(true);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, [session?.id, voucherId]);
  useEffect(() => { setActionError(typeof params?.batchError === 'string' ? params.batchError : null); }, [voucherId, params?.batchError]);

  const hasServerBatchLines = !!data && inbound && data.lines.length > 0 && data.lines.every(line => line.contentsQuantity != null && !!line.contentsUnit);
  const selectedIds = Object.keys(prep.value.selected);

  const allocateBatch = async () => {
    if (pending.current || acting || !data || !inbound || data.status !== 'DRAFT' || data.lines.length > 0
      || !prep.ready || !prep.value.groups?.length || !canAllocateInboundBatch(session) || !mobileCapabilities.createContainer
      || !!inboundBatchProblem(prep.value.requestedCount, prep.value.groups)) {
      return;
    }
    pending.current = true; setActing(true); setActionError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const requestId = prep.value.requestId || createBatchRequestId();
      if (!prep.value.requestId) {
        const updated = { ...prep.value, requestId };
        await preparationDeviceStore.write(prep.scope, updated);
        if (!alive.current || controller.signal.aborted) return;
        prep.reset(updated);
      }
      const batch = await createContainerBatch(
        buildContainerBatchBody(data.warehouseId, requestId, prep.value.requestedCount, prep.value.groups, data.id),
        controller.signal,
      );
      if (!alive.current || controller.signal.aborted) return;
      if (batch.stockVoucher) {
        client.setQueryData(['stock-voucher', session?.id, data.id], batch.stockVoucher);
      } else {
        void query.refetch();
      }
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (uncertainDraftWrite(failure)) void query.refetch();
      setActionError(getUserErrorMessage(failure, 'Could not allocate container barcodes. Try again.'));
    } finally {
      pending.current = false;
      if (alive.current) setActing(false);
    }
  };

  const attachOutboundLines = async () => {
    if (pending.current || acting || !data || inbound || data.status !== 'DRAFT' || data.lines.length > 0
      || !prep.ready || !selectedIds.length || !canCreateVoucher(session)) {
      return;
    }
    pending.current = true; setActing(true); setActionError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const updated = await addStockVoucherLines(data.id, selectedIds, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      client.setQueryData(['stock-voucher', session?.id, data.id], updated);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: ['outbound-voucher-preview'] });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (uncertainDraftWrite(failure)) void query.refetch();
      setActionError(getUserErrorMessage(failure, 'Could not save selected containers to this draft. Try again.'));
    } finally {
      pending.current = false;
      if (alive.current) setActing(false);
    }
  };

  const confirmVoucher = async () => {
    if (pending.current || acting || !data || data.status !== 'DRAFT' || !data.lines.length
      || !canCreateVoucher(session) || !mobileCapabilities.confirmStockVoucher) {
      return;
    }
    pending.current = true; setActing(true); setActionError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const confirmed = await confirmStockVoucher(data.id, data.type, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      client.setQueryData(['stock-voucher', session?.id, data.id], confirmed);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: ['inventory-stock'] });
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      void client.invalidateQueries({ queryKey: ['outbound-voucher-preview'] });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (uncertainDraftWrite(failure)) void query.refetch();
      setActionError(getUserErrorMessage(failure, 'The voucher could not be confirmed. Try again.'));
    } finally {
      pending.current = false;
      if (alive.current) setActing(false);
    }
  };

  return <View style={styles.screen}>
    <ScreenHeader title={data ? inbound ? 'Inbound Voucher' : 'Outbound Voucher' : 'Voucher Details'} subtitle={data?.code} canGoBack onBack={goBack}
      rightAction={data ? <StatusPill status={data.status} /> : undefined} />
    {!allowed || !voucherId ? <EmptyState title={!allowed ? 'Voucher Access Unavailable' : 'No Voucher Selected'} />
      : !data ? query.isPending ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text variant="body">Loading Voucher…</Text></View>
        : <EmptyState icon={FileText} title="Voucher Unavailable" message={getUserErrorMessage(query.error, 'This voucher could not be loaded.')} actionTitle="Retry" onAction={() => { void query.refetch(); }} />
        : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, data.status !== 'DRAFT' && { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.primary} />}>
            {query.isError && <View style={styles.error}><Text variant="caption" color="dangerText">Could not refresh. Showing the last loaded voucher.</Text><Button title="Retry" variant="outline" size="sm" onPress={() => { void query.refetch(); }} /></View>}
            <Card gap={12} style={styles.reviewCard}>
              {(data.containerCount > 0 || data.status !== 'DRAFT') && <View style={styles.batchStatBar}>
                <View style={styles.stat}><Text variant="title" style={styles.tabular}>{data.containerCount}</Text><Text variant="bodyMedium" color="textSecondary">{data.containerCount === 1 ? 'container' : 'containers'}</Text></View>
              </View>}
              <View style={styles.row}>
                <View style={styles.summaryIcon}><MapPin size={18} color={colors.primaryText} /></View>
                <View style={styles.summaryInfo}>
                  <Text variant="bodyMedium" numberOfLines={1}>{data.warehouseName || data.warehouseCode || 'Warehouse not reported'}</Text>
                  <Text variant="caption" color="textSecondary">{t('Created {date}', { date: voucherDate(data.createdAt) })}</Text>
                </View>
              </View>
              {!!data.referenceNo && <View style={styles.flex}><Text variant="caption" color="textSecondary">Reference</Text><Text variant="bodyMedium" selectable>{data.referenceNo}</Text></View>}
              {!!data.note && <Text variant="body" color="textSecondary">{data.note}</Text>}
              {!!data.confirmedAt && <Text variant="caption" color="textSecondary">{t('Confirmed {date}', { date: voucherDate(data.confirmedAt) })}</Text>}
              {data.status === 'CONFIRMED' && <Text variant="caption" color="textSecondary">{data.stockPostedAt ? t('Stock posted {date}', { date: voucherDate(data.stockPostedAt) }) : 'Stock posting status is unavailable.'}</Text>}
              {!!data.cancelledAt && <Text variant="caption" color="textSecondary">{t('Cancelled {date}', { date: voucherDate(data.cancelledAt) })}</Text>}
            </Card>

            {params?.preparationCopyFailed && <View style={styles.error}><Text variant="body" color="dangerText">The server draft was created, but preparation could not be copied. Enter the container count again; do not create another draft.</Text></View>}
            {data.status === 'DRAFT' && <VoucherDraftWorkspace key={`${session?.id}:${data.id}:${data.type}`} data={data} accountId={session?.id || ''} writable={canCreateVoucher(session) && !query.isError && !acting} preparation={prep} />}

            {(data.status !== 'DRAFT' || hasServerBatchLines || !inbound) && !!data.lines.length && <Card gap={8} style={styles.reviewCard}>
              <Text variant="headline">Containers</Text>
              {data.lines.map((line, index) => <View key={line.id} style={[styles.summaryRow, index === 0 && { paddingTop: 4 }, index === data.lines.length - 1 && { borderBottomWidth: 0, paddingBottom: 2 }]}>
                <View style={styles.summaryIcon}><Box size={18} strokeWidth={1.8} color={colors.primaryText} /></View>
                <View style={styles.summaryInfo}>
                  <View style={styles.between}><Text variant="code" selectable style={{ flex: 1 }}>{line.containerBarcode}</Text><StatusPill status={line.containerStatus} /></View>
                  <Text variant="bodyMedium" numberOfLines={1}>{line.productName}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {line.productSku}
                    {line.contentsQuantity != null && line.contentsUnit ? ` · ${line.contentsQuantity} ${line.contentsUnit}` : ''}
                    {` · ${line.currentStorageLocationCode || t('None')}`}
                    {line.currentLevelNo != null ? ` ${t('· Level {level}', { level: line.currentLevelNo })}` : ''}
                  </Text>
                </View>
              </View>)}
            </Card>}
          </ScrollView>
          {data.status === 'DRAFT' && (() => {
            const canAllocateFromPlan = inbound && !data.lines.length && prep.ready && !!prep.value.groups?.length;
            const canAttachOutbound = !inbound && !data.lines.length && prep.ready && selectedIds.length > 0;
            const canConfirmVoucher = !!data.lines.length;
            const allocateProblem = canAllocateFromPlan ? inboundBatchProblem(prep.value.requestedCount, prep.value.groups!) : null;
            return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {actionError && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{actionError}</Text></View>}
              {canAllocateFromPlan ? <>
                <Text variant="caption" color="textSecondary">Allocate server container barcodes for this batch before confirming inbound stock.</Text>
                <Button title="Allocate Container Barcodes" fullWidth loading={acting}
                  disabled={!canAllocateInboundBatch(session) || !mobileCapabilities.createContainer || acting || query.isError || !!allocateProblem}
                  onPress={() => { void allocateBatch(); }} />
              </> : canAttachOutbound ? <>
                <Text variant="caption" color="textSecondary">Save the selected outbound containers to the server before confirming.</Text>
                <Button title="Save Selected Containers" fullWidth loading={acting}
                  disabled={!canCreateVoucher(session) || acting || query.isError}
                  onPress={() => { void attachOutboundLines(); }} />
              </> : canConfirmVoucher ? <>
                {!mobileCapabilities.confirmStockVoucher && <Text variant="caption" color="textSecondary">{inbound ? 'Awaiting server barcode allocation and inbound confirmation.' : 'Awaiting server container lines and outbound confirmation.'}</Text>}
                <Button title={inbound ? 'Confirm Inbound Voucher' : 'Confirm Outbound Voucher'} fullWidth loading={acting}
                  disabled={!canCreateVoucher(session) || !mobileCapabilities.confirmStockVoucher || acting || query.isError}
                  onPress={() => { void confirmVoucher(); }} />
              </> : <>
                <Text variant="caption" color="textSecondary">{inbound ? 'Allocate container barcodes on the server before confirming inbound stock.' : 'Select staged containers at Outbound before confirming outbound stock.'}</Text>
                <Button title={inbound ? 'Confirm Inbound Voucher' : 'Confirm Outbound Voucher'} fullWidth disabled onPress={() => {}} />
              </>}
            </View>;
          })()}
        </KeyboardAvoidingView>}
  </View>;
}
