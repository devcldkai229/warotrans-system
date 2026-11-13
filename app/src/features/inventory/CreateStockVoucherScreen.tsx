import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Barcode, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { getUserErrorMessage } from '../../shared/api/client';
import { createStockVoucherDraft } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import type { StockVoucherType } from '../../shared/types/contracts';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, SegmentedControl, Text, TextField } from '../../shared/ui';
import { canCreateVoucher, draftValidation, uncertainDraftWrite, voucherType } from './stockVoucherData';
import { useVoucherWarehouse } from './useVoucherWarehouse';
import { createVoucherStyles } from './voucherStyles';
import { useVoucherPreparation } from './useVoucherPreparation';
import { preparationDeviceStore } from './preparationDeviceStore';
import { ContainerCountField } from './ContainerCountField';
import { InboundBatchEditor } from './InboundBatchEditor';
import { InboundBatchSummary } from './InboundBatchSummary';
import { inboundBatchProblem, newBatchGroup, type InboundBatchGroup } from './inboundBatch';
import { OutboundVoucherSelection } from './OutboundVoucherSelection';

export function CreateStockVoucherScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { params, replace, goBack } = useNavigation();
  const { session, allowed, query, warehouse, selectionError } = useVoucherWarehouse(true);
  const [type, setType] = useState<StockVoucherType>(() => voucherType(params?.voucherType));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [outboundReady, setOutboundReady] = useState(false);
  const preparation = useVoucherPreparation(session?.id || '', warehouse?.id || '', `new-${type}`, type);
  const { referenceNo, note, requestedCount, groups = [] } = preparation.value;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  const inbound = type === 'INBOUND';
  const writable = canCreateVoucher(session) && !!warehouse && !query.isError && !selectionError;
  const editable = writable && !saving && !uncertain;
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, [session?.id]);
  useEffect(() => { setReview(false); setError(null); setOutboundReady(false); setUncertain(false); }, [session?.id, warehouse?.id, type]);
  useEffect(() => {
    if (preparation.ready && inbound && !preparation.value.groups?.length) {
      preparation.update(previous => ({ ...previous, groups: [newBatchGroup([], previous.requestedCount)] }));
    }
  }, [preparation.ready, inbound, preparation.value.groups?.length]);
  useEffect(() => {
    if (!review || saving || uncertain) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setReview(false); return true; });
    return () => listener.remove();
  }, [review, saving, uncertain]);
  const edit = (field: 'referenceNo' | 'note', value: string) => {
    if (!editable) return;
    setError(null); preparation.update(previous => ({ ...previous, [field]: value }));
  };
  const editCount = (count: string) => {
    if (!editable) return;
    setError(null);
    preparation.update(previous => ({ ...previous, requestedCount: count, groups: previous.groups?.map((group, index, all) =>
      all.length === 1 && index === 0 && (!group.containerCount || group.containerCount === previous.requestedCount) ? { ...group, containerCount: count } : group) }));
  };
  const editGroups = (next: InboundBatchGroup[]) => { if (editable) { setError(null); preparation.update(previous => ({ ...previous, groups: next })); } };
  const showError = (message: string) => { setError(message); requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: false })); };
  const validate = () => {
    const metadata = draftValidation(referenceNo, note);
    if (metadata) return t(metadata);
    if (!inbound) return Object.keys(preparation.value.selected).length ? null : t('Select at least one container.');
    const problem = inboundBatchProblem(requestedCount, groups);
    if (!problem) return null;
    const index = groups.findIndex(group => group.key === problem.groupKey);
    const message = t(problem.message);
    return index < 0 ? message : t('Group {group}: {message}', { group: index + 1, message });
  };
  const openReview = () => {
    if (!editable || !preparation.ready || (!inbound && !outboundReady)) return;
    Keyboard.dismiss();
    const problem = validate();
    if (problem) { showError(problem); return; }
    setError(null); setReview(true); scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => { if (review && !saving && !uncertain) { setReview(false); setError(null); } else goBack(); };
  const create = async () => {
    if (pending.current || !editable || !warehouse || !preparation.ready || !review) return;
    const problem = validate();
    if (problem) { showError(problem); return; }
    pending.current = true; setSaving(true); setError(null);
    const snapshot = preparation.value;
    const controller = new AbortController(); request.current = controller;
    try {
      // The current contract saves only document metadata. Batch plans remain explicitly local.
      const result = await createStockVoucherDraft({ warehouseId: warehouse.id, type, referenceNo, note }, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      client.setQueryData(['stock-voucher', session?.id, result.id], result);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      let preparationCopyFailed = false;
      try { await preparationDeviceStore.write({ accountId: session!.id, warehouseId: warehouse.id, documentKey: result.id }, snapshot); }
      catch { preparationCopyFailed = true; }
      if (!alive.current || controller.signal.aborted) return;
      replace('stock_voucher_detail', { voucherId: result.id, warehouseId: warehouse.id, preparationCopyFailed });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      const unknown = uncertainDraftWrite(failure); setUncertain(unknown);
      setError(unknown ? t('The result could not be confirmed. Check the voucher list before creating again.') : getUserErrorMessage(failure, 'The draft could not be created. Try again.'));
    } finally { pending.current = false; if (alive.current) setSaving(false); }
  };
  const selected = Object.values(preparation.value.selected);
  return <View style={styles.screen}>
    <ScreenHeader title={review ? inbound ? 'Review Inbound Voucher' : 'Review Outbound Voucher' : 'New Voucher'} canGoBack onBack={back} />
    {!allowed ? <EmptyState title="Voucher Access Unavailable" /> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
        {!warehouse || query.isError ? <EmptyState compact title={query.isPending ? 'Loading Warehouse…' : 'Warehouse Unavailable'}
          message={selectionError || (query.error ? getUserErrorMessage(query.error, 'The warehouse could not be loaded.') : undefined)}
          actionTitle={query.isError ? 'Retry' : !query.isPending ? 'Back To Vouchers' : undefined}
          onAction={query.isError ? () => { void query.refetch(); } : () => replace('stock_vouchers')} /> : <>
          {!review && !saving && !uncertain && <SegmentedControl value={type} onChange={setType} accessibilityLabel="New voucher type" options={[{ label: 'Inbound', value: 'INBOUND' }, { label: 'Outbound', value: 'OUTBOUND' }]} />}
          {preparation.ready ? <>
            {!review && inbound && <>
              <View style={styles.typeCard}><ContainerCountField value={requestedCount} onChange={editCount} editable={editable} /></View>
              <InboundBatchEditor requestedCount={requestedCount} groups={groups} editable={editable} onChange={editGroups} />
            </>}
            {!review && !inbound && <OutboundVoucherSelection key={`${session?.id}:${warehouse.id}`} accountId={session?.id || ''} warehouseId={warehouse.id} value={preparation.value} update={preparation.update} onReview={openReview} onReadinessChange={setOutboundReady} showReviewAction={false} editable={editable} />}
            {review && <>
              <Card gap={12}>
                <View style={styles.between}><Text variant="headline">{inbound ? 'Inbound Batch' : 'Selected Containers'}</Text><Button title="Edit" variant="ghost" size="sm" disabled={!editable} onPress={() => setReview(false)} /></View>
                <View style={styles.stat}><Text variant="title">{inbound ? requestedCount : selected.length}</Text><Text variant="body" color="textSecondary">Containers</Text></View>
                {inbound ? <InboundBatchSummary groups={groups} /> : selected.map(item => <View key={item.id} style={styles.containerRow}><Text variant="code" selectable>{item.barcode}</Text><Text variant="bodyMedium">{item.productName}</Text><Text variant="caption" color="textSecondary">{item.productSku}</Text></View>)}
              </Card>
              {inbound && <Card gap={12}>
                <View style={styles.between}><View style={styles.row}><Barcode size={20} color={colors.textSecondary} /><Text variant="headline">Barcodes</Text></View><Text variant="bodyMedium">{t('0/{count} allocated', { count: requestedCount })}</Text></View>
                <Button title="Generate Barcodes" disabled onPress={() => {}} />
              </Card>}
              <Text variant="caption" color="textSecondary">{inbound ? 'Barcode allocation is unavailable. An empty server draft can be created; batch contents stay on this device.' : 'Only an empty server draft can be created. The container selection stays on this device.'}</Text>
            </>}
            <View style={styles.detailsCard}>
              <Pressable onPress={() => setDetailsOpen(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} style={({ pressed }) => [styles.detailsHeader, pressed && styles.pressed]}>
                <View style={styles.row}><Text variant="bodyMedium">Additional Details</Text>{!detailsOpen && (!!referenceNo.trim() || !!note.trim()) && <View style={styles.detailsDot} />}</View>
                {detailsOpen ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
              </Pressable>
              {detailsOpen && <View style={styles.detailsBody}>
                <TextField label="Reference (Optional)" value={referenceNo} onChangeText={value => edit('referenceNo', value)} maxLength={100} editable={editable} autoCorrect={false} placeholder="Document number" />
                <TextField label="Note (Optional)" value={note} onChangeText={value => edit('note', value)} maxLength={500} editable={editable} placeholder="Add a note" multiline inputStyle={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }} />
              </View>}
            </View>
          </> : !preparation.error && <Text variant="body">Loading Preparation…</Text>}
          {preparation.error && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{preparation.error}</Text><Button title="Retry" variant="outline" onPress={() => { if (preparation.ready) void preparation.persist().catch(() => {}); else preparation.retry(); }} /></View>}
        </>}
        {error && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{error}</Text>{uncertain && <Button title="Check Vouchers" variant="outline" onPress={() => replace('stock_vouchers')} />}</View>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {!canCreateVoucher(session) && <Text variant="caption" color="textSecondary">Your account cannot create vouchers.</Text>}
        <Button title={review ? 'Create Empty Draft' : inbound ? 'Review Batch' : 'Review Selection'} onPress={() => { if (review) void create(); else openReview(); }} loading={saving} disabled={!editable || !preparation.ready || (!review && !inbound && !outboundReady)} fullWidth />
      </View>
    </KeyboardAvoidingView>}
  </View>;
}
