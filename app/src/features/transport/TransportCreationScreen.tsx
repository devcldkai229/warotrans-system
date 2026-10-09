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
import { WorkflowCode } from '../../shared/types/contracts';
import { FACILITY_ENDPOINTS, PRESET_CONTAINERS } from './endpointsCatalog';
import { WORKFLOW_TEMPLATES } from './workflowTemplates';

interface SlotConfig {
  slotNo: 1 | 2 | 3;
  containerBarcode: string;
  productName: string;
  quantity: string;
}

export function TransportCreationScreen() {
  const { navigate, goBack, params } = useNavigation();

  // Wizard Step (1: Workflow, 2: Slots, 3: Route, 4: Review, 5: Done)
  const initialWorkflow: WorkflowCode = params?.workflowCode || 'INBOUND_PUTAWAY';
  const [step, setStep] = useState<number>(params?.step || 1);

  // Form State
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowCode>(initialWorkflow);
  const [sourceCode, setSourceCode] = useState<string>('DOCK-01');
  const [destinationCode, setDestinationCode] = useState<string>('RACK-A02');
  const [slots, setSlots] = useState<SlotConfig[]>([
    {
      slotNo: 1,
      containerBarcode: 'BOX-101',
      productName: 'Optical Proximity Sensor X4',
      quantity: '45',
    },
  ]);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdOrderCode, setCreatedOrderCode] = useState<string | null>(null);

  const selectedTemplate =
    WORKFLOW_TEMPLATES.find((t) => t.code === selectedWorkflow) || WORKFLOW_TEMPLATES[0];

  const handleAddSlot = () => {
    if (slots.length >= 3) return;
    const nextSlotNo = (slots.length + 1) as 1 | 2 | 3;
    const preset = PRESET_CONTAINERS[(nextSlotNo - 1) % PRESET_CONTAINERS.length];
    setSlots([
      ...slots,
      {
        slotNo: nextSlotNo,
        containerBarcode: preset.barcode,
        productName: preset.product,
        quantity: String(preset.defaultQty),
      },
    ]);
    setActiveSlotIdx(slots.length);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) return;
    const updated = slots
      .filter((_, i) => i !== index)
      .map((s, idx) => ({ ...s, slotNo: (idx + 1) as 1 | 2 | 3 }));
    setSlots(updated);
    setActiveSlotIdx(Math.max(0, index - 1));
  };

  const handleUpdateCurrentSlot = (field: keyof SlotConfig, value: string) => {
    const updated = [...slots];
    updated[activeSlotIdx] = {
      ...updated[activeSlotIdx],
      [field]: value,
    };
    setSlots(updated);
  };

  const handlePresetFill = (preset: typeof PRESET_CONTAINERS[0]) => {
    const updated = [...slots];
    updated[activeSlotIdx] = {
      ...updated[activeSlotIdx],
      containerBarcode: preset.barcode,
      productName: preset.product,
      quantity: String(preset.defaultQty),
    };
    setSlots(updated);
  };

  const handleSubmitDispatch = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setCreatedOrderCode('TR-2049');
      setStep(5);
    }, 800);
  };

  // -------------------------------------------------------------
  // STEP 5: SUCCESS CONFIRMATION RECEIPT
  // -------------------------------------------------------------
  if (step === 5) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Transport Request Queued!</Text>
          <Text style={styles.successSubtitle}>
            Request #{createdOrderCode} successfully dispatched to AMR Fleet.
          </Text>

          {/* Allocation Info Box */}
          <View style={styles.allocationBox}>
            <View style={styles.allocationRow}>
              <Text style={styles.allocLabel}>Assigned AMR:</Text>
              <Text style={styles.allocRobot}>AMR-01 (Flatbed)</Text>
            </View>
            <View style={styles.allocationRow}>
              <Text style={styles.allocLabel}>Workflow:</Text>
              <Text style={styles.allocVal}>{selectedTemplate.title}</Text>
            </View>
            <View style={styles.allocationRow}>
              <Text style={styles.allocLabel}>Route:</Text>
              <Text style={styles.allocVal}>{sourceCode} ➔ {destinationCode}</Text>
            </View>
            <View style={styles.allocationRow}>
              <Text style={styles.allocLabel}>Total Payload:</Text>
              <Text style={styles.allocVal}>{slots.length} Containers ({slots.length}/3 Slots)</Text>
            </View>

            <View style={styles.slotsBreakdown}>
              {slots.map((s) => (
                <View key={s.slotNo} style={styles.slotReceiptRow}>
                  <Text style={styles.slotReceiptTag}>Slot {s.slotNo}: {s.containerBarcode}</Text>
                  <Text style={styles.slotReceiptItem}>{s.productName} ({s.quantity} units)</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.receiptActions}>
            <Button
              label="Track in AMR Live Monitor"
              onPress={() => navigate('job_monitoring', { jobId: 'JOB-2026-0881' })}
              variant="primary"
              size="md"
            />
            <View style={{ height: 8 }} />
            <Button
              label="Return to Transport Hub"
              onPress={goBack}
              variant="secondary"
              size="md"
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  // -------------------------------------------------------------
  // STEPS 1 - 4: STEPPER WIZARD
  // -------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Wizard Progress Stepper Bar */}
      <View style={styles.stepperBar}>
        {[
          { num: 1, label: 'Workflow' },
          { num: 2, label: 'Containers' },
          { num: 3, label: 'Endpoints' },
          { num: 4, label: 'Review' },
        ].map((item) => {
          const isActive = step === item.num;
          const isDone = step > item.num;
          return (
            <Pressable
              key={item.num}
              onPress={() => {
                if (item.num < step) setStep(item.num);
              }}
              style={styles.stepItem}
            >
              <View
                style={[
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isDone && styles.stepCircleDone,
                ]}
              >
                <Text
                  style={[
                    styles.stepNum,
                    (isActive || isDone) && styles.stepNumActive,
                  ]}
                >
                  {isDone ? '✓' : item.num}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.wizardContent} contentContainerStyle={styles.scrollContent}>
        {/* STEP 1: WORKFLOW SELECTION */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Select Transport Workflow</Text>
            <Text style={styles.stepSubtitle}>
              Choose the operational template for AMR automated dispatch
            </Text>

            <View style={styles.templateList}>
              {WORKFLOW_TEMPLATES.map((tmpl) => {
                const isSelected = selectedWorkflow === tmpl.code;
                return (
                  <Pressable
                    key={tmpl.code}
                    onPress={() => setSelectedWorkflow(tmpl.code)}
                    style={[
                      styles.templateItem,
                      isSelected && styles.templateItemSelected,
                    ]}
                  >
                    <View style={styles.templateIconWrap}>
                      <Text style={styles.templateIcon}>{tmpl.iconName}</Text>
                    </View>
                    <View style={styles.templateDetails}>
                      <Text
                        style={[
                          styles.templateTitle,
                          isSelected && styles.templateTitleSelected,
                        ]}
                      >
                        {tmpl.title}
                      </Text>
                      <Text style={styles.templateDesc}>{tmpl.tagline}</Text>
                    </View>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected && styles.radioCircleSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* STEP 2: MULTI-SLOT CONTAINERS CONFIG */}
        {step === 2 && (
          <View>
            <View style={styles.slotsHeader}>
              <View>
                <Text style={styles.stepTitle}>Configure AMR Payload Slots</Text>
                <Text style={styles.stepSubtitle}>
                  AMR flatbed supports up to 3 standard containers
                </Text>
              </View>
              <Text style={styles.slotsCounter}>{slots.length} / 3 Slots</Text>
            </View>

            {/* Slots Tabs */}
            <View style={styles.slotTabsRow}>
              {slots.map((s, idx) => {
                const isActive = activeSlotIdx === idx;
                return (
                  <Pressable
                    key={s.slotNo}
                    onPress={() => setActiveSlotIdx(idx)}
                    style={[
                      styles.slotTab,
                      isActive && styles.slotTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotTabLabel,
                        isActive && styles.slotTabLabelActive,
                      ]}
                    >
                      Slot {s.slotNo}
                    </Text>
                    <Text
                      style={[
                        styles.slotTabBarcode,
                        isActive && styles.slotTabBarcodeActive,
                      ]}
                      numberOfLines={1}
                    >
                      {s.containerBarcode || 'Empty'}
                    </Text>
                    {slots.length > 1 && (
                      <Pressable
                        onPress={() => handleRemoveSlot(idx)}
                        style={styles.slotRemoveBtn}
                      >
                        <Text style={styles.slotRemoveText}>✕</Text>
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}

              {slots.length < 3 && (
                <Pressable
                  onPress={handleAddSlot}
                  style={styles.addSlotBtn}
                  accessibilityLabel="Add container slot"
                >
                  <Text style={styles.addSlotText}>+ Add</Text>
                </Pressable>
              )}
            </View>

            {/* Active Slot Form */}
            <View style={styles.slotFormCard}>
              <Text style={styles.slotCardTitle}>
                Editing Slot {slots[activeSlotIdx]?.slotNo} Details
              </Text>

              {/* Quick Presets */}
              <Text style={styles.presetLabel}>Quick Ingest Containers:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
                {PRESET_CONTAINERS.map((p) => (
                  <Pressable
                    key={p.barcode}
                    onPress={() => handlePresetFill(p)}
                    style={styles.presetChip}
                  >
                    <Text style={styles.presetChipCode}>{p.barcode}</Text>
                    <Text style={styles.presetChipItem}>{p.product}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Input
                label="Container Barcode"
                value={slots[activeSlotIdx]?.containerBarcode}
                onChangeText={(val) => handleUpdateCurrentSlot('containerBarcode', val)}
                placeholder="BOX-XXX or TOTE-XXX"
                autoCapitalize="characters"
              />

              <Input
                label="Product Name"
                value={slots[activeSlotIdx]?.productName}
                onChangeText={(val) => handleUpdateCurrentSlot('productName', val)}
                placeholder="Product description"
              />

              <Input
                label="Quantity Units"
                value={slots[activeSlotIdx]?.quantity}
                onChangeText={(val) => handleUpdateCurrentSlot('quantity', val)}
                placeholder="e.g. 45"
                keyboardType="numeric"
              />
            </View>
          </View>
        )}

        {/* STEP 3: ENDPOINTS SELECTION */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Select Source & Destination</Text>
            <Text style={styles.stepSubtitle}>
              Specify pickup location and target drop-off bay
            </Text>

            {/* Source Endpoint Selector */}
            <View style={styles.endpointSection}>
              <Text style={styles.endpointLabel}>PICKUP SOURCE ENDPOINT</Text>
              <View style={styles.endpointGrid}>
                {FACILITY_ENDPOINTS.slice(0, 5).map((ep) => {
                  const isSelected = sourceCode === ep.code;
                  return (
                    <Pressable
                      key={`src-${ep.code}`}
                      onPress={() => setSourceCode(ep.code)}
                      style={[
                        styles.endpointItem,
                        isSelected && styles.endpointItemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.epCode,
                          isSelected && styles.epCodeSelected,
                        ]}
                      >
                        {ep.code}
                      </Text>
                      <Text style={styles.epName} numberOfLines={1}>{ep.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Destination Endpoint Selector */}
            <View style={styles.endpointSection}>
              <Text style={styles.endpointLabel}>DELIVERY DESTINATION ENDPOINT</Text>
              <View style={styles.endpointGrid}>
                {FACILITY_ENDPOINTS.map((ep) => {
                  const isSelected = destinationCode === ep.code;
                  return (
                    <Pressable
                      key={`dest-${ep.code}`}
                      onPress={() => setDestinationCode(ep.code)}
                      style={[
                        styles.endpointItem,
                        isSelected && styles.endpointItemSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.epCode,
                          isSelected && styles.epCodeSelected,
                        ]}
                      >
                        {ep.code}
                      </Text>
                      <Text style={styles.epName} numberOfLines={1}>{ep.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* STEP 4: REVIEW & CONFIRM */}
        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Review Dispatch Order</Text>
            <Text style={styles.stepSubtitle}>
              Verify payload and navigation route before AMR transmission
            </Text>

            <View style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewIconWrap}>
                  <Text style={styles.reviewIcon}>{selectedTemplate.iconName}</Text>
                </View>
                <View>
                  <Text style={styles.reviewWfTitle}>{selectedTemplate.title}</Text>
                  <Text style={styles.reviewEstimated}>Estimated Duration: {selectedTemplate.estimatedDuration}</Text>
                </View>
              </View>

              {/* Route Summary */}
              <View style={styles.reviewRouteBox}>
                <View style={styles.routeCol}>
                  <Text style={styles.routeColTag}>SOURCE</Text>
                  <Text style={styles.routeColCode}>{sourceCode}</Text>
                </View>
                <Text style={styles.routeArrow}>➔</Text>
                <View style={styles.routeCol}>
                  <Text style={styles.routeColTag}>DESTINATION</Text>
                  <Text style={styles.routeColCode}>{destinationCode}</Text>
                </View>
              </View>

              {/* Payload Breakdown */}
              <Text style={styles.reviewPayloadTitle}>
                Payload Containers ({slots.length}/3 Slots)
              </Text>
              {slots.map((s) => (
                <View key={s.slotNo} style={styles.reviewSlotItem}>
                  <View style={styles.reviewSlotPill}>
                    <Text style={styles.reviewSlotPillText}>Slot {s.slotNo}</Text>
                  </View>
                  <View style={styles.reviewSlotInfo}>
                    <Text style={styles.reviewSlotBarcode}>{s.containerBarcode}</Text>
                    <Text style={styles.reviewSlotProd}>{s.productName} ({s.quantity} units)</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Stepper Navigation Buttons */}
      <View style={styles.bottomNav}>
        {step > 1 && (
          <Button
            label="Back"
            onPress={() => setStep(step - 1)}
            variant="secondary"
            size="md"
            style={styles.backNavBtn}
          />
        )}
        <Button
          label={step === 4 ? 'DISPATCH TO AMR FLEET' : 'Continue ➔'}
          onPress={() => {
            if (step === 4) {
              handleSubmitDispatch();
            } else {
              setStep(step + 1);
            }
          }}
          loading={isSubmitting}
          variant="primary"
          size="md"
          style={styles.nextNavBtn}
        />
      </View>
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
    paddingBottom: 24,
  },
  stepperBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepCircleDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepNum: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  stepNumActive: {
    color: colors.textInverse,
  },
  stepLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.primary,
  },
  wizardContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  stepSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 12,
  },
  templateList: {
    gap: 8,
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  templateItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  templateIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateIcon: {
    fontSize: 18,
  },
  templateDetails: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  templateTitleSelected: {
    color: colors.primaryDark,
  },
  templateDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  slotsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  slotsCounter: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: 'monospace',
  },
  slotTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  slotTab: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 8,
    position: 'relative',
  },
  slotTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  slotTabLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
  },
  slotTabLabelActive: {
    color: colors.primary,
  },
  slotTabBarcode: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
    marginTop: 2,
  },
  slotTabBarcodeActive: {
    color: colors.primaryDark,
  },
  slotRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 2,
  },
  slotRemoveText: {
    fontSize: 10,
    color: colors.textMuted,
  },
  addSlotBtn: {
    width: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  addSlotText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  slotFormCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
  },
  slotCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  presetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
  },
  presetsScroll: {
    marginBottom: 12,
  },
  presetChip: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginRight: 6,
  },
  presetChipCode: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: colors.textPrimary,
  },
  presetChipItem: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
  },
  endpointSection: {
    marginBottom: 16,
  },
  endpointLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.textMuted,
    marginBottom: 8,
  },
  endpointGrid: {
    gap: 6,
  },
  endpointItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  endpointItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  epCode: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  epCodeSelected: {
    color: colors.primaryDark,
  },
  epName: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  reviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  reviewIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewIcon: {
    fontSize: 18,
  },
  reviewWfTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  reviewEstimated: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  reviewRouteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    padding: 12,
    marginVertical: 12,
  },
  routeCol: {
    flex: 1,
  },
  routeColTag: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
  },
  routeColCode: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primaryDark,
    marginTop: 2,
  },
  routeArrow: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '900',
    paddingHorizontal: 8,
  },
  reviewPayloadTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  reviewSlotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
  },
  reviewSlotPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  reviewSlotPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  reviewSlotInfo: {
    flex: 1,
  },
  reviewSlotBarcode: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  reviewSlotProd: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    gap: 10,
  },
  backNavBtn: {
    flex: 1,
  },
  nextNavBtn: {
    flex: 2,
  },
  successCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successIcon: {
    fontSize: 24,
    color: colors.textInverse,
    fontWeight: '900',
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  successSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  allocationBox: {
    width: '100%',
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    marginBottom: 16,
  },
  allocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allocLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  allocRobot: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  allocVal: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  slotsBreakdown: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 4,
  },
  slotReceiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slotReceiptTag: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primaryDark,
  },
  slotReceiptItem: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  receiptActions: {
    width: '100%',
  },
});
