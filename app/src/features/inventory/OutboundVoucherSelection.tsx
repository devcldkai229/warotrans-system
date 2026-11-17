import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Box, Check, ScanLine, Search } from 'lucide-react-native';
import { getUserErrorMessage } from '../../shared/api/client';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, Text, TextField } from '../../shared/ui';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { createVoucherStyles } from './voucherStyles';
import { loadOutboundPreview, staleOutboundSelections } from './outboundPreparation';
import type { VoucherPreparation } from './voucherPreparation';

interface Props {
  accountId: string; warehouseId: string; value: VoucherPreparation;
  onReview: () => void;
  onReadinessChange?: (ready: boolean) => void;
  showReviewAction?: boolean;
  editable?: boolean;
  update: (apply: (value: VoucherPreparation) => VoucherPreparation) => void;
}
export function OutboundVoucherSelection({ accountId, warehouseId, value, update, onReview, onReadinessChange, showReviewAction = true, editable = true }: Props) {
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
  const ready = usable && selected.length > 0 && missing.length === 0;
  useEffect(() => { onReadinessChange?.(ready); }, [ready, onReadinessChange]);
  return <Card gap={14} style={styles.reviewCard}>
    <View style={styles.between}><Text variant="headline">Select Containers</Text><Button title="Refresh" variant="ghost" size="sm" style={styles.editButton} loading={query.isFetching} disabled={!editable || query.isFetching} onPress={() => { void query.refetch(); }} /></View>
    <View style={styles.row}>
      <TextField containerStyle={{ flex: 1 }} accessibilityLabel="Search outbound containers" placeholder="Barcode, Product Or SKU" value={search} onChangeText={value => { setSearch(value); setLimit(25); }} editable={editable} showClearButton autoCapitalize="none" autoCorrect={false} leftIcon={<Search size={18} color={colors.textMuted} />} />
      <Pressable disabled={!editable} style={({ pressed }) => [styles.iconButton, pressed && editable && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Scan container barcode')} onPress={() => setScanner(true)}><ScanLine size={20} color={colors.primaryText} /></Pressable>
    </View>
    {query.isPending || query.isFetching ? <Text variant="body" color="textSecondary">Checking Locations…</Text> : query.isError ? <EmptyState compact title="Containers Unavailable" message={getUserErrorMessage(query.error, 'Refresh to try again.')} /> : <>
      <View style={styles.between}>
        <Text variant="caption" color="textSecondary" style={styles.tabular}>{t('{count} matching containers', { count: visible.length })}</Text>
        <View style={[styles.statusPill, !!selected.length && styles.statusPillActive]}>
          <Text variant="caption" color={selected.length ? 'primaryText' : 'textSecondary'} style={[styles.tabular, { fontWeight: '600' }]}>{t('{count} selected', { count: selected.length })}</Text>
        </View>
      </View>
      {!visible.length && <EmptyState compact title={term ? 'No Matching Containers' : 'No Containers At Outbound'} />}
      {visible.slice(0, limit).map((item, index, list) => {
        const checked = !!value.selected[item.id];
        return <Pressable key={item.id} disabled={!editable}
          style={({ pressed }) => [styles.selectableRow, checked && styles.selectableRowActive, index === list.length - 1 && !checked && { borderBottomWidth: 0 }, pressed && editable && styles.pressed]}
          accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${item.barcode}, ${item.productName}`}
          onPress={() => update(previous => {
            const next = { ...previous.selected };
            if (next[item.id]) delete next[item.id];
            else next[item.id] = { id: item.id, barcode: item.barcode, productName: item.productName, productSku: item.productSku, endpointId: item.currentEndpointId! };
            return { ...previous, selected: next };
          })}>
          <View style={styles.summaryIcon}><Box size={18} strokeWidth={1.8} color={colors.primaryText} /></View>
          <View style={styles.summaryInfo}>
            <Text variant="code">{item.barcode}</Text>
            <Text variant="bodyMedium" numberOfLines={1}>{item.productName}</Text>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>{item.productSku} · {item.currentStorageLocationCode || 'Location reported'}</Text>
          </View>
          <View style={[styles.checkCircle, checked && styles.checkCircleActive]}>
            {checked && <Check size={14} strokeWidth={2.6} color={colors.textInverse} />}
          </View>
        </Pressable>;
      })}
      {visible.length > limit && <Button title="Show More" variant="outline" onPress={() => setLimit(value => value + 25)} />}
    </>}
    {usable && !!missing.length && <Text variant="caption" color="dangerText" accessibilityRole="alert">{missing.length} selected container(s) no longer match this location preview. Remove or refresh before review.</Text>}
    {showReviewAction && <Button title="Review Selection" variant="outline" disabled={!editable || !ready} onPress={onReview} />}
    {scanner && <BarcodeScannerHUD visible onClose={() => setScanner(false)} onScanResult={barcode => { setScanner(false); setSearch(barcode); setLimit(25); }} />}
  </Card>;
}
