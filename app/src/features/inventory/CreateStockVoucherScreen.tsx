import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronUp, Warehouse } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { getUserErrorMessage } from '../../shared/api/client';
import { createStockVoucherDraft } from '../../shared/api/warehouseApi';
import type { StockVoucherType } from '../../shared/types/contracts';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, EmptyState, ScreenHeader, SegmentedControl, Text, TextField } from '../../shared/ui';
import { canCreateVoucher, draftValidation, uncertainDraftWrite, voucherType } from './stockVoucherData';
import { useVoucherWarehouse } from './useVoucherWarehouse';
import { createVoucherStyles } from './voucherStyles';
import { useVoucherPreparation } from './useVoucherPreparation';
import { preparationDeviceStore } from './preparationDeviceStore';
import { preparationCount } from './voucherPreparation';

export function CreateStockVoucherScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { params, replace, goBack } = useNavigation();
  const { session, allowed, query, warehouse, selectionError } = useVoucherWarehouse();
  const [type, setType] = useState<StockVoucherType>(() => voucherType(params?.voucherType));
  const [detailsOpen, setDetailsOpen] = useState(false);
  const preparation = useVoucherPreparation(session?.id || '', warehouse?.id || '', `new-${type}`, type);
  const { referenceNo, note, requestedCount } = preparation.value;
  const edit = (field: 'referenceNo' | 'note' | 'requestedCount', value: string) => preparation.update(previous => ({ ...previous, [field]: value }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  const request = useRef<AbortController | null>(null);
  const client = useQueryClient();
  const insets = useSafeAreaInsets();
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, [session?.id]);
  const writable = canCreateVoucher(session) && !!warehouse && !query.isError && !selectionError;
  const create = async () => {
    if (pending.current || !writable || !warehouse || uncertain) return;
    if (!preparation.ready) return;
    const validation = draftValidation(referenceNo, note) || (type === 'INBOUND' && preparationCount(requestedCount) === null ? 'Enter a positive whole number of containers.' : null);
    if (validation) { setError(validation); return; }
    pending.current = true; setSaving(true); setError(null);
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await createStockVoucherDraft({ warehouseId: warehouse.id, type, referenceNo, note }, controller.signal);
      if (!alive.current || controller.signal.aborted) return;
      client.setQueryData(['stock-voucher', session?.id, result.id], result);
      void client.invalidateQueries({ queryKey: ['stock-vouchers', session?.id] });
      let preparationCopyFailed = false;
      try {
        await preparationDeviceStore.write({ accountId: session!.id, warehouseId: warehouse.id, documentKey: result.id }, preparation.value);
      } catch { preparationCopyFailed = true; }
      if (!alive.current || controller.signal.aborted) return;
      // Back returns to the list, not a fresh form that could create this draft twice.
      replace('stock_voucher_detail', { voucherId: result.id, warehouseId: warehouse.id, preparationCopyFailed });
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      const unknown = uncertainDraftWrite(failure);
      setUncertain(unknown);
      setError(unknown ? 'The result could not be confirmed. Check the voucher list before creating again.' : getUserErrorMessage(failure, 'The draft could not be created. Try again.'));
    } finally { pending.current = false; if (alive.current) setSaving(false); }
  };

  return <View style={styles.screen}>
    <ScreenHeader title="New Voucher" canGoBack onBack={goBack} />
    {!allowed ? <EmptyState title="Voucher Access Unavailable" /> :
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {!warehouse || query.isError ? <EmptyState compact title={query.isPending ? 'Loading Warehouse…' : 'Warehouse Unavailable'}
            message={selectionError || (query.error ? getUserErrorMessage(query.error, 'The warehouse could not be loaded.') : undefined)}
            actionTitle={query.isError ? 'Retry' : !query.isPending ? 'Choose Warehouse' : undefined}
            onAction={query.isError ? () => { void query.refetch(); } : () => replace('stock_vouchers')} /> : <>
            <View style={styles.row}><Warehouse size={18} color={colors.textSecondary} /><Text variant="bodyMedium" style={{ flex: 1 }}>{warehouse.name}</Text></View>
            <View style={styles.formSection}>
              <Text variant="label">Voucher Type</Text>
              {saving || uncertain ? <Text variant="bodyMedium">{type === 'INBOUND' ? 'Inbound' : 'Outbound'}</Text> :
                <SegmentedControl value={type} onChange={setType} accessibilityLabel="New voucher type" options={[{ label: 'Inbound', value: 'INBOUND' }, { label: 'Outbound', value: 'OUTBOUND' }]} />}
              <View style={styles.typeCard}>
                <View style={styles.row}><View style={[styles.direction, type === 'OUTBOUND' && styles.outbound]}>
                  {type === 'INBOUND' ? <ArrowDownLeft size={22} color={colors.primaryText} /> : <ArrowUpRight size={22} color={colors.warningText} />}
                </View><Text variant="headline">{type === 'INBOUND' ? 'Receive New Containers' : 'Issue Staged Containers'}</Text></View>
                <Text variant="body" color="textSecondary">{type === 'INBOUND' ? 'Generate barcodes, then enter the contents of each container.' : 'Select containers already at Outbound before confirming this voucher.'}</Text>
              </View>
            </View>
            {preparation.ready && <>
              {type === 'INBOUND' && <View style={styles.typeCard}>
                <TextField label="Number Of Containers" value={requestedCount} onChangeText={value => edit('requestedCount', value)} keyboardType="number-pad" maxLength={4} editable={!saving && !uncertain} placeholder="e.g. 5" />
                <Text variant="caption" color="textSecondary">One unique barcode per container. Codes have not been allocated yet.</Text>
              </View>}
              <Pressable onPress={() => setDetailsOpen(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} style={[styles.between, { minHeight: 44 }]}>
                <Text variant="bodyMedium">Reference &amp; Note <Text variant="caption" color="textMuted">Optional</Text></Text>
                {detailsOpen ? <ChevronUp size={18} color={colors.textSecondary} /> : <ChevronDown size={18} color={colors.textSecondary} />}
              </Pressable>
              {detailsOpen && <View style={styles.formSection}>
                <TextField label="Reference" value={referenceNo} onChangeText={value => edit('referenceNo', value)} maxLength={100} editable={!saving && !uncertain} autoCorrect={false} placeholder="Document number" />
                <TextField label="Note" value={note} onChangeText={value => edit('note', value)} maxLength={500} editable={!saving && !uncertain} placeholder="Add a note" multiline inputStyle={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }} />
              </View>}
              <Text variant="caption" color="textMuted">{preparation.saved ? 'Preparation saved on this device.' : 'Saving preparation on this device…'}</Text>
            </>}
            {!preparation.ready && !preparation.error && <Text variant="body">Loading Preparation…</Text>}
            {preparation.error && <View style={styles.error}><Text variant="body" color="dangerText">{preparation.error}</Text><Button title="Retry" variant="outline" onPress={() => { if (preparation.ready) void preparation.persist().catch(() => {}); else preparation.retry(); }} /></View>}

          </>}
          {error && <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{error}</Text>
            {uncertain && <Button title="Check Vouchers" variant="outline" onPress={() => replace('stock_vouchers', { warehouseId: warehouse?.id })} />}</View>}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Text variant="caption" color="textSecondary" textAlign="center">{canCreateVoucher(session) ? 'Empty draft on server · Preparation on this device' : 'Your account cannot create vouchers.'}</Text>
          <Button title="Create Draft" onPress={() => { void create(); }} loading={saving} disabled={!writable || !preparation.ready || saving || uncertain} fullWidth />
        </View>
      </KeyboardAvoidingView>}
  </View>;
}
