import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, ScanLine, Search, Square } from 'lucide-react-native';
import { getUserErrorMessage } from '../../shared/api/client';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, Text, TextField } from '../../shared/ui';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { createVoucherStyles } from './voucherStyles';
import { loadOutboundPreview, staleOutboundSelections } from './outboundPreparation';
import type { VoucherPreparation } from './voucherPreparation';

interface Props {
  accountId: string; warehouseId: string; value: VoucherPreparation;
  onReview: () => void;
  update: (apply: (value: VoucherPreparation) => VoucherPreparation) => void;
}
export function OutboundVoucherSelection({ accountId, warehouseId, value, update, onReview }: Props) {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(25);
  const [scanner, setScanner] = useState(false);
  const query = useQuery({ queryKey: ['outbound-voucher-preview', accountId, warehouseId], queryFn: ({ signal }) => loadOutboundPreview(warehouseId, signal), staleTime: 0, retry: false });
  // During failure/refetch, stale candidates must not remain selectable.
  const usable = !query.isFetching && !query.isError && !!query.data;
  const candidates = usable ? query.data!.items : [];
  const term = search.trim().toLocaleLowerCase();
  const visible = candidates.filter(item => [item.barcode, item.productSku, item.productName].some(field => field.toLocaleLowerCase().includes(term)));
  const selected = Object.values(value.selected);
  const missing = staleOutboundSelections(selected, candidates);
  return <Card gap={14}>
    <View style={styles.between}><Text variant="headline">Select Containers</Text><Button title="Refresh" variant="ghost" size="sm" loading={query.isFetching} onPress={() => { void query.refetch(); }} /></View>
    <Text variant="caption" color="textSecondary">Location preview only. Server readiness checks and saving the selection are pending.</Text>
    <View style={styles.row}>
      <TextField containerStyle={{ flex: 1 }} accessibilityLabel="Search outbound containers" placeholder="Barcode, Product Or SKU" value={search} onChangeText={value => { setSearch(value); setLimit(25); }} leftIcon={<Search size={18} color={colors.textMuted} />} />
      <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Scan container barcode" onPress={() => setScanner(true)}><ScanLine size={22} color={colors.primaryText} /></Pressable>
    </View>
    {query.isPending || query.isFetching ? <Text variant="body">Checking Locations…</Text> : query.isError ? <EmptyState compact title="Containers Unavailable" message={getUserErrorMessage(query.error, 'Refresh to try again.')} /> : <>
      <Text variant="caption" color="textSecondary">{selected.length} selected · {visible.length} matching containers</Text>
      {!visible.length && <EmptyState compact title={term ? 'No Matching Containers' : 'No Containers At Outbound'} />}
      {visible.slice(0, limit).map(item => <Pressable key={item.id} style={[styles.containerRow, styles.row]} accessibilityRole="checkbox" accessibilityState={{ checked: !!value.selected[item.id] }} accessibilityLabel={`${item.barcode}, ${item.productName}`}
        onPress={() => update(previous => {
          const next = { ...previous.selected };
          if (next[item.id]) delete next[item.id];
          else next[item.id] = { id: item.id, barcode: item.barcode, productName: item.productName, productSku: item.productSku, endpointId: item.currentEndpointId! };
          return { ...previous, selected: next };
        })}>
        {value.selected[item.id] ? <Check size={22} color={colors.primaryText} /> : <Square size={22} color={colors.textMuted} />}
        <View style={styles.flex}><Text variant="code">{item.barcode}</Text><Text variant="bodyMedium">{item.productName}</Text><Text variant="caption" color="textSecondary">{item.productSku} · {item.currentStorageLocationCode || 'Location reported'}</Text></View>
      </Pressable>)}
      {visible.length > limit && <Button title="Show More" variant="outline" onPress={() => setLimit(value => value + 25)} />}
    </>}
    {!!selected.length && <View style={styles.formSection}>
      <Text variant="label">Selected On This Device</Text>
      {selected.map(item => <View key={item.id} style={styles.between}><View style={styles.flex}><Text variant="code" selectable>{item.barcode}</Text><Text variant="caption">{item.productName}</Text></View><Button title="Remove" variant="ghost" size="sm" onPress={() => update(previous => { const next = { ...previous.selected }; delete next[item.id]; return { ...previous, selected: next }; })} /></View>)}
      {usable && !!missing.length && <Text variant="caption" color="dangerText" accessibilityRole="alert">{missing.length} selected container(s) no longer match this location preview. Remove or refresh before review.</Text>}
    </View>}
    <Button title="Review Selection" variant="outline" disabled={!usable || !selected.length || !!missing.length} onPress={onReview} />
    {scanner && <BarcodeScannerHUD visible onClose={() => setScanner(false)} onScanResult={barcode => { setScanner(false); setSearch(barcode); setLimit(25); }} />}
  </Card>;
}
