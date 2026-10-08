import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';

const CATEGORIES: Record<string, string[]> = {
  Sensors: [
    'Optical Proximity Sensor X4',
    'Infrared Distance Detector IR-02',
    'Photoelectric Switch PH-10',
  ],
  Pneumatics: [
    'Pneumatic Actuator Valve',
    'Heavy Duty Coupler 20mm',
    'Air Cylinder Compact 32mm',
  ],
  Electronics: [
    'Relay Modules 24V DC',
    'Micro Controller Unit ESP32',
    'Solid State Relay SSR-40',
  ],
  Hardware: [
    'M6 Flange Locknuts (Pack 100)',
    'Aluminum Profile 4040 (50cm)',
    'Steel Ball Bearing 608ZZ',
  ],
};

export function CreateContainerScreen() {
  const { goBack } = useNavigation();
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [category, setCategory] = useState<string>('Sensors');
  const [product, setProduct] = useState<string>('Optical Proximity Sensor X4');
  const [quantity, setQuantity] = useState<string>('45');
  const [batchCount, setBatchCount] = useState<string>('5');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const [generatedBarcode, setGeneratedBarcode] = useState<string>('BOX-482');
  const [printFeedback, setPrintFeedback] = useState<string | null>(null);

  const handleGenerate = () => {
    if (mode === 'single') {
      const code = `BOX-${Math.floor(100 + Math.random() * 900)}`;
      setGeneratedBarcode(code);
    } else {
      setGeneratedBarcode(`BOX-201 ➔ BOX-${200 + Number(batchCount)}`);
    }
    setIsSuccess(true);
  };

  const handlePrint = () => {
    setPrintFeedback('Dispatched print job to Mobile Zebra Printer ZQ521.');
    setTimeout(() => setPrintFeedback(null), 3500);
  };

  const barcodeBars = [3, 1, 2, 1, 4, 1, 2, 3, 2, 1, 1, 3, 4, 1, 2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 3, 1, 2, 3, 1, 2, 4, 1];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Mode Switcher */}
      {!isSuccess && (
        <View style={styles.modeSwitcher}>
          <Pressable
            onPress={() => setMode('single')}
            style={[styles.modeBtn, mode === 'single' && styles.modeBtnActive]}
          >
            <Text style={[styles.modeText, mode === 'single' && styles.modeTextActive]}>
              📦 Single Tote
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('batch')}
            style={[styles.modeBtn, mode === 'batch' && styles.modeBtnActive]}
          >
            <Text style={[styles.modeText, mode === 'batch' && styles.modeTextActive]}>
              📚 Batch Mode (Multi-Tote)
            </Text>
          </Pressable>
        </View>
      )}

      {printFeedback && (
        <View style={styles.printToast}>
          <Text style={styles.printToastText}>🖨️ {printFeedback}</Text>
        </View>
      )}

      {isSuccess ? (
        <View style={styles.successCard}>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>✓</Text>
          </View>
          <Text style={styles.successTitle}>
            {mode === 'single' ? 'Container Ingested!' : `${batchCount} Containers Ingested!`}
          </Text>
          <Text style={styles.successSub}>
            Tote container registered to Central Registry at Inbound Dock 01.
          </Text>

          {/* Barcode Graphic Sticker */}
          <View style={styles.barcodeTicket}>
            <Text style={styles.barcodeTicketLabel}>
              GENERATED BARCODE LABEL (CODE 128)
            </Text>

            <View style={styles.barcodeArt}>
              {barcodeBars.map((w, idx) => (
                <View
                  key={idx}
                  style={[styles.barcodeBar, { width: w * 2 }]}
                />
              ))}
            </View>

            <Text style={styles.barcodeCodeText}>{generatedBarcode}</Text>
            <Text style={styles.barcodeProductText}>
              {quantity} units × {product}
            </Text>

            <View style={styles.stagedLoc}>
              <Text style={styles.stagedLocLabel}>Staged Location:</Text>
              <Text style={styles.stagedLocVal}>Inbound Dock 01</Text>
            </View>
          </View>

          {/* Print & Return Actions */}
          <View style={styles.successActions}>
            <Button
              label={mode === 'single' ? 'Print Barcode Label' : `Print ${batchCount} Labels`}
              onPress={handlePrint}
              variant="primary"
              size="md"
            />
            <View style={{ height: 8 }} />
            <Button
              label="Ingest Another Container"
              onPress={() => setIsSuccess(false)}
              variant="secondary"
              size="md"
            />
          </View>
        </View>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.cardHeading}>Inbound Cargo Induction</Text>
          <Text style={styles.cardSub}>
            Pack physical items into standard totes and generate registration barcodes
          </Text>

          {/* Category Picker */}
          <Text style={styles.fieldLabel}>PRODUCT CATEGORY</Text>
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

          {/* Product Picker */}
          <Text style={styles.fieldLabel}>TARGET PRODUCT SKU</Text>
          <View style={styles.productChips}>
            {(CATEGORIES[category] || []).map((p) => {
              const isSelected = product === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setProduct(p)}
                  style={[styles.productItem, isSelected && styles.productItemSelected]}
                >
                  <Text style={[styles.productItemText, isSelected && styles.productItemTextSelected]}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>

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
            />
          )}

          <Button
            label={mode === 'single' ? 'GENERATE & INGEST TOTE' : `GENERATE BATCH (${batchCount} TOTES)`}
            onPress={handleGenerate}
            variant="primary"
            size="lg"
            style={{ marginTop: 8 }}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 4,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: colors.surface,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  modeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  modeTextActive: {
    color: colors.primary,
  },
  printToast: {
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  printToastText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  cardSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textMuted,
    marginBottom: 6,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.textInverse,
  },
  productChips: {
    gap: 6,
    marginBottom: 14,
  },
  productItem: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productItemSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  productItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  productItemTextSelected: {
    color: colors.primaryDark,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.successBorder,
    padding: 20,
    alignItems: 'center',
  },
  successBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successBadgeText: {
    fontSize: 24,
    color: colors.textInverse,
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  successSub: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  barcodeTicket: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  barcodeTicketLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 10,
  },
  barcodeArt: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
    marginBottom: 8,
  },
  barcodeBar: {
    height: '80%',
    backgroundColor: '#0f172a',
    borderRadius: 0.5,
  },
  barcodeCodeText: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
    letterSpacing: 1,
    color: colors.textPrimary,
  },
  barcodeProductText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  stagedLoc: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 10,
  },
  stagedLocLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
  stagedLocVal: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  successActions: {
    width: '100%',
  },
});
