import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Layers,
  Minus,
  Plus,
  Warehouse,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { ProgressMeter, StatusPill, Text } from '../../shared/ui';

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

const QUICK_CHIPS = [10, 25, 50];

export function ReplenishmentScreen() {
  const { goBack, navigate } = useNavigation();
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
        label="Internal Transfer"
        title="Pick-Face Replenishment"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {dispatched ? (
          <View style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Check size={28} color="#ffffff" strokeWidth={2.8} />
            </View>

            <Text variant="title" style={styles.successTitle}>
              Replenishment Tour Queued
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.successSub}>
              AMR-01 allocated to transport +{restockQty} units from Bulk Zone D to{' '}
              {currentAlert.location}.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Target SKU:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>{currentAlert.name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Source Buffer:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>{currentAlert.bulkSource}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Destination:</Text>
                <Text variant="caption" color={colors.primary} style={styles.receiptHighlight}>{currentAlert.location}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Replenish Load:</Text>
                <Text variant="caption" color={colors.success} style={styles.receiptSuccess}>+{restockQty} units</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text variant="caption" color={colors.textSecondary}>Projected Level:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>
                  {projectedStock} units (Stock Restored)
                </Text>
              </View>
            </View>

            <View style={styles.successActions}>
              <Button
                label="Track on Live Map"
                variant="primary"
                size="lg"
                onPress={() => navigate('live_map', { robotId: 'AMR-01', jobId: 'REPLENISH-01' })}
              />
              <Button
                label="Back to Transport Hub"
                onPress={goBack}
                variant="outline"
                size="md"
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Active Shortages List */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text variant="label" style={styles.sectionTitle}>
                  Active Pick-Face Shortages
                </Text>
                <Text variant="caption" color={colors.warning}>
                  Below Safety Threshold
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                {SHORTAGES.map((item) => {
                  const isSelected = selectedShortage === item.id;
                  const isCritical = item.urgency === 'CRITICAL';
                  const percent = Math.min(100, (item.current / item.minThreshold) * 100);

                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSelectedShortage(item.id)}
                      style={[
                        styles.shortageCard,
                        isSelected && styles.shortageCardSelected,
                      ]}
                    >
                      <View style={styles.shortageCardTop}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: '700' }}>
                            {item.name}
                          </Text>
                          <Text variant="caption" color={colors.textSecondary}>
                            {item.location} · Tote {item.container}
                          </Text>
                        </View>
                        <StatusPill
                          status={isCritical ? 'FAILED' : 'PAUSED'}
                          label={isCritical ? 'Critical Stock' : 'Low Stock'}
                          tone={isCritical ? 'danger' : 'warning'}
                          size="sm"
                          dot
                        />
                      </View>

                      {/* Stock Level Progress */}
                      <View style={{ gap: 6, marginTop: 4 }}>
                        <View style={styles.stockNumbersRow}>
                          <Text variant="caption" color={colors.textSecondary}>
                            Current: {item.current} units
                          </Text>
                          <Text variant="caption" color={colors.textMuted}>
                            Min: {item.minThreshold} units
                          </Text>
                        </View>
                        <ProgressMeter
                          value={percent}
                          tone={isCritical ? 'danger' : 'warning'}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Replenish Quantity Adjuster */}
            <View style={styles.sectionCard}>
              <Text variant="label" style={styles.sectionTitle}>
                Replenish Load Size
              </Text>

              <View style={styles.qtyControlRow}>
                <Pressable
                  onPress={() => setRestockQty((q) => Math.max(5, q - 5))}
                  style={styles.qtyStepBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity by 5"
                >
                  <Minus size={18} color={colors.textPrimary} />
                </Pressable>

                <View style={styles.qtyDisplayCol}>
                  <Text variant="display" style={styles.qtyNumberText}>
                    +{restockQty}
                  </Text>
                  <Text variant="caption" color={colors.textSecondary}>
                    units to transfer
                  </Text>
                </View>

                <Pressable
                  onPress={() => setRestockQty((q) => Math.min(80, q + 5))}
                  style={styles.qtyStepBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity by 5"
                >
                  <Plus size={18} color={colors.textPrimary} />
                </Pressable>
              </View>

              {/* Quick Preset Chips */}
              <View style={styles.chipsRow}>
                {QUICK_CHIPS.map((chip) => {
                  const isActive = restockQty === chip;
                  return (
                    <Pressable
                      key={chip}
                      onPress={() => setRestockQty(chip)}
                      style={[styles.quickChip, isActive && styles.quickChipActive]}
                    >
                      <Text
                        variant="caption"
                        color={isActive ? colors.primaryText : colors.textPrimary}
                        style={{ fontWeight: isActive ? '700' : '500' }}
                      >
                        +{chip} units
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.bufferInfoBox}>
                <Warehouse size={16} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text variant="caption" color={colors.textSecondary}>
                    Source: {currentAlert.bulkSource}
                  </Text>
                  <Text variant="caption" color={colors.success} style={{ fontWeight: '600' }}>
                    Projected after restock: {projectedStock} units
                  </Text>
                </View>
              </View>
            </View>

            <Button
              label="Dispatch Replenishment"
              icon={<ArrowRight size={18} color="#ffffff" />}
              onPress={handleDispatch}
              variant="primary"
              size="lg"
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
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontWeight: '700',
  },
  shortageCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  shortageCardSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  shortageCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  stockNumbersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
  },
  qtyStepBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyDisplayCol: {
    alignItems: 'center',
    minWidth: 100,
  },
  qtyNumberText: {
    fontWeight: '800',
    fontSize: 32,
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  bufferInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    padding: 10,
    marginTop: 4,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    ...shadows.md,
  },
  successIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  successTitle: {
    fontWeight: '800',
    textAlign: 'center',
  },
  successSub: {
    textAlign: 'center',
    lineHeight: 18,
  },
  receiptBox: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    marginTop: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptVal: {
    fontWeight: '700',
  },
  receiptHighlight: {
    fontWeight: '700',
  },
  receiptSuccess: {
    fontWeight: '700',
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 2,
  },
  successActions: {
    width: '100%',
    gap: 10,
    marginTop: 12,
  },
});
