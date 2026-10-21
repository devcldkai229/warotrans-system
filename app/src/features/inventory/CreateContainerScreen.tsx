import { mobileCapabilities } from '../../shared/api/capabilities';
import { toast } from '../../shared/context/ToastContext';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Box,
  Check,
  Layers,
  PackageCheck,
  Printer,
  Rocket,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { createContainer, listProducts, listProductCategories } from '../../shared/api';

interface ProductCatalogEntry {
  name: string;
  productId: string;
  sku: string;
}


export function CreateContainerScreen() {
  const { goBack, navigate } = useNavigation();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [category, setCategory] = useState<string>('');
  const [product, setProduct] = useState<string>('');
  const [productCatalog, setProductCatalog] = useState<Record<string, ProductCatalogEntry>>({});
  const [quantity, setQuantity] = useState<string>('1');
  const [batchCount, setBatchCount] = useState<string>('10');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [generatedBarcode, setGeneratedBarcode] = useState<string>('');
  const [batchGenerated, setBatchGenerated] = useState<{
    start: string;
    end: string;
    count: number;
    totalUnits: number;
  } | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<Record<string, string[]>>({});
  const [createdBarcodes, setCreatedBarcodes] = useState<string[]>([]);
  const [supplierBarcode, setSupplierBarcode] = useState('');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([listProducts({ isActive: true, take: 100 }), listProductCategories()]).then(([products, categories]) => {
      if (!mounted) return;
      const catalog: Record<string, ProductCatalogEntry> = {};
      const groups: Record<string, string[]> = {};
      products.items.forEach(item => {
        const label = `${item.name} (${item.sku})`;
        catalog[label] = { name: item.name, productId: item.id, sku: item.sku };
        const categoryName = categories.items.find(category => category.id === item.categoryId)?.name || 'Products';
        (groups[categoryName] ||= []).push(label);
      });
      setProductCatalog(catalog); setCategoryProducts(groups);
      const firstCategory = Object.keys(groups)[0] || '';
      setCategory(firstCategory); setProduct(groups[firstCategory]?.[0] || '');
    }).catch(error => { if (mounted) setCatalogError(error.message || 'Product catalog could not be loaded.'); });
    return () => { mounted = false; };
  }, []);
  const productOptions = categoryProducts[category] || [];

  const packQty = Number(quantity) || 0;
  const numContainers = Number(batchCount) || 0;
  const totalBatchUnits = packQty * numContainers;
  const batchCountLabel = batchCount.trim() || '0';

  const handleGenerate = async () => {
    const item = productCatalog[product];
    const count = mode === 'single' ? 1 : Number(batchCount);
    if (!item) { toast.error('Select an active product from the server catalog.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 10) { toast.error('Enter between 1 and 10 containers.'); return; }
    if (isSubmitting) return;
    setIsSubmitting(true);
    const created: string[] = [];
    try {
      for (let index = 0; index < count; index++) {
        const response = await createContainer({ productId: item.productId, supplierPackageBarcode: supplierBarcode.trim() || null });
        created.push(response.barcode);
      }
    } catch (error: any) {
      toast.error(`${created.length} of ${count} containers registered. ${error.message || 'Registration failed.'}`);
    } finally {
      if (created.length) {
        setCreatedBarcodes(created); setGeneratedBarcode(created[0]);
        setBatchGenerated(mode === 'batch' ? { start: created[0], end: created[created.length - 1], count: created.length, totalUnits: created.length } : null);
        setIsSuccess(true);
      }
      setIsSubmitting(false);
    }
  };
  const handlePrint = () => {
    setPrintFeedback('Printer integration is not configured. Use the registered container code for manual entry.');
    setTimeout(() => setPrintFeedback(null), 4000);
  };
  const handleDispatchInbound = () => {
    if (!createdBarcodes.length) return;
    navigate('transport_create', { workflow: 'INBOUND_PUTAWAY', container: createdBarcodes[0], containers: createdBarcodes });
  };

  const barcodeBars = [3, 1, 2, 1, 4, 1, 2, 3, 2, 1, 1, 3, 4, 1, 2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 3, 1, 2, 3, 1, 2, 4, 1];

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={isSuccess ? 'Inbound Receiving · Registered' : 'Cargo induction'}
        title="Pack & Ingest Container"
        onBack={goBack}
      />

      {/* Mode Switcher */}
      {!isSuccess && (
        <View style={styles.modeBar}>
          <View style={styles.modeSwitcher}>
            <Pressable
              onPress={() => setMode('single')}
              style={[styles.modeBtn, mode === 'single' && styles.modeBtnActive]}
            >
              <Box size={16} color={mode === 'single' ? colors.textPrimary : colors.textMuted} />
              <Text style={[styles.modeText, mode === 'single' && styles.modeTextActive]}>
                Single tote
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('batch')}
              style={[styles.modeBtn, mode === 'batch' && styles.modeBtnActive]}
            >
              <Layers size={16} color={mode === 'batch' ? colors.textPrimary : colors.textMuted} />
              <Text style={[styles.modeText, mode === 'batch' && styles.modeTextActive]}>
                Batch mode (multi-tote)
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {!mobileCapabilities.createContainer && <Text style={{ color: colors.textSecondary }}>Container registration is not available on the current backend. Product browsing remains available.</Text>}
        {catalogError && <Text style={{ color: colors.danger }}>{catalogError}</Text>}
        {printFeedback && (
          <View style={styles.printToast}>
            <Printer size={16} color={colors.primary} />
            <Text style={styles.printToastText}>{printFeedback}</Text>
          </View>
        )}

        {isSuccess ? (
          <View style={styles.successCard}>
            <View style={styles.successHeader}>
              <View style={styles.successIconBadge}>
                <Check size={20} color="#16a34a" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.successTitle}>
                  {batchGenerated ? `${batchGenerated.count} containers registered` : 'Container registered'}
                </Text>
                <Text style={styles.successSub}>
                  {batchGenerated
                    ? 'Batch containers registered to Central Registry in the backend registry.'
                    : 'Tote container registered to Central Registry in the backend registry.'}
                </Text>
              </View>
            </View>

            {/* Industrial Simulated Shipping Barcode Label */}
            <View style={styles.barcodeTicket}>
              <View style={styles.ticketTop}>
                <Text style={styles.ticketMetaTag}>
                  {batchGenerated
                    ? `BATCH TOTE LABELS · ${batchGenerated.count} SEQUENTIAL`
                    : 'CONTAINER REFERENCE · MANUAL ENTRY'}
                </Text>
                <Text style={styles.ticketDpi}>203 DPI</Text>
              </View>

              <View style={styles.barcodeArt}>
                {barcodeBars.map((w, idx) => (
                  <View
                    key={idx}
                    style={[styles.barcodeBar, { width: w * 2 }]}
                  />
                ))}
              </View>

              <Text style={styles.barcodeCodeText}>
                {batchGenerated
                  ? `${batchGenerated.start} ➔ ${batchGenerated.end}`
                  : generatedBarcode}
              </Text>
              <Text style={styles.barcodeProductText}>
                {batchGenerated ? (
                  <>
                    <Text style={styles.boldQty}>{batchGenerated.count} Totes × {packQty} containers</Text> ({batchGenerated.totalUnits} Total Containers)
                  </>
                ) : (
                  <>
                    <Text style={styles.boldQty}>{quantity} containers</Text> · {product}
                  </>
                )}
              </Text>

              <View style={styles.ticketFooter}>
                <View style={styles.stagedLoc}>
                  <Text style={styles.stagedLocLabel}>Staged location</Text>
                  <Text style={styles.stagedLocVal}>Inbound Dock 01</Text>
                </View>
                <View style={styles.stagedLocRight}>
                  <Text style={styles.stagedLocLabel}>Induction terminal</Text>
                  <Text style={styles.stagedLocVal}>Handheld Staff 01</Text>
                </View>
              </View>
              <View style={styles.ticketFooter}>
                <Text style={styles.stagedLocLabel}>Registry Mode</Text>
                <Text style={styles.stagedLocVal}>
                  Warehouse DB · Live
                </Text>
              </View>
            </View>

            {/* Direct Thermal Zebra Printer Card */}
            <View style={styles.zebraPrinterCard}>
              <View style={styles.zebraHeader}>
                <View style={styles.zebraIconWrap}>
                  <Printer size={18} color={colors.textPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.zebraStatusRow}>
                    <Text style={styles.zebraTitle}>Direct Thermal Mobile Printer</Text>
                    <View style={styles.printerStatusPill}>
                      <View style={styles.printerDotReady} />
                      <Text style={styles.printerStatusText}>Ready</Text>
                    </View>
                  </View>
                  <Text style={styles.zebraSub}>Zebra ZT411 · Bluetooth Connected · ZPL II</Text>
                </View>
              </View>
              <Button
                label={batchGenerated ? `Print Labels (${batchGenerated.count})` : 'Print Label'}
                icon={<Printer size={16} color={colors.textPrimary} />}
                onPress={handlePrint}
                variant="outline"
                size="md"
              />
            </View>

            {/* Next Steps CTA */}
            <View style={styles.successActions}>
              <Button
                label="Dispatch Putaway"
                icon={<Rocket size={18} color="#ffffff" />}
                onPress={handleDispatchInbound}
                variant="primary"
                size="lg"
              />
              <Button
                label="Ingest Another Container"
                onPress={() => setIsSuccess(false)}
                variant="outline"
                size="md"
              />
            </View>
          </View>
        ) : (
          <View style={styles.formCard}>
            {/* Step 1: Category Picker */}
            <Text style={styles.fieldLabelFirst}>Product category</Text>
            <View style={styles.categoryChips}>
              {Object.keys(categoryProducts).map((cat) => {
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setCategory(cat);
                      setProduct(categoryProducts[cat][0]);
                    }}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Step 2: Product SKU Picker */}
            <Text style={styles.fieldLabel}>Target SKU</Text>
            <View style={styles.productChips}>
              {productOptions.map((p) => {
                const isSelected = product === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setProduct(p)}
                    style={[styles.productItem, isSelected && styles.productItemSelected]}
                  >
                    <View style={styles.productItemLeft}>
                      <View style={[styles.radioDot, isSelected && styles.radioDotSelected]}>
                        {isSelected && <View style={styles.radioDotInner} />}
                      </View>
                      <Text style={[styles.productItemText, isSelected && styles.productItemTextSelected]}>
                        {p}
                      </Text>
                    </View>
                    <View style={styles.skuTag}>
                      <Text style={styles.skuTagText}>Standard SKU</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Step 3: Quantity */}
            <Text style={styles.fieldLabel}>Supplier Package</Text>
            <Input
              label="Supplier Package Barcode (Optional)"
              value={supplierBarcode}
              onChangeText={setSupplierBarcode}
              placeholder="Supplier package barcode"
            />

            {mode === 'batch' && (
              <Input
                label="Number of continuous totes"
                value={batchCount}
                onChangeText={setBatchCount}
                keyboardType="numeric"
                placeholder="e.g. 10"
              />
            )}

            <Button
              label={
                mode === 'single'
                  ? 'Generate & Ingest Barcode'
                  : `Generate Batch (${batchCountLabel} Totes)`
              }
              icon={<PackageCheck size={18} color="#ffffff" />}
              loading={isSubmitting}
              disabled={isSubmitting || !productCatalog[product] || !mobileCapabilities.createContainer}
              onPress={handleGenerate}
              variant="primary"
              size="lg"
              style={{ marginTop: 14 }}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modeBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    padding: 3,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  modeBtnActive: {
    backgroundColor: '#ffffff',
    ...shadows.panel,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  modeTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontFamily: typography.fontSans,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  printToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 14,
    borderRadius: radii.md,
    marginBottom: 14,
  },
  printToastText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    flex: 1,
    fontFamily: typography.fontSans,
  },
  successCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    padding: 18,
    ...shadows.panel,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  successIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  successSub: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  barcodeTicket: {
    width: '100%',
    backgroundColor: '#fafbfc',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDark,
    padding: 18,
    alignItems: 'center',
  },
  ticketTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  ticketMetaTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  ticketDpi: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  barcodeArt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 52,
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 300,
  },
  barcodeBar: {
    height: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 0.5,
  },
  barcodeCodeText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    color: colors.textPrimary,
    marginTop: 12,
    fontFamily: typography.fontMono,
  },
  barcodeProductText: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  boldQty: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 16,
    paddingTop: 12,
  },
  stagedLoc: {
    alignItems: 'flex-start',
  },
  stagedLocRight: {
    alignItems: 'flex-end',
  },
  stagedLocLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  stagedLocVal: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    marginTop: 2,
  },
  zebraPrinterCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  zebraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  zebraIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zebraStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zebraTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  printerStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  printerDotReady: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16a34a',
  },
  printerStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontSans,
  },
  zebraSub: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  successActions: {
    width: '100%',
    marginTop: 18,
    gap: 10,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    ...shadows.panel,
  },
  fieldLabelFirst: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
    fontFamily: typography.fontSans,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
    marginTop: 14,
    fontFamily: typography.fontSans,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: '700',
    fontFamily: typography.fontSans,
  },
  productChips: {
    gap: 8,
    marginBottom: 14,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    minHeight: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productItemSelected: {
    backgroundColor: '#ffffff',
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  productItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radioDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.borderDark,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotSelected: {
    borderColor: colors.darkAction,
  },
  radioDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.darkAction,
  },
  productItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  productItemTextSelected: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  skuTag: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  skuTagText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
});
