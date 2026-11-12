import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, FileText, Plus, Search, Warehouse } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { listStockVouchers } from '../../shared/api/warehouseApi';
import type { StockVoucherStatus, StockVoucherType } from '../../shared/types/contracts';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
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
  const [dropdown, setDropdown] = useState<'warehouse' | 'status' | null>(null);
  const openDropdown = (value: 'warehouse' | 'status') => { Keyboard.dismiss(); setDropdown(current => current === value ? null : value); };
  useEffect(() => {
    if (!dropdown) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => { setDropdown(null); return true; });
    return () => back.remove();
  }, [dropdown]);
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

  return <View style={styles.screen} onAccessibilityEscape={() => setDropdown(null)}>
    <ScreenHeader title="Stock Vouchers" canGoBack onBack={() => { if (dropdown) setDropdown(null); else goBack(); }} rightAction={allowed ?
      <Pressable accessibilityRole="button" accessibilityLabel="Create stock voucher" accessibilityState={{ disabled: !canCreate }} disabled={!canCreate}
        onPress={() => { if (dropdown) setDropdown(null); else newVoucher(); }} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Plus size={21} color={canCreate ? colors.primaryText : colors.textMuted} /></Pressable> : undefined} />
    {!allowed ? <EmptyState title="Voucher Access Unavailable" message="Sign in with a Staff or Admin account." /> :
      <ScrollView scrollEnabled={!dropdown} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        refreshControl={<RefreshControl refreshing={warehouseQuery.isRefetching || vouchers.isRefetching && !vouchers.isFetchingNextPage} onRefresh={refresh} tintColor={colors.primary} />}>
        <View style={[styles.toolbar, dropdown === 'warehouse' && styles.dropdownLayer]}>
          <View style={[styles.dropdownAnchor, dropdown === 'warehouse' && styles.dropdownLayer]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose warehouse" accessibilityState={{ expanded: dropdown === 'warehouse' }} disabled={!warehouses.length} onPress={() => openDropdown('warehouse')} style={styles.warehouse}>
            <Warehouse size={17} color={colors.textSecondary} /><Text variant="bodyMedium" style={{ flexShrink: 1 }}>{warehouse?.name || (warehouseQuery.isPending ? 'Loading Warehouses…' : 'Choose Warehouse')}</Text>
            {warehouses.length > 0 && <ChevronDown size={15} color={colors.textMuted} />}
          </Pressable>
          {dropdown === 'warehouse' && <View style={styles.warehouseMenu} accessibilityLabel="Warehouses">
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.dropdownScroll}>
              {warehouses.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: warehouse?.id === item.id }}
                onPress={() => { setDropdown(null); replace('stock_vouchers', { warehouseId: item.id }); }} style={({ pressed }) => [styles.dropdownOption, warehouse?.id === item.id && styles.dropdownSelected, pressed && styles.pressed]}>
                <Text variant="body" style={{ flex: 1 }}>{item.name}</Text>{warehouse?.id === item.id && <Check size={16} color={colors.primary} />}
              </Pressable>)}
            </ScrollView>
          </View>}
          </View>
          <SegmentedControl value={type} onChange={value => { setDropdown(null); setType(value); }} accessibilityLabel="Voucher type" options={[{ label: 'All', value: 'ALL' }, { label: 'Inbound', value: 'INBOUND' }, { label: 'Outbound', value: 'OUTBOUND' }]} />
          <TextField value={search} onFocus={() => setDropdown(null)} onChangeText={setSearch} placeholder="Voucher code or reference" accessibilityLabel="Search vouchers" maxLength={100}
            autoCapitalize="none" autoCorrect={false} showClearButton leftIcon={<Search size={18} color={colors.textMuted} />} />
        </View>
        {warehouseError && <View style={styles.error}><Text variant="body" color="dangerText">{warehouseError}</Text><Button title="Retry" variant="outline" size="sm" onPress={() => { void warehouseQuery.refetch(); }} /></View>}
        {!warehouse && !warehouseError ? warehouseQuery.isPending ? <View style={styles.state}><ActivityIndicator color={colors.primary} /></View> :
          <EmptyState compact icon={Warehouse} title={warehouses.length ? 'Choose A Warehouse' : 'No Active Warehouses'}
            actionTitle={warehouses.length ? 'Choose Warehouse' : 'Retry'} onAction={warehouses.length ? () => openDropdown('warehouse') : () => { void warehouseQuery.refetch(); }} /> : null}
        {warehouse && <>
          <View style={[styles.statusBar, dropdown === 'status' && styles.dropdownLayer]}>
            <Text variant="caption" color="textSecondary">{pages.length ? `${pages[0].total} vouchers` : 'Vouchers'}</Text>
            <View style={[styles.dropdownAnchor, dropdown === 'status' && styles.dropdownLayer]}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: dropdown === 'status' }} accessibilityLabel="Filter voucher status" onPress={() => openDropdown('status')} style={styles.statusFilter}>
              <Text variant="caption">{STATUSES.find(item => item.value === status)?.label}</Text><ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
            {dropdown === 'status' && <View style={styles.statusMenu} accessibilityLabel="Voucher status">
              {STATUSES.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: status === item.value }}
                onPress={() => { setStatus(item.value); setDropdown(null); }} style={({ pressed }) => [styles.dropdownOption, status === item.value && styles.dropdownSelected, pressed && styles.pressed]}>
                <Text variant="body" style={{ flex: 1 }}>{item.label}</Text>{status === item.value && <Check size={16} color={colors.primary} />}
              </Pressable>)}
            </View>}
            </View>
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
        {dropdown && <Pressable style={[StyleSheet.absoluteFill, styles.dropdownDismiss]} accessibilityRole="button" accessibilityLabel="Close dropdown" onPress={() => setDropdown(null)} />}
      </ScrollView>}
  </View>;
}
