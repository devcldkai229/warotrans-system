import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, CheckCircle2, FileText, MapPin, Printer, QrCode, ScanLine, Truck } from 'lucide-react-native';
import { Scanner } from '../../shared/scan/Scanner';
import { Code128View, QrCodeView } from '../../shared/scan/CodeViews';
import { qrPayload } from '../../shared/scan/scanCodes';
import { printLabels } from '../../shared/scan/printLabels';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { mobileCapabilities } from '../../shared/api/capabilities';
import { getActiveMapVersion, getMapVersionDetail } from '../../shared/api/navigationApi';
import { addStockVoucherLines, cancelStockVoucher, closeStockVoucherShort, confirmStockVoucher, createContainerBatch, getStockVoucher } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, Text, TextField } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  clearPendingBatch,
  inboundBatchProblem,
  isDefinitiveBatchRejection,
  isPendingBatchForVoucher,
  reconcilePendingBatchWithVoucher,
  runPersistentBatchAllocation,
} from './inboundBatch';
import { preparationDeviceStore } from './preparationDeviceStore';
import { canAllocateInboundBatch, canCreateVoucher, canReadVouchers, uncertainDraftWrite, voucherDate, voucherLineLocation } from './stockVoucherData';
import { useVoucherPreparation } from './useVoucherPreparation';
import { emptyPreparation } from './voucherPreparation';
import { createVoucherStyles } from './voucherStyles';
import { VoucherDraftWorkspace } from './VoucherDraftWorkspace';

