import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, ChevronDown, ChevronUp } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { getUserErrorMessage } from '../../shared/api/client';
import { createStockVoucher, setContainerContents, type ListContainersResponse } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import type { StockVoucherType } from '../../shared/types/contracts';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, SegmentedControl, Text, TextField } from '../../shared/ui';
import { canCreateVoucher, draftValidation, uncertainDraftWrite, voucherType } from './stockVoucherData';
import { useVoucherWarehouse } from './useVoucherWarehouse';
import { createVoucherStyles } from './voucherStyles';
import { useVoucherPreparation } from './useVoucherPreparation';
import { emptyPreparation } from './voucherPreparation';
import { preparationDeviceStore } from './preparationDeviceStore';
import { InboundContainerSelection, inboundQuantityOf } from './InboundContainerSelection';
import { contentsQuantity } from './voucherPreparation';
import { OutboundVoucherSelection } from './OutboundVoucherSelection';

export function CreateStockVoucherScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { params, replace, goBack, navigate } = useNavigation();
  const { session, allowed, query, warehouse, selectionError } = useVoucherWarehouse(true);
  const [type, setType] = useState<StockVoucherType>(() => voucherType(params?.voucherType));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [outboundReady, setOutboundReady] = useState(false);
  const [inboundReady, setInboundReady] = useState(false);
  const preparation = useVoucherPreparation(session?.id || '', warehouse?.id || '', `new-${type}`, type);
  const { referenceNo, note } = preparation.value;
  const [saving, setSaving] = useState<false | 'draft' | 'confirm'>(false);
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
  useEffect(() => { setReview(false); setError(null); setOutboundReady(false); setInboundReady(false); setUncertain(false); }, [session?.id, warehouse?.id, type]);
  // Boxes this inbound voucher can take, as the selection last loaded them (their current quantity).
  const awaiting = (): ListContainersResponse['items'] =>
    client.getQueryData<ListContainersResponse>(['inbound-awaiting-containers', session?.id || '', warehouse?.id || ''])?.items ?? [];
  useEffect(() => {
    if (!review || saving || uncertain) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setReview(false); return true; });
    return () => listener.remove();
  }, [review, saving, uncertain]);
  const edit = (field: 'referenceNo' | 'note', value: string) => {
    if (!editable) return;
    setError(null); preparation.update(previous => ({ ...previous, [field]: value }));
  };
  const showError = (message: string) => { setError(message); requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: false })); };
  const validate = () => {
    const metadata = draftValidation(referenceNo, note);
    if (metadata) return t(metadata);
    const chosen = Object.values(preparation.value.selected);
    if (!chosen.length) return t('Select at least one container.');
    if (!inbound) return null;
    const known = new Map(awaiting().map(item => [item.id, item]));
    const bad = chosen.find(item => contentsQuantity(inboundQuantityOf(preparation.value, known.get(item.id) ?? item)) === null);
    return bad ? t('{code}: enter how many goods it holds.', { code: bad.barcode }) : null;
  };
  const animateLayout = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  const openReview = () => {
    if (!editable || !preparation.ready || !(inbound ? inboundReady : outboundReady)) return;
    Keyboard.dismiss();
    const problem = validate();
    if (problem) { showError(problem); return; }
    animateLayout();
    setError(null); setReview(true); scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => { if (review && !saving && !uncertain) { animateLayout(); setReview(false); setError(null); } else goBack(); };
  /** `confirm`: the voucher is born CONFIRMED (outbound in one call; inbound once its Container codes are allocated). */
  const create = async (confirm: boolean) => {
    if (pending.current || !editable || !warehouse || !preparation.ready || !review) return;
    const problem = validate();
    if (problem) { showError(problem); return; }
    pending.current = true; setSaving(confirm ? 'confirm' : 'draft'); setError(null);
    const snapshot = preparation.value;
    const controller = new AbortController(); request.current = controller;
    try {
      const containerIds = Object.keys(snapshot.selected);
      if (inbound) {
        // The quantities corrected here go on the boxes first: a confirmed voucher locks them.
        const known = new Map(awaiting().map(item => [item.id, item]));
        const changed = containerIds
          .map(id => ({ containerId: id, quantity: contentsQuantity(inboundQuantityOf(snapshot, known.get(id) ?? { id }))! }))
          .filter(item => known.get(item.containerId)?.contentsQuantity !== item.quantity);
        if (changed.length) await setContainerContents(changed, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
      }
      // The voucher, its Containers and (if asked) the confirmation commit together.
      const created = await createStockVoucher({ warehouseId: warehouse.id, type, referenceNo, note, containerIds, confirm }, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      preparation.reset(emptyPreparation(type));
      void preparationDeviceStore.write({ accountId: session!.id, warehouseId: warehouse.id, documentKey: `new-${type}` }, emptyPreparation(type)).catch(() => {});
      client.setQueryData(['stock-voucher', session?.id, created.id], created);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      void client.invalidateQueries({ queryKey: inbound ? ['inbound-awaiting-containers'] : ['outbound-voucher-preview'] });
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      replace('stock_voucher_detail', { voucherId: created.id, warehouseId: warehouse.id });
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
            {!review && inbound && <InboundContainerSelection key={`${session?.id}:${warehouse.id}`} accountId={session?.id || ''} warehouseId={warehouse.id}
              value={preparation.value} update={preparation.update} editable={editable} onReadinessChange={setInboundReady}
              preselectIds={Array.isArray(params?.containerIds) ? params.containerIds : undefined}
              onCreateContainers={() => navigate('create_container')} />}
            {!review && !inbound && <OutboundVoucherSelection key={`${session?.id}:${warehouse.id}`} accountId={session?.id || ''} warehouseId={warehouse.id} value={preparation.value} update={preparation.update} onReview={openReview} onReadinessChange={setOutboundReady} showReviewAction={false} editable={editable} />}
            {review && <Card gap={12} style={styles.reviewCard}>
              <View style={styles.between}><Text variant="headline">Selected Containers</Text><Button title="Edit" variant="ghost" size="sm" style={styles.editButton} disabled={!editable} onPress={() => { animateLayout(); setReview(false); }} /></View>
              <View style={styles.batchStatBar}>
                <View style={styles.stat}><Text variant="title" style={styles.tabular}>{selected.length}</Text><Text variant="bodyMedium" color="textSecondary">Containers</Text></View>
              </View>
              {selected.map((item, index) => (
                <View key={item.id} style={[styles.summaryRow, index === 0 && { paddingTop: 4 }, index === selected.length - 1 && { borderBottomWidth: 0, paddingBottom: 2 }]}>
                  <View style={styles.summaryIcon}>
                    <Box size={18} strokeWidth={1.8} color={colors.primaryText} />
                  </View>
                  <View style={styles.summaryInfo}>
                    <Text variant="code" selectable>{item.barcode}</Text>
                    <Text variant="bodyMedium" numberOfLines={1}>{item.productName}</Text>
                    <Text variant="code" color="textSecondary" numberOfLines={1}>{item.productSku}</Text>
                  </View>
                  {inbound && <Text variant="bodyMedium" style={styles.tabular}>{t('Qty {quantity}', { quantity: inboundQuantityOf(preparation.value, awaiting().find(box => box.id === item.id) ?? item) })}</Text>}
                </View>
              ))}
            </Card>}
          </> : !preparation.error && <Text variant="body">Loading Preparation…</Text>}
          {preparation.error && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{preparation.error}</Text><Button title="Retry" variant="outline" onPress={() => { if (preparation.ready) void preparation.persist().catch(() => {}); else preparation.retry(); }} /></View>}
        </>}
        {error && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{error}</Text>{uncertain && <Button title="Check Vouchers" variant="outline" onPress={() => replace('stock_vouchers')} />}</View>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {!canCreateVoucher(session) && <Text variant="caption" color="textSecondary">Your account cannot create vouchers.</Text>}
        {review ? <View style={styles.row}>
          <Button title="Save As Draft" variant="outline" style={styles.flex} onPress={() => { void create(false); }} loading={saving === 'draft'} disabled={!editable || !preparation.ready} />
          <Button title="Create And Confirm" style={styles.flex} onPress={() => { void create(true); }} loading={saving === 'confirm'} disabled={!editable || !preparation.ready} />
        </View> : <Button title="Review Selection" onPress={openReview} disabled={!editable || !preparation.ready || !(inbound ? inboundReady : outboundReady)} fullWidth />}
      </View>
    </KeyboardAvoidingView>}
  </View>;
}
