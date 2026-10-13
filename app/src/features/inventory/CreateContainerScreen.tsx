import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Box,
  Layers,
  PackageCheck,
  Printer,
  Rocket,
  Sparkles,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

const CATEGORIES: Record<string, string[]> = {
  Electronics: [
    'Control Module',
    'Sensor Array',
    'Electronic Components',
  ],
  'Mechanical Parts': [
    'Drive Assembly',
    'Bearing Kit',
    'Fastener Set',
  ],
  Packaging: [
    'Shipping Carton',
    'Protective Insert',
    'Pallet Wrap',
  ],
};

export function CreateContainerScreen() {
  const { goBack, navigate } = useNavigation();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [category, setCategory] = useState<string>('Electronics');
  const [product, setProduct] = useState<string>('Electronic Components');
  const [quantity, setQuantity] = useState<string>('45');
  const [batchCount, setBatchCount] = useState<string>('10');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [generatedBarcode, setGeneratedBarcode] = useState<string>('BOX-482');
  const [batchGenerated, setBatchGenerated] = useState<{
    start: string;
    end: string;
    count: number;
    totalUnits: number;
  } | null>(null);
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);

  const packQty = Number(quantity) || 0;
  const numContainers = Number(batchCount) || 0;
  const totalBatchUnits = packQty * numContainers;

  const handleGenerate = () => {
    if (mode === 'single') {
      const code = `BOX-${Math.floor(100 + Math.random() * 900)}`;
      setGeneratedBarcode(code);
      setBatchGenerated(null);
    } else {
      const startId = 201;
      const endId = startId + numContainers - 1;
      setBatchGenerated({
        start: `BOX-${startId}`,
        end: `BOX-${endId}`,
        count: numContainers,
        totalUnits: totalBatchUnits,
      });
    }
    setIsSuccess(true);
  };

  const handlePrint = () => {
    setPrintFeedback('Dispatched print job to Zebra ZT411 Direct Thermal Mobile Printer (ZPL II · 203 DPI).');
    setTimeout(() => setPrintFeedback(null), 4000);
  };

  const handleDispatchInbound = () => {
    navigate('transport_create', {
      workflow: 'Inbound Putaway',
      container: mode === 'single' ? generatedBarcode : batchGenerated?.start || 'BOX-201',
      product,
      qty: quantity,
    });
  };

  const barcodeBars = [3, 1, 2, 1, 4, 1, 2, 3, 2, 1, 1, 3, 4, 1, 2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 3, 1, 2, 3, 1, 2, 4, 1];

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="SCR-STF-24 · CARGO INDUCTION"
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
              <Box size={14} color={mode === 'single' ? colors.primary : colors.textMuted} />
              <Text style={[styles.modeText, mode === 'single' && styles.modeTextActive]}>
                Single Tote
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('batch')}
              style={[styles.modeBtn, mode === 'batch' && styles.modeBtnActive]}
            >
              <Layers size={14} color={mode === 'batch' ? colors.primary : colors.textMuted} />
              <Text style={[styles.modeText, mode === 'batch' && styles.modeTextActive]}>
                Batch Mode (Multi-Tote)
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {printFeedback && (
          <View style={styles.printToast}>
            <Printer size={16} color={colors.primary} />
            <Text style={styles.printToastText}>{printFeedback}</Text>
          </View>
        )}

        {isSuccess ? (
          <View style={styles.successCard}>
            <View style={styles.successIconCircle}>
              <PackageCheck size={28} color="#ffffff" />
            </View>
            <Text style={styles.successTitle}>
              {batchGenerated ? `${batchGenerated.count} Containers Ingested` : 'Container Ingested'}
            </Text>
            <Text style={styles.successSub}>
              {batchGenerated
                ? 'Batch containers registered to Central Registry at Inbound Dock 01.'
                : 'Tote container registered to Central Registry at Inbound Dock 01.'}
            </Text>

            {/* Simulated 1D Barcode Graphic Label */}
            <View style={styles.barcodeTicket}>
              <Text style={styles.barcodeTicketLabel}>
                {batchGenerated
                  ? `BATCH BARCODE LABELS (${batchGenerated.count} CONTINUOUS STICKERS)`
                  : 'GENERATED BARCODE LABEL (CODE 128)'}
              </Text>

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
                {batchGenerated
                  ? `${batchGenerated.count} Totes × ${packQty} units = ${batchGenerated.totalUnits} Total Units`
                  : `${quantity} units × ${product}`}
              </Text>

              <View style={styles.ticketFooter}>
                <View style={styles.stagedLoc}>
                  <Text style={styles.stagedLocLabel}>Staged Location</Text>
                  <Text style={styles.stagedLocVal}>Inbound Dock 01</Text>
                </View>
                <View style={styles.stagedLocRight}>
                  <Text style={styles.stagedLocLabel}>Print Density</Text>
                  <Text style={styles.stagedLocVal}>203 DPI</Text>
                </View>
              </View>
            </View>

            {/* Direct Thermal Zebra Printer Card */}
            <View style={styles.zebraPrinterCard}>
              <View style={styles.zebraHeader}>
                <View style={styles.zebraIconWrap}>
                  <Printer size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.zebraTitle}>Direct Thermal Mobile Printer</Text>
                  <Text style={styles.zebraSub}>Model: Zebra ZT411 · Status: READY · ZPL II</Text>
                </View>
              </View>
              <Button
                label={
                  batchGenerated
                    ? `PRINT ALL ${batchGenerated.count} LABELS (ZEBRA ZT411)`
                    : 'PRINT BARCODE LABEL (ZEBRA ZT411)'
                }
                icon={<Printer size={16} color="#ffffff" />}
                onPress={handlePrint}
                variant="primary"
                size="md"
              />
            </View>

            {/* Next Steps CTA */}
            <View style={styles.successActions}>
              <Button
                label="DISPATCH INBOUND PUTAWAY NOW"
                icon={<Rocket size={16} color="#ffffff" />}
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
            <View style={styles.formIntro}>
              <View style={styles.formIntroIcon}>
                <Sparkles size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardHeading}>Inbound Cargo Induction</Text>
                <Text style={styles.cardSub}>
                  Pack incoming items into standard totes and generate registration barcodes for AMR transport.
                </Text>
              </View>
            </View>

            {/* Step 1: Category Picker */}
            <Text style={styles.fieldLabel}>1. SELECT PRODUCT CATEGORY</Text>
            <View style={styles.categoryChips}>
              {Object.keys(CATEGORIES).map((cat) => {
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setCategory(cat);
                      setProduct(CATEGORIES[cat][0]);
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
            <Text style={styles.fieldLabel}>2. TARGET PRODUCT SKU</Text>
            <View style={styles.productChips}>
              {(CATEGORIES[category] || []).map((p) => {
                const isSelected = product === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setProduct(p)}
                    style={[styles.productItem, isSelected && styles.productItemSelected]}
                  >
                    <View style={styles.productItemLeft}>
                      <View style={[styles.radioDot, isSelected && styles.radioDotSelected]} />
                      <Text style={[styles.productItemText, isSelected && styles.productItemTextSelected]}>
                        {p}
                      </Text>
                    </View>
                    <Text style={styles.stockNotice}>Standard SKU</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Step 3: Quantity */}
            <Text style={styles.fieldLabel}>3. PACKING QUANTITY</Text>
            <Input
              label="Units per Container (Pcs)"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="numeric"
              placeholder="e.g. 45"
            />

            {mode === 'batch' && (
              <Input
                label="Number of Continuous Totes"
                value={batchCount}
                onChangeText={setBatchCount}
                keyboardType="numeric"
                placeholder="e.g. 10"
                hint={`Will create continuous codes and print ${batchCount || 0} sequential labels.`}
              />
            )}

            <Button
              label={
                mode === 'single'
                  ? 'GENERATE CONTAINER BARCODE & INGEST'
                  : `GENERATE BATCH (${batchCount} TOTES & LABELS)`
              }
              icon={<PackageCheck size={18} color="#ffffff" />}
              onPress={handleGenerate}
              variant="primary"
              size="lg"
              style={{ marginTop: 12 }}
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
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: '#ffffff',
    ...shadows.panel,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  modeTextActive: {
    color: colors.textPrimary,
    fontWeight: '900',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  printToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  printToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  successCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.successBorder,
    backgroundColor: colors.successBg,
    padding: 18,
    alignItems: 'center',
    ...shadows.panel,
  },
  successIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 12,
    fontFamily: typography.fontSans,
  },
  successSub: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  barcodeTicket: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    ...shadows.panel,
  },
  barcodeTicketLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.textMuted,
    marginBottom: 12,
    fontFamily: typography.fontMono,
  },
  barcodeArt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: 48,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 280,
  },
  barcodeBar: {
    height: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 0.5,
  },
  barcodeCodeText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    color: colors.textPrimary,
    marginTop: 10,
    fontFamily: typography.fontMono,
  },
  barcodeProductText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
  },
  ticketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 14,
    paddingTop: 10,
  },
  stagedLoc: {
    alignItems: 'flex-start',
  },
  stagedLocRight: {
    alignItems: 'flex-end',
  },
  stagedLocLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  stagedLocVal: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    marginTop: 1,
  },
  zebraPrinterCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
    gap: 12,
    ...shadows.panel,
  },
  zebraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  zebraIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zebraTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  zebraSub: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 1,
    fontFamily: typography.fontMono,
  },
  successActions: {
    width: '100%',
    marginTop: 16,
    gap: 8,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
  },
  formIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 14,
  },
  formIntroIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  cardSub: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 10,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.primary,
    fontWeight: '900',
  },
  productChips: {
    gap: 6,
    marginBottom: 14,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productItemSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  productItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.borderDark,
    backgroundColor: '#ffffff',
  },
  radioDotSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  productItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  productItemTextSelected: {
    color: colors.primary,
    fontWeight: '900',
  },
  stockNotice: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