export function StockVoucherDetailScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { session } = useAuth();
  const { params, goBack, navigate } = useNavigation();
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
  const [checked, setChecked] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [closingShort, setClosingShort] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(() => typeof params?.batchError === 'string' ? params.batchError : null);
  const alive = useRef(true);
  const pending = useRef(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, [session?.id, voucherId]);
  useEffect(() => { setActionError(typeof params?.batchError === 'string' ? params.batchError : null); setConfirmingCancel(false); }, [voucherId, params?.batchError]);
  useEffect(() => { if (data && data.status !== 'DRAFT') setConfirmingCancel(false); }, [data?.status]);

  /** Lines still waiting for a robot: not done and not dropped when the voucher was closed short. */
  const openLines = useMemo(() => (data?.lines ?? []).filter(line => !line.done && !line.closedShort), [data?.lines]);
  /** Open lines whose Container is where the trip starts (received for inbound, on its shelf for outbound). */
  const dispatchLines = useMemo(() => openLines.filter(line => (data?.type === 'INBOUND'
    ? line.containerStatus === 'CREATED' || line.containerStatus === 'PACKED' : line.containerStatus === 'STORED')), [openLines, data?.type]);
  const hasServerBatchLines = !!data && inbound && data.lines.length > 0 && data.lines.every(line => line.contentsQuantity != null);
  const hasPendingBatch = Boolean(
    data && inbound && data.status === 'DRAFT' && !data.lines.length && prep.ready
    && isPendingBatchForVoucher(prep.value.pendingBatch, data.warehouseId, data.id),
  );
  useEffect(() => {
    if (!data || !prep.ready || !prep.value.pendingBatch) return;
    if (data.lines.length > 0 || data.status !== 'DRAFT') {
      const reconciled = reconcilePendingBatchWithVoucher(prep.value, data);
      prep.reset(reconciled);
      void preparationDeviceStore.write(prep.scope, reconciled).catch(() => {});
    }
  }, [data?.lines.length, data?.status, prep.ready, prep.value.pendingBatch]);
  const selectedIds = Object.keys(prep.value.selected);
  const needsEndpointLabels = Boolean(data?.warehouseId) && data!.lines.some(line => !line.currentStorageLocationCode && !!line.currentEndpointId);
  const mapEndpointsQuery = useQuery({
    queryKey: ['warehouse-map-endpoints', session?.id, data?.warehouseId],
    queryFn: async ({ signal }) => {
      const active = await getActiveMapVersion(data!.warehouseId, signal);
      if (!active) return [];
      return (await getMapVersionDetail(active.id, signal)).endpoints;
    },
    enabled: needsEndpointLabels,
    staleTime: 60_000,
    retry: false,
  });
  const endpointLabelById = useMemo(
    () => new Map((mapEndpointsQuery.data ?? []).map(ep => [ep.id, ep.name || ep.code])),
    [mapEndpointsQuery.data],
  );

  const allocateBatch = async () => {
    const canRetryPending = hasPendingBatch;
    const canSubmitNew = !!prep.value.groups?.length && !inboundBatchProblem(prep.value.requestedCount, prep.value.groups);
    if (pending.current || acting || !data || !inbound || data.status !== 'DRAFT' || data.lines.length > 0
      || !prep.ready || !canAllocateInboundBatch(session) || !mobileCapabilities.createContainer
      || (!canRetryPending && !canSubmitNew)) {
      return;
    }
    pending.current = true; setActing(true); setActionError(null);
    const controller = new AbortController(); request.current = controller;
    let nextPrep = prep.value;
    try {
      const outcome = await runPersistentBatchAllocation({
        prep: prep.value,
        warehouseId: data.warehouseId,
        voucherId: data.id,
        onStage: (staged) => {
          nextPrep = staged;
          // Update slot state before persisting so an unmount flush cannot erase pendingBatch.
          prep.reset(staged);
        },
        persist: (staged) => preparationDeviceStore.write(prep.scope, staged),
        submit: (body) => createContainerBatch(body, controller.signal),
        shouldStop: () => !alive.current || controller.signal.aborted,
      });
      nextPrep = outcome.nextPrep;
      if (outcome.status === 'persist_failed') {
        if (alive.current && !controller.signal.aborted) {
          setActionError(t('Could not save the batch request on this device. Try again.'));
        }
        return;
      }
      if (outcome.status === 'aborted' || !alive.current || controller.signal.aborted) return;
      const batch = outcome.result;
      if (!alive.current || controller.signal.aborted) return;
      const cleared = clearPendingBatch(nextPrep);
      prep.reset(cleared);
      void preparationDeviceStore.write(prep.scope, cleared).catch(() => {});
      if (batch.stockVoucher) {
        client.setQueryData(['stock-voucher', session?.id, data.id], batch.stockVoucher);
      } else {
        void query.refetch();
      }
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (isDefinitiveBatchRejection(failure)) {
        const cleared = clearPendingBatch(nextPrep);
        prep.reset(cleared);
        void preparationDeviceStore.write(prep.scope, cleared).catch(() => {});
      } else if (uncertainDraftWrite(failure) || (failure instanceof ApiError && failure.status === 409)) {
        void query.refetch();
      }
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

  /** A CONFIRMED voucher whose remaining Containers will not be moved: close those lines and keep what is done. */
  const closeShort = async () => {
    if (pending.current || acting || !data || data.status !== 'CONFIRMED' || !closeReason.trim() || !canCreateVoucher(session)) {
      return;
    }
    pending.current = true; setActing(true); setActionError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const closed = await closeStockVoucherShort(data.id, closeReason, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      setClosingShort(false); setCloseReason('');
      client.setQueryData(['stock-voucher', session?.id, data.id], closed);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      void client.invalidateQueries({ queryKey: ['outbound-voucher-preview'] });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (uncertainDraftWrite(failure)) void query.refetch();
      setActionError(getUserErrorMessage(failure, 'The voucher could not be closed. Try again.'));
    } finally {
      pending.current = false;
      if (alive.current) setActing(false);
    }
  };

  const cancelDraft = async () => {
    if (pending.current || acting || !data || data.status !== 'DRAFT' || !canCreateVoucher(session)) {
      return;
    }
    pending.current = true; setActing(true); setActionError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const cancelled = await cancelStockVoucher(data.id, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      if (prep.ready) {
        prep.reset(emptyPreparation(data.type));
        void prep.persist().catch(() => {});
      }
      setConfirmingCancel(false);
      client.setQueryData(['stock-voucher', session?.id, data.id], cancelled);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      void client.invalidateQueries({ queryKey: ['outbound-voucher-preview'] });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (uncertainDraftWrite(failure)) void query.refetch();
      setActionError(getUserErrorMessage(failure, 'The draft voucher could not be cancelled. Try again.'));
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
              {data.status === 'CONFIRMED' && <Text variant="caption" color="textSecondary">{t('{done}/{total} done', { done: data.doneCount, total: data.containerCount })} · {inbound
                ? t('Stock is added as robots put each container on a shelf.')
                : t('Stock comes off each shelf when a robot delivers the container to an Outbound gate.')}</Text>}
              {!!data.completedAt && <Text variant="caption" color="textSecondary">{t('Completed {date}', { date: voucherDate(data.completedAt) })}</Text>}
              {!!data.closedShortAt && <Text variant="caption" color="warningText">{t('Closed short {date}: {reason}', { date: voucherDate(data.closedShortAt), reason: data.closedShortReason ?? '' })}</Text>}
              {!!data.cancelledAt && <Text variant="caption" color="textSecondary">{t('Cancelled {date}', { date: voucherDate(data.cancelledAt) })}</Text>}
              {/* A confirmed voucher with containers still to move: dispatch robots (put away, or ship to an Outbound gate). */}
              {data.status === 'CONFIRMED' && dispatchLines.length ? <Button
                title={inbound ? 'Dispatch Robots To Put Away' : 'Dispatch Robots To Ship'} icon={Truck} fullWidth
                onPress={() => navigate('transport_create', { workflow: inbound ? 'inbound' : 'outbound', containers: dispatchLines.filter(line => !checked.length || checked.includes(line.containerBarcode)).map(line => line.containerBarcode) })} /> : null}
              {data.status === 'CONFIRMED' && openLines.length && canCreateVoucher(session) ? (closingShort ? (
                <View style={styles.error}>
                  <Text variant="caption" color="warningText">{t('{count} containers not done will leave this voucher. Containers already done keep their stock.', { count: openLines.length })}</Text>
                  <TextField accessibilityLabel="Reason for closing short" placeholder="Reason (required)" value={closeReason} onChangeText={setCloseReason} editable={!acting} maxLength={500} />
                  <View style={styles.row}>
                    <Button title="Keep Open" variant="outline" size="sm" style={styles.flex} disabled={acting} onPress={() => { setClosingShort(false); setCloseReason(''); }} />
                    <Button title="Close Short" variant="danger" size="sm" style={styles.flex} loading={acting} disabled={acting || query.isError || !closeReason.trim()} onPress={() => { void closeShort(); }} />
                  </View>
                </View>
              ) : (
                <Button title="Close Voucher Short" variant="outline" size="sm" disabled={acting || query.isError} onPress={() => { setActionError(null); setClosingShort(true); }} />
              )) : null}
              {data.status !== 'DRAFT' && actionError ? <Text variant="caption" color="dangerText" accessibilityRole="alert">{actionError}</Text> : null}
              {data.status !== 'CANCELLED' && data.lines.length ? <Button title={checked.length ? t('Scan Containers ({done}/{total} checked)', { done: checked.length, total: data.lines.length }) : 'Scan Containers To Check'}
                icon={ScanLine} variant="outline" fullWidth onPress={() => setScanning(true)} /> : null}
              <Button title={showCode ? 'Hide Voucher Code' : 'Show Voucher Code'} icon={QrCode} variant="ghost" size="sm" onPress={() => setShowCode(value => !value)} />
              {showCode ? <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                <QrCodeView value={qrPayload('VOUCHER', data.code)} size={170} />
                <Code128View value={data.code} width={260} height={52} />
                <Text variant="code" selectable>{data.code}</Text>
                <Button title="Print Voucher Code" icon={Printer} variant="outline" size="sm" onPress={() => { void printLabels([{ code: data.code, qr: qrPayload('VOUCHER', data.code), title: inbound ? t('Inbound voucher') : t('Outbound voucher'), subtitle: voucherDate(data.createdAt) }], data.code).catch(() => {}); }} />
              </View> : null}
              {data.status === 'DRAFT' && canCreateVoucher(session) && (confirmingCancel ? (
                <View style={styles.error}>
                  <Text variant="caption" color="dangerText">Cancel this draft voucher? Attached containers will be released.</Text>
                  <View style={styles.row}>
                    <Button title="Keep Draft" variant="outline" size="sm" style={styles.flex} disabled={acting} onPress={() => setConfirmingCancel(false)} />
                    <Button title="Cancel Draft" variant="danger" size="sm" style={styles.flex} loading={acting} disabled={acting || query.isError} onPress={() => { void cancelDraft(); }} />
                  </View>
                </View>
              ) : (
                <Button title="Cancel Draft Voucher" variant="outline" size="sm" disabled={acting || query.isError} onPress={() => { setActionError(null); setConfirmingCancel(true); }} />
              ))}
            </Card>

            {params?.preparationCopyFailed && <View style={styles.error}><Text variant="body" color="dangerText">The server draft was created, but preparation could not be copied. Re-enter the products, quantities and units below; do not create another draft.</Text></View>}
            {data.status === 'DRAFT' && <VoucherDraftWorkspace key={`${session?.id}:${data.id}:${data.type}`} data={data} accountId={session?.id || ''} writable={canCreateVoucher(session) && !query.isError && !acting} preparation={prep} />}

            {(data.status !== 'DRAFT' || hasServerBatchLines || !inbound) && !!data.lines.length && <Card gap={8} style={styles.reviewCard}>
              <Text variant="headline">Containers</Text>
              {data.lines.map((line, index) => <Pressable
                key={line.id}
                onPress={() => {
                  triggerHaptic('tap');
                  navigate('container_detail', { containerId: line.containerId, barcode: line.containerBarcode });
                }}
                accessibilityRole="button"
                accessibilityLabel={`Open container ${line.containerBarcode} details`}
                style={({ pressed }) => [
                  styles.summaryRow,
                  index === 0 && { paddingTop: 4 },
                  index === data.lines.length - 1 && { borderBottomWidth: 0, paddingBottom: 2 },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.summaryIcon}><Box size={18} strokeWidth={1.8} color={colors.primaryText} /></View>
                <View style={styles.summaryInfo}>
                  <View style={styles.between}>{checked.includes(line.containerBarcode) ? <CheckCircle2 size={16} color={colors.success} /> : null}<Text variant="code" style={{ flex: 1 }}>{line.containerBarcode}</Text><StatusPill status={line.containerStatus} /></View>
                  <Text variant="bodyMedium" numberOfLines={1}>{line.productName}</Text>
                  {line.closedShort ? <Text variant="caption" color="warningText">Closed Short</Text> : null}
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>
                    {line.productSku}
                    {line.contentsQuantity != null ? ` · ${t('Qty {quantity}', { quantity: line.contentsQuantity })}` : ''}
                    {(() => {
                      const locationText = voucherLineLocation(line, endpointLabelById);
                      return locationText ? ` · ${t(locationText)}` : '';
                    })()}
                    {line.currentLevelNo != null ? ` ${t('· Level {level}', { level: line.currentLevelNo })}` : ''}
                  </Text>
                </View>
              </Pressable>)}
            </Card>}
          </ScrollView>
          <Scanner visible={scanning} continuous expect={['CONTAINER']} title="Check containers of this voucher" manualLabel="Container code"
            placeholder="Scan or type a container code" onClose={() => setScanning(false)}
            onScanResult={(_raw, scanned) => {
              const line = data.lines.find(item => item.containerBarcode.toUpperCase() === scanned.code.toUpperCase());
              if (!line) return { ok: false, message: t('Not on this voucher') };
              if (checked.includes(line.containerBarcode)) return { ok: false, message: t('Already checked') };
              setChecked(previous => [...previous, line.containerBarcode]);
              return { ok: true, message: t('On this voucher · {product}', { product: line.productName }) };
            }} />
          {data.status === 'DRAFT' && (() => {
            const canAllocateFromPlan = inbound && !data.lines.length && prep.ready && !!prep.value.groups?.length;
            const canAttachOutbound = !inbound && !data.lines.length && prep.ready && selectedIds.length > 0;
            const canConfirmVoucher = !!data.lines.length;
            const allocateProblem = canAllocateFromPlan ? inboundBatchProblem(prep.value.requestedCount, prep.value.groups!) : null;
            return <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {actionError && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{actionError}</Text></View>}
              {hasPendingBatch ? <>
                <Text variant="caption" color="warningText">
                  Previous barcode allocation could not be confirmed. Retry the same batch or refresh to load server results.
                </Text>
                <View style={styles.row}>
                  <Button title="Refresh Voucher" variant="outline" style={styles.flex}
                    loading={query.isRefetching} disabled={acting}
                    onPress={() => { void query.refetch(); }} />
                  <Button title="Retry Same Batch" style={styles.flex} loading={acting}
                    disabled={!canAllocateInboundBatch(session) || !mobileCapabilities.createContainer || acting}
                    onPress={() => { void allocateBatch(); }} />
                </View>
              </> : canAllocateFromPlan ? (() => {
                const problemIndex = allocateProblem?.groupKey
                  ? (prep.value.groups ?? []).findIndex(group => group.key === allocateProblem.groupKey)
                  : -1;
                const problemText = allocateProblem
                  ? (problemIndex < 0
                    ? t(allocateProblem.message)
                    : t('Group {group}: {message}', { group: problemIndex + 1, message: t(allocateProblem.message) }))
                  : null;
                return <>
                  <Text variant="caption" color={problemText ? 'warningText' : 'textSecondary'}>
                    {problemText ?? 'Allocate server container barcodes for this batch before confirming inbound stock.'}
                  </Text>
                  <Button title="Allocate Container Barcodes" fullWidth loading={acting}
                    disabled={!canAllocateInboundBatch(session) || !mobileCapabilities.createContainer || acting || query.isError || !!allocateProblem}
                    onPress={() => { void allocateBatch(); }} />
                </>;
              })() : canAttachOutbound ? <>
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
                <Text variant="caption" color="textSecondary">{inbound ? 'Allocate container barcodes on the server before confirming inbound stock.' : 'Select containers on shelves before confirming the outbound voucher.'}</Text>
                <Button title={inbound ? 'Confirm Inbound Voucher' : 'Confirm Outbound Voucher'} fullWidth disabled onPress={() => {}} />
              </>}
            </View>;
          })()}
        </KeyboardAvoidingView>}
  </View>;
}
