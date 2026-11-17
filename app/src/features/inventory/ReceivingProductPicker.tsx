import React, { useEffect, useId, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Box, Check, Search, X } from 'lucide-react-native';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { t } from '../../shared/i18n';
import { listProductCategories, listProducts, type ProductItem } from '../../shared/api/warehouseApi';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, EmptyState, Text, TextField } from '../../shared/ui';
import { lookupReceivingProduct } from './productLookup';

interface Props {
  selectedProduct: ProductItem | null;
  initialBarcode: string | null;
  onSelect: (product: ProductItem) => void;
  onClose: () => void;
}

/** Owns the catalog and exact-code lookup; closing the picker cancels its requests. */
export function ReceivingProductPicker({ selectedProduct, initialBarcode, onSelect, onClose }: Props) {
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const scope = useId();
  const [search, setSearch] = useState(initialBarcode || '');
  const [serverSearch, setServerSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [lookup, setLookup] = useState(initialBarcode);
  const canRead = sessionCan(session, PERMISSIONS.warehouseRead);
  const canResolve = canRead && (session?.role === 'STAFF' || session?.role === 'ADMIN');
  const categories = useQuery({ queryKey: ['receiving-product-categories', session?.id], queryFn: ({ signal }) => listProductCategories(signal), enabled: canRead && !lookup });
  const products = useQuery({
    queryKey: ['receiving-products', session?.id, serverSearch, categoryId],
    queryFn: ({ signal }) => listProducts({ isActive: true, take: 100, search: serverSearch || undefined, categoryId: categoryId || undefined }, signal),
    enabled: canRead && !lookup,
    staleTime: 0,
    retry: false,
  });
  const resolved = useQuery({
    // A fresh attempt must not auto-select a cached Product that has since become inactive.
    queryKey: ['receiving-product-lookup', session?.id, scope, lookup],
    queryFn: ({ signal }) => lookupReceivingProduct(lookup!, signal),
    enabled: canResolve && !!lookup,
    retry: false,
    gcTime: 0,
    staleTime: 0,
  });
  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (lookup && resolved.isSuccess && !resolved.isFetching && resolved.data.kind === 'matched') onSelect(resolved.data.product);
  }, [lookup, resolved.data, resolved.isSuccess, resolved.isFetching, onSelect]);

  const browse = () => { setLookup(null); setSearch(''); setServerSearch(''); setCategoryId(''); };
  const retry = () => { if (lookup) void resolved.refetch(); else void products.refetch(); };
  const error = lookup ? resolved.error : products.error;
  const denied = error instanceof ApiError && [401, 403].includes(error.status);
  const choices = denied ? [] : lookup ? resolved.data?.kind === 'choose' ? resolved.data.products : [] : products.data?.items ?? [];
  const busy = lookup ? resolved.isFetching : products.isFetching || search.trim() !== serverSearch;
  const notFound = error instanceof ApiError && error.status === 404 && error.code === 'product_not_found';
  const multiple = lookup && resolved.data?.kind === 'choose' && resolved.data.reason === 'multiple';

  return <BottomSheet onClose={onClose} accessibilityLabel="product catalog">
    <View style={styles.sheetHeader}>
      <Text variant="headline">Choose Product</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Close product catalog')} onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
        <View style={styles.closeCircle}><X size={16} strokeWidth={2.2} color={colors.textSecondary} /></View>
      </Pressable>
    </View>
    <View style={styles.sheetSearch}>
      <TextField accessibilityLabel="Search product catalog" value={search}
        onChangeText={value => { setSearch(value); setLookup(null); if (!value.trim()) setServerSearch(''); }} placeholder="Search by name or SKU"
        fieldStyle={styles.searchField} inputStyle={styles.searchInput}
        autoCapitalize="none" autoCorrect={false} showClearButton leftIcon={<Search size={17} color={colors.textMuted} />}
        onSubmitEditing={() => setServerSearch(search.trim())} />
    </View>
    {!lookup && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
      {[{ id: '', name: 'All Products' }, ...(categories.data?.items ?? [])].map(category => {
        const selected = categoryId === category.id;
        return <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected }} hitSlop={{ top: 6, bottom: 6 }} onPress={() => setCategoryId(category.id)} style={({ pressed }) => [styles.categoryChip, selected && styles.categorySelected, pressed && styles.pressed]}>
          <Text variant="caption" color={selected ? colors.primaryText : colors.textSecondary} style={selected ? styles.categorySelectedText : undefined}>{category.name}</Text>
        </Pressable>;
      })}
    </ScrollView>}
    {!canRead ? <EmptyState compact title="Catalog Unavailable" message="Your account cannot access products." />
      : lookup && !canResolve ? <EmptyState compact title="Lookup Unavailable" message="Your account cannot look up product codes." actionTitle="Browse Catalog" onAction={browse} />
      : <FlatList style={styles.catalogList} contentContainerStyle={styles.catalogContent} keyboardShouldPersistTaps="handled" data={choices} keyExtractor={item => item.id}
        ListHeaderComponent={error && choices.length ? <EmptyState compact title="Could Not Refresh Products" actionTitle="Retry" onAction={retry} />
          : lookup && resolved.data?.kind === 'choose' ? <View style={styles.lookupNotice}>
            <Text variant="bodyMedium">{multiple ? 'Multiple Products Match This Code' : 'Confirm The Product'}</Text>
            <Text variant="caption">{multiple ? 'Select the correct product.' : 'Choose a product or refine your search.'}</Text>
            <Button title="Browse Catalog" variant="outline" size="sm" onPress={browse} />
          </View> : busy && choices.length ? <ActivityIndicator color={colors.primary} accessibilityLabel={t('Refreshing products')} /> : undefined}
        renderItem={({ item, index }) => {
          const isSelected = selectedProduct?.id === item.id;
          const isFirst = index === 0;
          const isLast = index === choices.length - 1;
          const isDisabled = busy || !!error || !item.isActive;
          return <Pressable accessibilityRole="radio" accessibilityState={{ checked: isSelected, disabled: isDisabled }}
            accessibilityLabel={`${item.name}, ${item.sku}`} disabled={isDisabled}
            onPress={() => onSelect(item)} style={({ pressed }) => [
              styles.catalogRow,
              isFirst && styles.catalogRowFirst,
              isLast && styles.catalogRowLast,
              !isLast && styles.catalogRowDivider,
              isSelected && styles.catalogSelected,
              pressed && !isDisabled && styles.catalogPressed,
              isDisabled && styles.disabled,
            ]}>
            <View style={[styles.rowIcon, isSelected && styles.rowIconSelected]}>
              <Box size={18} strokeWidth={1.8} color={isSelected ? colors.primaryText : colors.textSecondary} />
            </View>
            <View style={styles.flex}><Text variant="bodyMedium" numberOfLines={1}>{item.name}</Text><Text variant="code" color={colors.textSecondary} numberOfLines={1}>{item.sku}</Text></View>
            {isSelected ? <Check size={18} strokeWidth={2.4} color={colors.primaryText} /> : null}
          </Pressable>;
        }}
        ListEmptyComponent={busy ? <View style={styles.lookupNotice}><ActivityIndicator color={colors.primary} /><Text variant="body" textAlign="center">{lookup ? 'Looking Up Product…' : 'Loading Products…'}</Text></View>
          : <EmptyState compact title={notFound ? 'No Active Product Found' : error ? lookup ? 'Lookup Unavailable' : 'Catalog Unavailable' : lookup ? 'Refine Your Search' : 'No Products Found'}
            message={notFound ? 'Check the barcode or choose from the catalog.' : error ? getUserErrorMessage(error, 'Products could not be loaded.') : undefined}
            actionTitle={notFound || lookup && !error ? 'Browse Catalog' : error ? 'Retry' : undefined}
            onAction={notFound || lookup && !error ? browse : retry} />}
        ListFooterComponent={!lookup && products.data && products.data.total > products.data.items.length ? <Text variant="caption" color="textSecondary">Refine your search to see more products.</Text> : undefined} />}
  </BottomSheet>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  sheetHeader: { paddingHorizontal: 18, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { minHeight: 44, minWidth: 44, marginRight: -7, alignItems: 'center', justifyContent: 'center' },
  closeCircle: { width: 30, height: 30, borderRadius: radii.full, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  sheetSearch: { paddingHorizontal: 18, paddingBottom: 10 },
  searchField: { minHeight: 42, backgroundColor: colors.surfaceSubtle, borderColor: 'transparent', borderRadius: radii.md, borderCurve: 'continuous' },
  searchInput: { paddingVertical: 8 },
  categoryScroll: { flexGrow: 0 },
  categoryRow: { paddingHorizontal: 18, gap: 8, paddingBottom: 12 },
  categoryChip: { minHeight: 32, paddingHorizontal: 13, paddingVertical: 5, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle },
  categorySelected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  categorySelectedText: { fontWeight: '600' },
  catalogList: { flex: 1, minHeight: 0 },
  catalogContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 32 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
  catalogRowFirst: { borderTopWidth: 1, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderCurve: 'continuous' },
  catalogRowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radii.lg, borderBottomRightRadius: radii.lg, borderCurve: 'continuous' },
  catalogRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  catalogSelected: { backgroundColor: colors.primaryLight },
  catalogPressed: { backgroundColor: colors.surfaceSubtle },
  rowIcon: { width: 36, height: 36, borderRadius: radii.sm, borderCurve: 'continuous', backgroundColor: colors.surfaceSubtle, alignItems: 'center', justifyContent: 'center' },
  rowIconSelected: { backgroundColor: colors.surface },
  lookupNotice: { paddingVertical: 16, gap: 12 },
  disabled: { opacity: 0.5 },
});
