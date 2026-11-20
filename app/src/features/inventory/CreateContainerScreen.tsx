import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, CheckCircle2, ChevronRight, Minus, Package, Plus, Printer, ScanLine, Tag } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { Button, EmptyState, SegmentedControl, Text } from '../../shared/ui';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import { ApiError, createContainerBatch, getOperatingContext, issueContainerLabels, type ProductItem } from '../../shared/api';
import { Scanner } from '../../shared/scan/Scanner';
import { containerLabels, printLabels } from '../../shared/scan/printLabels';
import { getUserErrorMessage } from '../../shared/api/client';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { t } from '../../shared/i18n';
import { triggerHaptic } from '../../shared/utils/haptics';
import { ReceivingProductPicker } from './ReceivingProductPicker';
import { batchTotal, buildContainerBatchBody, createBatchRequestId, DEFAULT_QUANTITY, DEFAULT_UNIT, newBatchGroup } from './inboundBatch';

type Scan = 'product' | 'package' | null;

/**
 * Create containers and put a product in them: scan (or type) the product barcode or pick it from the catalog, scan the
 * supplier's package barcode when there is one, choose how many containers, create. The system gives each container its
 * code (C + ddMMyy + number) to stick on it. Camera scanning is the scanner screen's job; it also takes a typed code.
 */
