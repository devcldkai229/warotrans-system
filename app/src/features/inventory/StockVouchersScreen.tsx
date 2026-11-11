import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, FileText, Plus, Search, Warehouse, X } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { listStockVouchers } from '../../shared/api/warehouseApi';
import type { StockVoucherStatus, StockVoucherType } from '../../shared/types/contracts';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, EmptyState, ScreenHeader, SegmentedControl, StatusPill, Text, TextField } from '../../shared/ui';
import { canCreateVoucher, incompleteVoucherPages, nextVoucherPage, voucherDate, voucherRows } from './stockVoucherData';
import { useVoucherWarehouse } from './useVoucherWarehouse';
import { createVoucherStyles } from './voucherStyles';

const STATUSES = [
  { value: '', label: 'All Statuses' }, { value: 'DRAFT', label: 'Draft' },
  { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'CANCELLED', label: 'Cancelled' },
] as const;

export function StockVouchersScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { navigate, replace, goBack } = useNavigation();
  const insets = useSafeAreaInsets();
  const { session, allowed, query: warehouseQuery, warehouse, warehouses, selectionError } = useVoucherWarehouse();
  const [type, setType] = useState<StockVoucherType | 'ALL'>('ALL');
  const [status, setStatus] = useState<StockVoucherStatus | ''>('');
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [sheet, setSheet] = useState<'warehouse' | 'status' | null>(null);
  useEffect(() => { const timer = setTimeout(() => setServerSearch(search.trim()), 250); return () => clearTimeout(timer); }, [search]);
  const vouchers = useInfiniteQuery({
    queryKey: ['stock-vouchers', session?.id, warehouse?.id, type, status, serverSearch],
    queryFn: ({ pageParam, signal }) => listStockVouchers({ warehouseId: warehouse!.id, type: type === 'ALL' ? undefined : type,
      status: status || undefined, search: serverSearch || undefined, skip: pageParam, take: 25 }, signal),
    initialPageParam: 0,
    getNextPageParam: nextVoucherPage,
    enabled: allowed && !!warehouse && !warehouseQuery.isError,
    staleTime: 0,
    refetchInterval: 15_000,
    retry: false,
  });
  const denied = vouchers.error instanceof ApiError && [401, 403].includes(vouchers.error.status);
  const pages = denied ? [] : vouchers.data?.pages || [];
  const rows = voucherRows(pages);
  const filtered = type !== 'ALL' || !!status || !!search.trim();
  const canCreate = canCreateVoucher(session) && !!warehouse && !warehouseQuery.isError;
  const newVoucher = () => { if (canCreate) navigate('stock_voucher_create', { warehouseId: warehouse!.id, voucherType: type === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND' }); };
  const clearFilters = () => { setType('ALL'); setStatus(''); setSearch(''); setServerSearch(''); };
  const refresh = () => { void warehouseQuery.refetch(); if (warehouse) void vouchers.refetch(); };
  const warehouseError = selectionError || (warehouseQuery.error ? getUserErrorMessage(warehouseQuery.error, 'Warehouses could not be loaded.') : null);

  return <View style={styles.screen}>
    <ScreenHeader title="Stock Vouchers" canGoBack onBack={goBack} rightAction={allowed ?
      <Pressable accessibilityRole="button" accessibilityLabel="Create stock voucher" accessibilityState={{ disabled: !canCreate }} disabled={!canCreate}
        onPress={newVoucher} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Plus size={21} color={canCreate ? colors.primaryText : colors.textMuted} /></Pressable> : undefined} />
    {!allowed ? <EmptyState title="Voucher Access Unavailable" message="Sign in with a Staff or Admin account." /> :
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        refreshControl={<RefreshControl refreshing={warehouseQuery.isRefetching || vouchers.isRefetching && !vouchers.isFetchingNextPage} onRefresh={refresh} tintColor={colors.primary} />}>
        <View style={styles.toolbar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose warehouse" disabled={!warehouses.length} onPress={() => setSheet('warehouse')} style={styles.warehouse}>
            <Warehouse size={17} color={colors.textSecondary} /><Text variant="bodyMedium" style={{ flexShrink: 1 }}>{warehouse?.name || (warehouseQuery.isPending ? 'Loading Warehouses…' : 'Choose Warehouse')}</Text>
            {warehouses.length > 1 && <ChevronDown size={15} color={colors.textMuted} />}
          </Pressable>
          <SegmentedControl value={type} onChange={setType} accessibilityLabel="Voucher type" options={[{ label: 'All', value: 'ALL' }, { label: 'Inbound', value: 'INBOUND' }, { label: 'Outbound', value: 'OUTBOUND' }]} />
          <TextField value={search} onChangeText={setSearch} placeholder="Voucher code or reference" accessibilityLabel="Search vouchers" maxLength={100}
            autoCapitalize="none" autoCorrect={false} showClearButton leftIcon={<Search size={18} color={colors.textMuted} />} />
        </View>
        {warehouseError && <View style={styles.error}><Text variant="body" color="dangerText">{warehouseError}</Text><Button title="Retry" variant="outline" size="sm" onPress={() => { void warehouseQuery.refetch(); }} /></View>}
        {!warehouse && !warehouseError ? warehouseQuery.isPending ? <View style={styles.state}><ActivityIndicator color={colors.primary} /></View> :
          <EmptyState compact icon={Warehouse} title={warehouses.length ? 'Choose A Warehouse' : 'No Active Warehouses'}
            actionTitle={warehouses.length ? 'Choose Warehouse' : 'Retry'} onAction={warehouses.length ? () => setSheet('warehouse') : () => { void warehouseQuery.refetch(); }} /> : null}
        {warehouse && <>
          <View style={styles.statusBar}>
            <Text variant="caption" color="textSecondary">{pages.length ? `${pages[0].total} vouchers` : 'Vouchers'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Filter voucher status" onPress={() => setSheet('status')} style={styles.statusFilter}>
              <Text variant="caption">{STATUSES.find(item => item.value === status)?.label}</Text><ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
          </View>
          {vouchers.error && rows.length > 0 && <View style={styles.error}><Text variant="caption" color="dangerText">{vouchers.isFetchNextPageError ? 'Could not load more vouchers.' : 'Could not refresh. Showing the last loaded vouchers.'}</Text>
            <Button title="Retry" variant="outline" size="sm" onPress={() => { if (vouchers.isFetchNextPageError) void vouchers.fetchNextPage(); else void vouchers.refetch(); }} /></View>}
          {rows.length ? <View style={styles.ledger}>{rows.map(item => <Pressable key={item.id}
            onPress={() => navigate('stock_voucher_detail', { voucherId: item.id, warehouseId: warehouse.id })}
            disabled={search.trim() !== serverSearch} accessibilityRole="button" accessibilityLabel={`${item.code}, ${item.type}, ${item.status}, ${item.containerCount} containers`}
            style={({ pressed }) => [styles.ledgerRow, pressed && styles.pressed]}>
            <View style={[styles.direction, item.type === 'OUTBOUND' && styles.outbound]}>{item.type === 'INBOUND' ? <ArrowDownLeft size={20} color={colors.primaryText} /> : <ArrowUpRight size={20} color={colors.warningText} />}</View>
            <View style={styles.flex}>
              <View style={styles.between}><Text variant="bodyMedium" numberOfLines={1} style={{ flex: 1 }}>{item.code}</Text><StatusPill status={item.status} /></View>
              <View style={styles.ledgerMeta}><Text variant="caption" color="textSecondary">{item.type === 'INBOUND' ? 'Inbound' : 'Outbound'}</Text><Text variant="caption">{item.containerCount} {item.containerCount === 1 ? 'container' : 'containers'}</Text></View>
              <Text variant="caption" color="textMuted">{voucherDate(item.createdAt)}</Text>
              {!!item.referenceNo && <Text variant="caption" color="textSecondary" numberOfLines={1}>{item.referenceNo}</Text>}
            </View><ChevronRight size={16} color={colors.textMuted} />
          </Pressable>)}</View> : vouchers.isPending && !warehouseQuery.isError ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text variant="caption">Loading Vouchers…</Text></View>
            : vouchers.error ? <EmptyState compact icon={FileText} title="Vouchers Unavailable" message={getUserErrorMessage(vouchers.error, 'Vouchers could not be loaded.')} actionTitle="Retry" onAction={() => { void vouchers.refetch(); }} />
              : incompleteVoucherPages(pages) ? <EmptyState compact icon={FileText} title="Vouchers Could Not Be Loaded" actionTitle="Refresh" onAction={() => { void vouchers.refetch(); }} />
              : !warehouseQuery.isError ? <EmptyState compact icon={FileText} title={filtered ? 'No Matching Vouchers' : 'No Vouchers Yet'}
                message={filtered ? undefined : 'Create an inbound or outbound draft.'} actionTitle={filtered ? 'Clear Filters' : canCreate ? 'New Voucher' : undefined} onAction={filtered ? clearFilters : newVoucher} /> : null}
          {vouchers.hasNextPage && <Button title={vouchers.isFetchingNextPage ? 'Loading…' : 'Load More'} variant="outline" loading={vouchers.isFetchingNextPage} disabled={vouchers.isFetchingNextPage} onPress={() => { void vouchers.fetchNextPage(); }} />}
          {!!rows.length && incompleteVoucherPages(pages) && <View style={styles.error}><Text variant="caption">Some vouchers could not be loaded.</Text><Button title="Refresh" variant="outline" size="sm" onPress={() => { void vouchers.refetch(); }} /></View>}
        </>}
      </ScrollView>}
    {sheet && <BottomSheet onClose={() => setSheet(null)} accessibilityLabel={sheet === 'warehouse' ? 'warehouses' : 'voucher status'}>
      <View style={styles.sheetHeader}><Text variant="headline">{sheet === 'warehouse' ? 'Warehouse' : 'Status'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Close filter" style={styles.iconButton} onPress={() => setSheet(null)}><X size={18} color={colors.textPrimary} /></Pressable></View>
      <ScrollView contentContainerStyle={styles.sheetContent}>
        {sheet === 'warehouse' ? warehouses.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: warehouse?.id === item.id }}
          onPress={() => { setSheet(null); replace('stock_vouchers', { warehouseId: item.id }); }} style={styles.sheetRow}><Text variant="body">{item.name}</Text>{warehouse?.id === item.id && <Check size={18} color={colors.primary} />}</Pressable>)
          : STATUSES.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: status === item.value }} onPress={() => { setStatus(item.value); setSheet(null); }} style={styles.sheetRow}><Text variant="body">{item.label}</Text>{status === item.value && <Check size={18} color={colors.primary} />}</Pressable>)}
      </ScrollView>
    </BottomSheet>}
  </View>;
}
