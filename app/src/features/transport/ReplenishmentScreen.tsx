import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Check,
  Layers,
  Warehouse,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

const SHORTAGES = [
  {
    id: 'RACK-A-01',
    name: 'Sensor Array (SA-8820)',
    location: 'Rack A · Level 1 · Bin 04',
    current: 3,
    minThreshold: 15,
    urgency: 'CRITICAL',
    container: 'BOX-301',
    bulkSource: 'Zone D · Heavy Parts (RACK-D-01)',
  },
  {
    id: 'RACK-B-04',
    name: 'Control Module (CM-3100)',
    location: 'Rack B · Level 3 · Bin 02',
    current: 7,
    minThreshold: 20,
    urgency: 'WARNING',
    container: 'BOX-204',
    bulkSource: 'Zone D · Heavy Parts (RACK-D-01)',
  },
];

export function ReplenishmentScreen() {
  const { goBack } = useNavigation();
  const [selectedShortage, setSelectedShortage] = useState('RACK-A-01');
  const [restockQty, setRestockQty] = useState(25);
  const [dispatched, setDispatched] = useState(false);

  const currentAlert =
    SHORTAGES.find((s) => s.id === selectedShortage) || SHORTAGES[0];
  const projectedStock = currentAlert.current + restockQty;

  const handleDispatch = () => {
    setDispatched(true);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="SCR-STF-21 · REPLENISHMENT"
        title="Replenishment Dispatch"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {dispatched ? (
          <View style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Check size={28} color="#ffffff" />
            </View>
            <Text style={styles.successTitle}>Replenishment Tour Queued</Text>
            <Text style={styles.successSub}>
              AMR-01 allocated to transport +{restockQty} units from Bulk Zone D to{' '}
              {currentAlert.location}.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Target SKU</Text>
                <Text style={styles.receiptVal}>{currentAlert.name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Source Buffer</Text>
                <Text style={styles.receiptVal}>{currentAlert.bulkSource}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Target Pick Face</Text>
                <Text style={styles.receiptHighlight}>{currentAlert.location}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Replenishment Load</Text>
                <Text style={styles.receiptSuccess}>+{restockQty} units</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Projected Stock</Text>
                <Text style={styles.receiptVal}>{projectedStock} units (Healthy)</Text>
              </View>
            </View>

            <Button
              label="Done & Return to Console"
              onPress={goBack}
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 16 }}
            />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {/* Flow Banner */}
            <View style={styles.introCard}>
              <View style={styles.introIconBox}>
                <Layers size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.introTitle}>Pick-Face Replenishment Flow</Text>
                <Text style={styles.introDesc}>
                  Restock high-velocity picking bins from bulk reserve storage (Zone D).
                </Text>
              </View>
            </View>

            {/* Step 1: Active Pick-Face Shortages */}
            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>1. ACTIVE PICK-FACE SHORTAGES</Text>
                <Text style={styles.sectionSubWarning}>Below Min Safety Stock</Text>
              </View>

              <View style={{ gap: 8, marginTop: 6 }}>
                {SHORTAGES.map((item) => {
                  const isSelected = selectedShortage === item.id;
                  const isCritical = item.urgency === 'CRITICAL';
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedShortage(item.id)}
                      style={[
                        styles.shortageCard,
                        isSelected && styles.shortageCardSelected,
                      ]}
                    >
                      <View style={styles.shortageHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.shortageName}>{item.name}</Text>
                          <Text style={styles.shortageCode}>({item.container})</Text>
                        </View>
                        <View
                          style={[
                            styles.urgencyPill,
                            isCritical ? styles.urgencyCritical : styles.urgencyWarning,
                          ]}
                        >
                          <Text
                            style={[
                              styles.urgencyText,
                              isCritical ? styles.urgencyCriticalText : styles.urgencyWarningText,
                            ]}
                          >
                            {item.urgency}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.shortageLoc}>{item.location}</Text>
                      <View style={styles.shortageFooter}>
                        <Text style={styles.shortageStock}>
                          Current:{' '}
                          <Text style={{ color: colors.danger, fontWeight: '900' }}>
                            {item.current} units
                          </Text>{' '}
                          (Min: {item.minThreshold})
                        </Text>
                        <Text style={styles.replenishTap}>Tap to replenish ➔</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Step 2: Source Bulk Buffer */}
            <View style={styles.bulkCard}>
              <Text style={styles.sectionLabel}>2. SOURCE BULK STORAGE BUFFER</Text>
              <View style={styles.bulkRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Warehouse size={16} color={colors.primary} />
                  <Text style={styles.bulkSourceText}>{currentAlert.bulkSource}</Text>
                </View>
                <Text style={styles.bulkStockText}>80 Units in Reserve</Text>
              </View>
            </View>

            {/* Step 3: Quantity Stepper & Projection */}
            <View style={styles.qtyCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>3. REPLENISHMENT QUANTITY</Text>
                <Text style={styles.qtyTotal}>+{restockQty} units</Text>
              </View>

              <View style={styles.qtyControlsRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    value={String(restockQty)}
                    onChangeText={(t) => {
                      const num = Math.max(1, Math.min(80, Number(t) || 0));
                      setRestockQty(num);
                    }}
                    keyboardType="numeric"
                    placeholder="Enter qty"
                    rightIcon={<Text style={styles.unitsSuffix}>units</Text>}
                    containerStyle={{ marginBottom: 0 }}
                  />
                </View>
                <View style={styles.presetButtons}>
                  {[15, 25, 50].map((qty) => (
                    <Pressable
                      key={qty}
                      onPress={() => setRestockQty(qty)}
                      style={[
                        styles.presetBtn,
                        restockQty === qty && styles.presetBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetBtnText,
                          restockQty === qty && styles.presetBtnTextActive,
                        ]}
                      >
                        +{qty}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Stock Delta Bar */}
              <View style={styles.deltaBox}>
                <View style={styles.deltaHeader}>
                  <Text style={styles.deltaText}>
                    Current: <Text style={{ color: colors.danger, fontWeight: '900' }}>{currentAlert.current}</Text>
                  </Text>
                  <Text style={styles.deltaText}>
                    After Restock:{' '}
                    <Text style={{ color: colors.success, fontWeight: '900' }}>{projectedStock} units</Text>
                  </Text>
                </View>

                {/* Progress bar with red current and green added */}
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFillCurrent,
                      { width: `${(currentAlert.current / projectedStock) * 100}%` },
                    ]}
                  />
                  <View
                    style={[
                      styles.barFillRestock,
                      { width: `${(restockQty / projectedStock) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.deltaFootnote}>
                  Restock will lift bin well above safety minimum ({currentAlert.minThreshold} units).
                </Text>
              </View>
            </View>

            <Button
              label={`Dispatch Replenishment Tour (+${restockQty} units)`}
              icon={<Layers size={18} color="#ffffff" />}
              onPress={handleDispatch}
              variant="primary"
              size="lg"
              style={{ marginTop: 6 }}
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 14,
    padding: 12,
    ...shadows.panel,
  },
  introIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  introDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  sectionSubWarning: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.danger,
    fontFamily: typography.fontMono,
  },
  shortageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 12,
    ...shadows.panel,
  },
  shortageCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  shortageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shortageName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  shortageCode: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  urgencyPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  urgencyCritical: {
    backgroundColor: colors.danger,
  },
  urgencyCriticalText: {
    color: '#ffffff',
  },
  urgencyWarning: {
    backgroundColor: colors.warningSoft,
  },
  urgencyWarningText: {
    color: colors.warning,
  },
  urgencyText: {
    fontSize: 8,
    fontWeight: '900',
    fontFamily: typography.fontMono,
  },
  shortageLoc: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.fontMono,
    marginTop: 2,
  },
  shortageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  shortageStock: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  replenishTap: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  bulkCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
    ...shadows.panel,
  },
  bulkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 10,
  },
  bulkSourceText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  bulkStockText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
  },
  qtyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    ...shadows.panel,
  },
  qtyTotal: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  qtyControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unitsSuffix: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  presetBtn: {
    height: 46,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  presetBtnTextActive: {
    color: '#ffffff',
  },
  deltaBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    padding: 10,
    gap: 6,
  },
  deltaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  deltaText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  barTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 999,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  barFillCurrent: {
    height: '100%',
    backgroundColor: colors.danger,
  },
  barFillRestock: {
    height: '100%',
    backgroundColor: colors.success,
  },
  deltaFootnote: {
    fontSize: 9,
    color: colors.textMuted,
    lineHeight: 12,
  },
  successCard: {
    backgroundColor: colors.successBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 18,
    alignItems: 'center',
    ...shadows.panel,
  },
  successIconBadge: {
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
  receiptBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  receiptVal: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  receiptHighlight: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  receiptSuccess: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
});