export function CreateContainerScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { goBack, navigate } = useNavigation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const operating = useQuery({ queryKey: ['operating-context'], queryFn: () => getOperatingContext(), retry: 1 });
  const [product, setProduct] = useState<ProductItem | null>(null);
  const [picker, setPicker] = useState<{ barcode: string | null } | null>(null);
  const [scan, setScan] = useState<Scan>(null);
  const [packageBarcode, setPackageBarcode] = useState('');
  const [count, setCount] = useState('1');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ codes: string[]; product: ProductItem } | null>(null);
  const [mode, setMode] = useState<'new' | 'labels'>('new');
  const [labelScanner, setLabelScanner] = useState(false);
  const [claimed, setClaimed] = useState<string[]>([]);
  const [blankCount, setBlankCount] = useState('24');
  const [printing, setPrinting] = useState(false);
  const lock = useRef(false);
  const allowed = sessionCan(session, PERMISSIONS.containerCreate);
  const number = Number.parseInt(count, 10) || 0;
  const setNumber = (next: number) => setCount(String(Math.max(1, Math.min(200, next))));

  const onScanned = (code: string) => {
    const value = code.trim();
    const target = scan;
    setScan(null);
    if (!value) return;
    triggerHaptic('success');
    if (target === 'product') setPicker({ barcode: value });
    else setPackageBarcode(value);
  };

  const create = async () => {
    if (lock.current || !product || !operating.data || number < 1) return;
    lock.current = true; setPending(true); setError(null);
    try {
      const group = { ...newBatchGroup([], String(number), DEFAULT_QUANTITY, DEFAULT_UNIT), product: packageBarcode.trim() ? { ...product, supplierBarcode: packageBarcode.trim() } : product };
      const body = buildContainerBatchBody(operating.data.warehouse.id, createBatchRequestId(), batchTotal([group]), [group]);
      const result = await createContainerBatch(body);
      triggerHaptic('success');
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      setCreated({ codes: result.items.map(item => item.barcode), product });
    } catch (failure) {
      setError(getUserErrorMessage(failure, 'The containers could not be created.'));
    } finally { lock.current = false; setPending(false); }
  };

  const reset = () => { setCreated(null); setProduct(null); setPackageBarcode(''); setCount('1'); setError(null); setClaimed([]); };

  // A pre-printed label scanned while a product is chosen becomes that container (the server checks the label).
  const claimLabel = async (label: string) => {
    if (!product || !operating.data) return { ok: false, message: t('Choose the product first.') };
    const group = { ...newBatchGroup([], '1', DEFAULT_QUANTITY, DEFAULT_UNIT), product: packageBarcode.trim() ? { ...product, supplierBarcode: packageBarcode.trim() } : product };
    try {
      const body = { ...buildContainerBatchBody(operating.data.warehouse.id, createBatchRequestId(), '1', [group]), labelBarcode: label };
      await createContainerBatch(body);
      setClaimed(previous => [label, ...previous]);
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      return { ok: true, message: t('Now holds {product}', { product: product.name }) };
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : null;
      return { ok: false, message: code === 'label_already_used' ? t('Already on a container') : code === 'label_not_issued' ? t('Not a WaroTrans label') : getUserErrorMessage(failure, 'Could not use this label.') };
    }
  };

  const printBlank = async () => {
    const amount = Math.max(1, Math.min(200, Number.parseInt(blankCount, 10) || 0));
    setPrinting(true); setError(null);
    try {
      const { codes } = await issueContainerLabels(amount);
      await printLabels(containerLabels(codes, 'WaroTrans', new Date().toLocaleDateString()), t('{count} container labels', { count: codes.length }));
    } catch (failure) { setError(getUserErrorMessage(failure, 'The labels could not be printed.')); }
    finally { setPrinting(false); }
  };

  if (!allowed) {
    return <View style={styles.screen}><SubScreenHeader title="Create Containers" onBack={goBack} />
      <EmptyState title="Not Allowed" message="Your account cannot create containers." /></View>;
  }

  if (created) {
    return <View style={styles.screen}>
      <SubScreenHeader title="Containers Created" onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.doneHero}>
          <CheckCircle2 size={36} color={colors.success} />
          <Text variant="title">{t('{count} containers created', { count: created.codes.length })}</Text>
          <Text variant="bodyMedium" color="textSecondary">{created.product.name} · {created.product.sku}</Text>
          <Text variant="caption" color="textSecondary">Stick each code on its container. Add them to an inbound voucher to put them away.</Text>
        </View>
        {created.codes.map(code => <View key={code} style={styles.codeRow}>
          <Tag size={18} color={colors.primaryText} />
          <Text variant="code" fontWeight="700" selectable style={{ flex: 1, fontSize: 18 }}>{code}</Text>
          <Pressable style={styles.printButton} accessibilityRole="button" accessibilityLabel={t('Print label for {code}', { code })}
            onPress={() => { void printLabels(containerLabels([code], created.product.name, created.product.sku), code).catch(() => {}); }}>
            <Printer size={16} color={colors.primaryText} />
          </Pressable>
        </View>)}
        <Button title="Print All Labels" icon={Printer} variant="outline" fullWidth onPress={() => { void printLabels(containerLabels(created.codes, created.product.name, created.product.sku), created.product.name).catch(() => {}); }} />
        <Button title="Create More" icon={Plus} variant="outline" fullWidth onPress={reset} />
        <Button title="New Inbound Voucher" fullWidth onPress={() => navigate('stock_voucher_create', { voucherType: 'INBOUND' })} />
      </ScrollView>
    </View>;
  }

  return <View style={styles.screen}>
    <SubScreenHeader label={operating.data?.warehouse.name} title="Create Containers" onBack={goBack} />
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <SegmentedControl value={mode} onChange={value => { setMode(value); setError(null); }} accessibilityLabel="How to get container codes"
          options={[{ label: 'New Codes', value: 'new' }, { label: 'Pre-printed Labels', value: 'labels' }]} />
        <View style={styles.stepHeader}><View style={styles.stepNo}><Text variant="caption" fontWeight="800" color="#fff">1</Text></View><Text variant="headline">Product</Text></View>
        {product ? <Pressable style={({ pressed }) => [styles.productCard, pressed && styles.pressed]} onPress={() => setPicker({ barcode: null })} accessibilityRole="button" accessibilityLabel="Change product">
          <View style={styles.productIcon}><Box size={22} color={colors.primaryText} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyMedium" fontWeight="700" numberOfLines={1}>{product.name}</Text>
            <Text variant="code" color="textSecondary" numberOfLines={1}>{product.sku}{product.supplierBarcode ? ` · ${product.supplierBarcode}` : ''}</Text>
          </View>
          <ChevronRight size={18} color={colors.textMuted} />
        </Pressable> : <View style={styles.row}>
          <Pressable style={({ pressed }) => [styles.bigAction, pressed && styles.pressed]} onPress={() => setScan('product')} accessibilityRole="button" accessibilityLabel="Scan product barcode">
            <ScanLine size={26} color={colors.primaryText} />
            <Text variant="bodyMedium" fontWeight="700" color={colors.primaryText}>Scan Product</Text>
            <Text variant="caption" color="textSecondary" textAlign="center">Barcode on the product or its box</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.bigAction, styles.bigActionQuiet, pressed && styles.pressed]} onPress={() => setPicker({ barcode: null })} accessibilityRole="button" accessibilityLabel="Choose from catalog">
            <Package size={26} color={colors.textSecondary} />
            <Text variant="bodyMedium" fontWeight="700">From Catalog</Text>
            <Text variant="caption" color="textSecondary" textAlign="center">Search by name or SKU</Text>
          </Pressable>
        </View>}

        <View style={styles.stepHeader}><View style={[styles.stepNo, !product && styles.stepNoIdle]}><Text variant="caption" fontWeight="800" color="#fff">2</Text></View><Text variant="headline">Supplier package (optional)</Text></View>
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={packageBarcode} onChangeText={setPackageBarcode} placeholder={t('Package barcode')}
            placeholderTextColor={colors.textMuted} autoCapitalize="characters" autoCorrect={false} editable={!!product} accessibilityLabel="Supplier package barcode" />
          <Pressable style={({ pressed }) => [styles.scanSmall, !product && styles.disabled, pressed && styles.pressed]} disabled={!product} onPress={() => setScan('package')} accessibilityRole="button" accessibilityLabel="Scan package barcode">
            <ScanLine size={20} color={colors.primaryText} />
          </Pressable>
        </View>

        {mode === 'new' ? <>
        <View style={styles.stepHeader}><View style={[styles.stepNo, !product && styles.stepNoIdle]}><Text variant="caption" fontWeight="800" color="#fff">3</Text></View><Text variant="headline">How many containers</Text></View>
        <View style={styles.countCard}>
          <Pressable style={({ pressed }) => [styles.countButton, pressed && styles.pressed]} disabled={number <= 1} onPress={() => setNumber(number - 1)} accessibilityRole="button" accessibilityLabel="Fewer">
            <Minus size={22} color={number <= 1 ? colors.textMuted : colors.textPrimary} />
          </Pressable>
          <TextInput style={styles.countValue} value={count} onChangeText={text => setCount(text.replace(/[^0-9]/g, '').slice(0, 3))} keyboardType="number-pad" selectTextOnFocus accessibilityLabel="Number of containers" />
          <Pressable style={({ pressed }) => [styles.countButton, pressed && styles.pressed]} disabled={number >= 200} onPress={() => setNumber(number + 1)} accessibilityRole="button" accessibilityLabel="More">
            <Plus size={22} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Text variant="caption" color="textSecondary">Each container gets its own code, for example C181126001.</Text>
        </> : <>
          <View style={styles.stepHeader}><View style={[styles.stepNo, !product && styles.stepNoIdle]}><Text variant="caption" fontWeight="800" color="#fff">3</Text></View><Text variant="headline">Scan the labels</Text></View>
          <Pressable style={({ pressed }) => [styles.bigAction, !product && styles.disabled, pressed && styles.pressed]} disabled={!product} onPress={() => setLabelScanner(true)} accessibilityRole="button" accessibilityLabel="Scan QR labels">
            <ScanLine size={26} color={colors.primaryText} />
            <Text variant="bodyMedium" fontWeight="700" color={colors.primaryText}>Scan QR</Text>
            <Text variant="caption" color="textSecondary" textAlign="center">Each label scanned becomes a container of this product</Text>
          </Pressable>
          {claimed.length ? <View style={{ gap: 6 }}>
            <Text variant="caption" color="textSecondary">{t('{count} containers created', { count: claimed.length })}</Text>
            {claimed.map(code => <View key={code} style={styles.codeRow}><CheckCircle2 size={16} color={colors.success} /><Text variant="code" fontWeight="700" style={{ flex: 1 }}>{code}</Text></View>)}
          </View> : null}
          <View style={styles.printBlank}>
            <Text variant="bodyMedium" fontWeight="700">Print blank labels</Text>
            <Text variant="caption" color="textSecondary">Codes are reserved now; a label becomes a container when it is scanned with a product.</Text>
            <View style={styles.inputRow}>
              <TextInput style={[styles.input, { flex: 0, width: 90, textAlign: 'center' }]} value={blankCount} onChangeText={text => setBlankCount(text.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad" accessibilityLabel="Number of labels" />
              <Button title="Print Labels" icon={Printer} variant="outline" loading={printing} disabled={printing} onPress={() => { void printBlank(); }} />
            </View>
          </View>
        </>}
        {error ? <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{error}</Text></View> : null}
      </ScrollView>
      {mode === 'new' ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Button title={number > 1 ? t('Create {count} Containers', { count: number }) : 'Create Container'} fullWidth loading={pending}
          disabled={!product || number < 1 || !operating.data || pending} onPress={() => { void create(); }} />
      </View> : null}
    </KeyboardAvoidingView>

    {picker ? <ReceivingProductPicker selectedProduct={product} initialBarcode={picker.barcode} onClose={() => setPicker(null)}
      onSelect={chosen => { setProduct(chosen); setPicker(null); }} /> : null}
    <Scanner visible={labelScanner} continuous expect={['CONTAINER']} title="Scan container labels" manualLabel="Label code"
      placeholder="Scan or type the label code" onClose={() => setLabelScanner(false)} onScanResult={(_raw, scanned) => claimLabel(scanned.code)} />
    <BarcodeScannerHUD visible={scan !== null} onClose={() => setScan(null)} onScanResult={onScanned}
      title={scan === 'product' ? 'Scan product barcode' : 'Scan package barcode'} manualLabel={scan === 'product' ? 'Product barcode' : 'Package barcode'}
      placeholder={scan === 'product' ? 'Enter or scan the product barcode' : 'Enter or scan the package barcode'} />
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  row: { flexDirection: 'row', gap: 10 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  stepNo: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  stepNoIdle: { backgroundColor: colors.textMuted },
  bigAction: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 20, paddingHorizontal: 10, borderRadius: radii.lg,
    backgroundColor: colors.primaryLight, borderWidth: 1.5, borderColor: colors.primaryBorder, borderStyle: 'dashed' },
  bigActionQuiet: { backgroundColor: colors.surface, borderColor: colors.border, borderStyle: 'solid' },
  productCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryBorder },
  productIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, height: 48, paddingHorizontal: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, fontSize: 16 },
  scanSmall: { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primaryBorder },
  countCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 6, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  countButton: { width: 56, height: 56, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSubtle },
  countValue: { width: 100, height: 56, padding: 0, textAlign: 'center', fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  error: { padding: 12, borderRadius: radii.md, backgroundColor: colors.dangerBg },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  doneHero: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.successBorder },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  printBlank: { gap: 8, marginTop: 8, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  printButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
});
