import React, { useEffect, useId, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, X } from 'lucide-react-native';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
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
      <Pressable accessibilityRole="button" accessibilityLabel="Close product catalog" onPress={onClose} style={styles.closeButton}><X size={20} color={colors.textPrimary} /></Pressable>
    </View>
    <View style={styles.sheetSearch}>
      <TextField accessibilityLabel="Search product catalog" value={search}
        onChangeText={value => { setSearch(value); setLookup(null); }} placeholder="Product, SKU, or supplier barcode"
        autoCapitalize="none" autoCorrect={false} showClearButton leftIcon={<Search size={18} color={colors.textMuted} />}
        onSubmitEditing={() => setServerSearch(search.trim())} />
    </View>
    {!lookup && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
      {[{ id: '', name: 'All Products' }, ...(categories.data?.items ?? [])].map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected: categoryId === category.id }} onPress={() => setCategoryId(category.id)} style={[styles.categoryChip, categoryId === category.id && styles.categorySelected]}><Text variant="caption" color={categoryId === category.id ? colors.primaryText : colors.textSecondary}>{category.name}</Text></Pressable>)}
    </ScrollView>}
    {!canRead ? <EmptyState compact title="Catalog Unavailable" message="Your account cannot access products." />
      : lookup && !canResolve ? <EmptyState compact title="Lookup Unavailable" message="Your account cannot look up product codes." actionTitle="Browse Catalog" onAction={browse} />
      : <FlatList style={styles.catalogList} contentContainerStyle={styles.catalogContent} keyboardShouldPersistTaps="handled" data={choices} keyExtractor={item => item.id}
        ListHeaderComponent={error && choices.length ? <EmptyState compact title="Could Not Refresh Products" actionTitle="Retry" onAction={retry} />
          : lookup && resolved.data?.kind === 'choose' ? <View style={styles.lookupNotice}>
            <Text variant="bodyMedium">{multiple ? 'Multiple Products Match This Code' : 'Confirm The Product'}</Text>
            <Text variant="caption">{multiple ? 'Select the correct product.' : 'Choose a product or refine your search.'}</Text>
            <Button title="Browse Catalog" variant="outline" size="sm" onPress={browse} />
          </View> : busy && choices.length ? <ActivityIndicator color={colors.primary} accessibilityLabel="Refreshing products" /> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedProduct?.id === item.id, disabled: busy || !!error || !item.isActive }}
          accessibilityLabel={`${item.name}, ${item.sku}`} disabled={busy || !!error || !item.isActive}
          onPress={() => onSelect(item)} style={[styles.catalogRow, selectedProduct?.id === item.id && styles.catalogSelected, (busy || !!error || !item.isActive) && styles.disabled]}>
          <View style={styles.flex}><Text variant="bodyMedium">{item.name}</Text><Text variant="code" color={colors.textSecondary}>{item.sku}</Text></View>
          {selectedProduct?.id === item.id ? <Check size={18} color={colors.primaryText} /> : null}
        </Pressable>}
        ListEmptyComponent={busy ? <View style={styles.lookupNotice}><ActivityIndicator color={colors.primary} /><Text variant="body" textAlign="center">{lookup ? 'Looking Up Product…' : 'Loading Products…'}</Text></View>
          : <EmptyState compact title={notFound ? 'No Active Product Found' : error ? lookup ? 'Lookup Unavailable' : 'Catalog Unavailable' : lookup ? 'Refine Your Search' : 'No Products Found'}
            message={notFound ? 'Check the barcode or choose from the catalog.' : error ? getUserErrorMessage(error, 'Products could not be loaded.') : undefined}
            actionTitle={notFound || lookup && !error ? 'Browse Catalog' : error ? 'Retry' : undefined}
            onAction={notFound || lookup && !error ? browse : retry} />}
        ListFooterComponent={!lookup && products.data && products.data.total > products.data.items.length ? <Text variant="caption" color="textSecondary">Refine your search to see more products.</Text> : null} />}
  </BottomSheet>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 3 },
  sheetHeader: { paddingHorizontal: 18, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  sheetSearch: { paddingHorizontal: 18, paddingBottom: 10 },
  categoryScroll: { flexGrow: 0 },
  categoryRow: { paddingHorizontal: 18, gap: 8, paddingBottom: 10 },
  categoryChip: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle },
  categorySelected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  catalogList: { flex: 1, minHeight: 0 },
  catalogContent: { padding: 18, gap: 8, paddingBottom: 32 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  catalogSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  lookupNotice: { paddingVertical: 16, gap: 12 },
  disabled: { opacity: 0.5 },
});
