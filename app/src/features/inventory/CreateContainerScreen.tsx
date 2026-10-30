import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, Check, CheckCircle2, ChevronRight, MapPin, Minus, Plus, ScanLine, Search, X } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, Card, EmptyState, Text, TextField } from '../../shared/ui';
import { createContainer, getMapVersionDetail, listProductCategories, listProducts, listStorageLocations } from '../../shared/api';
import type { ProductItem } from '../../shared/api/warehouseApi';
import { getOperatingContext } from '../../shared/api/operatingContextApi';
import { getUserErrorMessage } from '../../shared/api/client';
import { mobileCapabilities } from '../../shared/api/capabilities';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { productForScannedBarcode, receivingCount, receivingLocations, registerReceivingBatch } from './receivingData';

export function CreateContainerScreen() {
  const { goBack, navigate } = useNavigation();
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [productPicker, setProductPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [supplierBarcode, setSupplierBarcode] = useState('');
  const [count, setCount] = useState('1');
  const [locationId, setLocationId] = useState('');
  const [locationPicker, setLocationPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<{ barcodes: string[]; requested: number; error: string | null } | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const operating = useQuery({ queryKey: ['operating-context'], queryFn: () => getOperatingContext(), refetchInterval: 30_000 });
  const context = operating.data;
  const receiving = useQuery({
    queryKey: ['receiving-locations', context?.warehouse.id, context?.map.id],
    enabled: !!context,
    queryFn: async () => {
      if (!context) throw new Error('The receiving warehouse is not available.');
      const [locations, map] = await Promise.all([
        listStorageLocations({ warehouseId: context.warehouse.id, activeOnly: true }),
        getMapVersionDetail(context.map.id),
      ]);
      return receivingLocations(locations.items, map);
    },
  });
  const locations = receiving.data ?? [];
  const location = locations.find(item => item.id === locationId);
  const contextKey = `${context?.warehouse.id ?? ''}:${context?.map.id ?? ''}`;
  const latestContext = useRef(contextKey);
  latestContext.current = contextKey;
  const categories = useQuery({ queryKey: ['receiving-product-categories'], queryFn: listProductCategories, enabled: productPicker });
  const products = useQuery({
    queryKey: ['receiving-products', serverSearch, categoryId],
    queryFn: () => listProducts({ isActive: true, take: 100, search: serverSearch || undefined, categoryId: categoryId || undefined }),
    enabled: productPicker,
  });
  useEffect(() => {
    if (!scannedCode || serverSearch !== scannedCode || products.isFetching || !products.data || products.data.total > products.data.items.length) return;
    const match = productForScannedBarcode(products.data.items, scannedCode);
    if (match) { setProduct(match); setProductPicker(false); setScannedCode(null); setFormError(null); }
  }, [scannedCode, serverSearch, products.data, products.isFetching]);

  const beginScan = () => { setProductPicker(false); setScannerOpen(true); };
  const handleScan = (barcode: string) => {
    const code = barcode.trim();
    setScannerOpen(false); setCategoryId(''); setSearch(code); setScannedCode(code); setSupplierBarcode(code); setProductPicker(true);
  };
  const handleRegister = async () => {
    if (pending.current || !mobileCapabilities.createContainer) return;
    setFormError(null);
    if (!product) { setFormError('Select a product first.'); setProductPicker(true); return; }
    const requested = receivingCount(count);
    if (requested === null) { setFormError('Enter between 1 and 10 containers.'); return; }
    if (!location || !context || operating.error || receiving.error) { setFormError('Choose a configured receiving location before registering goods.'); setLocationPicker(true); return; }
    pending.current = true; setSubmitting(true);
    const registrationContext = contextKey;
    try {
      const result = await registerReceivingBatch(requested, () => {
        if (latestContext.current !== registrationContext) throw new Error('Receiving context changed.');
        return createContainer({ productId: product.id, supplierPackageBarcode: supplierBarcode.trim() || null, initialStorageLocationId: location.id });
      });
      if (!mounted.current) return;
      const error = result.error ? getUserErrorMessage(result.error, 'Registration could not be completed.') : null;
      if (result.barcodes.length) setReceipt({ barcodes: result.barcodes, requested, error });
      else setFormError(`${error || 'No registration was confirmed.'} Check Inventory before trying again.`);
    } finally {
      pending.current = false;
      if (mounted.current) setSubmitting(false);
    }
  };

  const locationError = operating.error || receiving.error;
  const locationMessage = location ? `${location.code} · ${location.endpointCode}`
    : locationError ? 'Receiving locations could not be loaded'
    : !context || receiving.isPending ? 'Loading receiving locations…'
    : 'No location selected';
  const canRegister = mobileCapabilities.createContainer && !locationError && receiving.data !== undefined && locations.length > 0;
  const locationNeedle = locationSearch.trim().toLowerCase();
  const filteredLocations = locations.filter(item => [item.name, item.code, item.endpointCode].some(value => value.toLowerCase().includes(locationNeedle)));

  return <View style={styles.screen}>
    <SubScreenHeader label="Inbound Receiving" title={receipt ? 'Registered Containers' : 'Receive Goods'} onBack={goBack} />
    <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {context ? <Text variant="caption" color={colors.textSecondary}>{context.warehouse.name} · {context.map.code}</Text> : null}
        {receipt ? <>
          <Card gap={12}>
            <View style={styles.sectionHeading}><CheckCircle2 size={22} color={receipt.error ? colors.warningText : colors.successText} /><Text variant="headline">{receipt.barcodes.length} Of {receipt.requested} Registered</Text></View>
            <Text variant="body" color={colors.textSecondary}>{product?.name}</Text>
            {receipt.barcodes.map(barcode => <View key={barcode} style={styles.receiptCode}><Text selectable variant="code">{barcode}</Text></View>)}
            {receipt.error ? <Text variant="caption" color={colors.dangerText}>{receipt.error} Check Inventory before registering the remaining containers.</Text> : null}
            <Text variant="caption" color={colors.textSecondary}>Barcode labels and printing are not configured. Use the registered codes for manual entry.</Text>
          </Card>
          <Button title="Continue To Putaway" onPress={() => navigate('transport_create', { workflow: 'INBOUND_PUTAWAY', container: receipt.barcodes[0], containers: receipt.barcodes })} />
          <Button title="Receive More Goods" variant="secondary" onPress={() => { setReceipt(null); setCount('1'); setSupplierBarcode(''); setFormError(null); }} />
        </> : <>
          <Card padding="none">
            <View style={styles.groupHeader}><Text variant="label">Product</Text><Pressable accessibilityRole="button" accessibilityLabel="Scan product barcode" disabled={submitting} onPress={beginScan} style={styles.scanAction}><ScanLine size={18} color={colors.primaryText} /><Text variant="label" color={colors.primaryText}>Scan</Text></Pressable></View>
            <Pressable accessibilityRole="button" accessibilityLabel={product ? `Change product ${product.name}` : 'Choose product'} disabled={submitting} onPress={() => { setProductPicker(true); setScannedCode(null); }} style={({ pressed }) => [styles.choiceRow, pressed && styles.pressed]}>
              <Box size={20} color={colors.textSecondary} />
              <View style={styles.flex}><Text variant="bodyMedium">{product?.name || 'Choose A Product'}</Text><Text variant="caption" color={colors.textSecondary}>{product?.sku || 'Search the catalog or scan a supplier barcode'}</Text></View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
          </Card>

          <Card gap={14}>
            <View style={styles.sectionHeading}><MapPin size={18} color={colors.textSecondary} /><Text variant="label">Receive At</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Choose receiving location" disabled={submitting} onPress={() => setLocationPicker(true)} style={styles.locationChoice}>
              <View style={styles.flex}><Text variant="bodyMedium">{location?.name || 'Receiving Location'}</Text><Text variant="caption" color={colors.textSecondary}>{locationMessage}</Text></View><ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
            {locationError ? <Button title="Retry Locations" variant="secondary" size="sm" onPress={() => { void operating.refetch(); void receiving.refetch(); }} /> : receiving.data?.length === 0 ? <Text variant="caption" color={colors.textSecondary}>No receiving location is configured on this map. Ask the warehouse administrator to configure one.</Text> : null}
          </Card>

          <Card gap={16}>
            <View style={styles.countRow}><View style={styles.flex}><Text variant="label">Number Of Containers</Text><Text variant="caption" color={colors.textSecondary}>One code for each package</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Decrease container count" disabled={submitting || (receivingCount(count) ?? 1) <= 1} onPress={() => setCount(String(Math.max(1, (receivingCount(count) ?? 1) - 1)))} style={styles.countButton}><Minus size={18} color={colors.textPrimary} /></Pressable>
              <TextField accessibilityLabel="Number of containers" value={count} onChangeText={setCount} editable={!submitting} keyboardType="number-pad" maxLength={2} containerStyle={styles.countField} inputStyle={styles.countInput} />
              <Pressable accessibilityRole="button" accessibilityLabel="Increase container count" disabled={submitting || (receivingCount(count) ?? 1) >= 10} onPress={() => setCount(String(Math.min(10, (receivingCount(count) ?? 1) + 1)))} style={styles.countButton}><Plus size={18} color={colors.textPrimary} /></Pressable>
            </View>
            <TextField label="Supplier Package Barcode (Optional)" value={supplierBarcode} onChangeText={setSupplierBarcode} editable={!submitting} maxLength={128} autoCapitalize="none" autoCorrect={false} placeholder="Enter the supplier’s code" />
          </Card>
          {formError ? <Text accessibilityRole="alert" variant="body" color={colors.dangerText}>{formError}</Text> : null}
        </>}
      </ScrollView>
      {!receipt ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {!mobileCapabilities.createContainer ? <Text variant="caption" color={colors.textSecondary}>Registration is not available yet. You can still browse the product catalog.</Text> : !canRegister ? <Text variant="caption" color={colors.textSecondary}>A configured receiving location is required.</Text> : null}
        <Button title={mobileCapabilities.createContainer ? 'Register Containers' : 'Registration Unavailable'} onPress={handleRegister} disabled={!canRegister} loading={submitting} fullWidth />
      </View> : null}
    </KeyboardAvoidingView>

    {productPicker ? <BottomSheet onClose={() => { setProductPicker(false); setScannedCode(null); }} accessibilityLabel="product catalog">
      <View style={styles.sheetHeader}><Text variant="headline">Choose Product</Text><Pressable accessibilityRole="button" accessibilityLabel="Close product catalog" onPress={() => { setProductPicker(false); setScannedCode(null); }} style={styles.closeButton}><X size={20} color={colors.textPrimary} /></Pressable></View>
      <View style={styles.sheetSearch}><TextField accessibilityLabel="Search product catalog" value={search} onChangeText={value => { setSearch(value); setScannedCode(null); }} placeholder="Product, SKU, or supplier barcode" autoCapitalize="none" autoCorrect={false} showClearButton leftIcon={<Search size={18} color={colors.textMuted} />} onSubmitEditing={() => setScannedCode(search.trim())} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll} contentContainerStyle={styles.categoryRow}>
        {[{ id: '', name: 'All Products' }, ...(categories.data?.items ?? [])].map(category => <Pressable key={category.id} accessibilityRole="button" accessibilityState={{ selected: categoryId === category.id }} onPress={() => { setCategoryId(category.id); setScannedCode(null); }} style={[styles.categoryChip, categoryId === category.id && styles.categorySelected]}><Text variant="caption" color={categoryId === category.id ? colors.primaryText : colors.textSecondary}>{category.name}</Text></Pressable>)}
      </ScrollView>
      <FlatList style={styles.catalogList} contentContainerStyle={styles.catalogContent} keyboardShouldPersistTaps="handled" data={products.data?.items ?? []} keyExtractor={item => item.id}
        ListHeaderComponent={products.error && products.data ? <EmptyState compact title="Could Not Refresh Catalog" message="Showing the last loaded products." actionTitle="Retry" onAction={() => { void products.refetch(); }} /> : null}
        renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: product?.id === item.id }} accessibilityLabel={`${item.name}, ${item.sku}`} onPress={() => { setProduct(item); setProductPicker(false); setScannedCode(null); setFormError(null); }} style={[styles.catalogRow, product?.id === item.id && styles.catalogSelected]}><View style={styles.flex}><Text variant="bodyMedium">{item.name}</Text><Text variant="code" color={colors.textSecondary}>{item.sku}</Text></View>{product?.id === item.id ? <Check size={18} color={colors.primaryText} /> : null}</Pressable>}
        ListEmptyComponent={<EmptyState compact title={products.data === undefined ? products.error ? 'Catalog Unavailable' : 'Loading Products…' : 'No Products Found'} message={products.error ? getUserErrorMessage(products.error, 'The product catalog could not be loaded.') : products.data ? 'Try a product name, SKU, or supplier barcode.' : undefined} actionTitle={products.error ? 'Retry' : undefined} onAction={() => { void products.refetch(); }} />}
        ListFooterComponent={products.data && products.data.total > products.data.items.length ? <Text variant="caption" color={colors.textSecondary}>Showing {products.data.items.length} of {products.data.total}. Refine your search to find another product.</Text> : null} />
    </BottomSheet> : null}

    {locationPicker ? <BottomSheet onClose={() => setLocationPicker(false)} accessibilityLabel="receiving locations">
      <View style={styles.sheetHeader}><Text variant="headline">Receive At</Text><Pressable accessibilityRole="button" accessibilityLabel="Close receiving locations" onPress={() => setLocationPicker(false)} style={styles.closeButton}><X size={20} color={colors.textPrimary} /></Pressable></View>
      <View style={styles.sheetSearch}><TextField accessibilityLabel="Search receiving locations" value={locationSearch} onChangeText={setLocationSearch} placeholder="Location or endpoint code" showClearButton leftIcon={<Search size={18} color={colors.textMuted} />} /></View>
      <FlatList style={styles.catalogList} contentContainerStyle={styles.catalogContent} data={filteredLocations} keyboardShouldPersistTaps="handled" keyExtractor={item => item.id}
        renderItem={({ item }) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: locationId === item.id }} onPress={() => { setLocationId(item.id); setLocationPicker(false); setFormError(null); }} style={[styles.catalogRow, locationId === item.id && styles.catalogSelected]}><View style={styles.flex}><Text variant="bodyMedium">{item.name}</Text><Text variant="caption" color={colors.textSecondary}>{item.code} · {item.endpointCode}</Text></View>{locationId === item.id ? <Check size={18} color={colors.primaryText} /> : null}</Pressable>}
        ListEmptyComponent={<EmptyState compact title={locationError ? 'Locations Unavailable' : receiving.data === undefined ? 'Loading Locations…' : 'No Matching Receiving Locations'} message={locationError ? getUserErrorMessage(locationError, 'Receiving locations could not be loaded.') : 'Only configured locations on the current warehouse map can be used.'} actionTitle={locationError ? 'Retry' : undefined} onAction={() => { void operating.refetch(); void receiving.refetch(); }} />} />
    </BottomSheet> : null}
    <BarcodeScannerHUD visible={scannerOpen} title="Scan product barcode" manualLabel="Product or supplier barcode" placeholder="Enter Product Or Supplier Barcode" onClose={() => setScannerOpen(false)} onScanResult={handleScan} />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 24 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  groupHeader: { paddingLeft: 16, paddingRight: 8, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  scanAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, minHeight: 44 },
  choiceRow: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 76, padding: 16 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  countRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  countButton: { minWidth: 44, minHeight: 44, borderRadius: radii.control, backgroundColor: colors.surfaceSubtle, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  countField: { width: 52 },
  countInput: { textAlign: 'center', paddingHorizontal: 0 },
  footer: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  receiptCode: { padding: 12, backgroundColor: colors.surfaceSubtle, borderRadius: radii.sm },
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
  pressed: { opacity: 0.8 },
});
