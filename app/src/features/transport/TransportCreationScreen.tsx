import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowRight,
  Check,
  Layers,
  MapPin,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui/Text';
import { WORKFLOWS, WorkflowItem } from './workflowTemplates';
import { WorkflowTemplateCard } from './WorkflowTemplateCard';

interface SlotItem {
  slotNo: 1 | 2 | 3;
  container: string;
  product: string;
  source: string;
  destination: string;
  qty: string;
}

const PRESET_PRODUCTS = [
  { name: 'Electronic Components', container: 'BOX-101', defaultQty: '45', source: 'DOCK-IN-01', destination: 'RACK-A-02 · L2 · Bin 03' },
  { name: 'Control Module (CM-3100)', container: 'BOX-102', defaultQty: '25', source: 'DOCK-IN-01', destination: 'RACK-B-04 · L1 · Bin 02' },
  { name: 'Sensor Array (SA-8820)', container: 'BOX-103', defaultQty: '20', source: 'RACK-D-01', destination: 'RACK-A-01 · L3 · Bin 01' },
];

export function TransportCreationScreen() {
  const { goBack, navigate, params } = useNavigation();

  const initialWorkflowName = params?.workflow || 'Inbound Putaway';
  const initialContainer = params?.container || 'BOX-101';
  const initialProduct = params?.product || 'Electronic Components';
  const initialSource = params?.source || 'DOCK-IN-01';

  // Step 1: Workflow Pick, Step 2: Configure Slots & Route, Step 3: Success
  const [step, setStep] = useState<number>(params?.workflow ? 2 : 1);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowItem>(
    WORKFLOWS.find((w) => w.name === initialWorkflowName) || WORKFLOWS[0]
  );

  const [slots, setSlots] = useState<SlotItem[]>([
    {
      slotNo: 1,
      container: initialContainer,
      product: initialProduct,
      source: initialSource,
      destination: 'RACK-A-02 · Level 2 · Bin 03',
      qty: params?.qty || '45',
    },
  ]);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);

  const handleSelectWorkflow = (wf: WorkflowItem) => {
    setSelectedWorkflow(wf);
    if (wf.id === 'replenishment') {
      navigate('replenishment');
    } else if (wf.id === 'point-to-point') {
      navigate('point_to_point');
    } else if (wf.id === 'block-path') {
      navigate('block_path');
    } else {
      setStep(2);
    }
  };

  const handleAddSlot = () => {
    if (slots.length >= 3) return;
    const nextSlotNo = (slots.length + 1) as 1 | 2 | 3;
    const preset = PRESET_PRODUCTS[(nextSlotNo - 1) % PRESET_PRODUCTS.length];
    setSlots([
      ...slots,
      {
        slotNo: nextSlotNo,
        container: `BOX-10${nextSlotNo}`,
        product: preset.name,
        source: selectedWorkflow.id === 'inbound' ? 'DOCK-IN-01' : preset.source,
        destination: preset.destination,
        qty: preset.defaultQty,
      },
    ]);
    setActiveSlotIdx(slots.length);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) return;
    const filtered = slots
      .filter((_, i) => i !== index)
      .map((s, idx) => ({ ...s, slotNo: (idx + 1) as 1 | 2 | 3 }));
    setSlots(filtered);
    setActiveSlotIdx(Math.max(0, index - 1));
  };

  const handleUpdateActiveSlot = (field: keyof SlotItem, val: string) => {
    const updated = [...slots];
    updated[activeSlotIdx] = {
      ...updated[activeSlotIdx],
      [field]: val,
    };
    setSlots(updated);
  };

  const handleConfirmDispatch = () => {
    setStep(3);
  };

  const currentSlot = slots[activeSlotIdx] || slots[0];

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={
          step === 1
            ? 'New Transport Request'
            : selectedWorkflow.name
        }
        title={
          step === 1
            ? 'Select Workflow'
            : step === 2
            ? 'Configure Mission Payload'
            : 'Dispatch Confirmed'
        }
        onBack={() => {
          if (step === 2 && !params?.workflow) {
            setStep(1);
          } else {
            goBack();
          }
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Step 1: Workflow Template Selection Grid */}
        {step === 1 && (
          <View style={{ gap: 14 }}>
            <View style={styles.workflowIntro}>
              <View>
                <Text variant="headline" style={styles.workflowIntroTitle}>
                  Available Mission Templates
                </Text>
                <Text variant="caption" color={colors.textSecondary}>
                  Choose a predefined orchestration pattern for autonomous AMR movement.
                </Text>
              </View>
            </View>

            <View style={styles.workflowGrid}>
              {WORKFLOWS.map((wf) => (
                <View key={wf.id} style={styles.workflowGridItem}>
                  <WorkflowTemplateCard
                    workflow={wf}
                    onSelect={handleSelectWorkflow}
                  />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Step 2: Multi-Slot Chassis Dispatch Configuration */}
        {step === 2 && (
          <View style={{ gap: 16 }}>
            {/* Workflow Banner */}
            <View style={styles.flowBanner}>
              <View style={styles.flowBannerTop}>
                <View style={styles.flowBadge}>
                  <Text variant="caption" color={colors.primaryText} style={styles.flowBadgeText}>
                    {selectedWorkflow.category}
                  </Text>
                </View>
                <Text variant="headline" numberOfLines={1} style={styles.flowTitle}>
                  {selectedWorkflow.name}
                </Text>
              </View>
              <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                Template Code: {selectedWorkflow.code}
              </Text>
            </View>

            {/* Flatbed 3-Slot Selector */}
            <View style={styles.deckCard}>
              <View style={styles.deckHeader}>
                <View style={styles.deckHeaderLeft}>
                  <Layers size={16} color={colors.primary} />
                  <Text variant="bodyMedium" style={styles.deckTitle}>
                    AMR Flatbed 3-Slot Payload
                  </Text>
                </View>
                <View style={styles.deckSlotsBadge}>
                  <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                    {slots.length} / 3 Trays Active
                  </Text>
                </View>
              </View>

              <View style={styles.slotsSelectorRow}>
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
                        variant="caption"
                        color={isActive ? colors.textPrimary : colors.textMuted}
                        style={[styles.slotTabLabel, isActive && styles.slotTabLabelActive]}
                      >
                        Slot {s.slotNo}
                      </Text>
                      <Text
                        variant="caption"
                        color={isActive ? colors.textPrimary : colors.textSecondary}
                        style={[styles.slotTabCode, isActive && styles.slotTabCodeActive]}
                      >
                        {s.container}
                      </Text>
                    </Pressable>
                  );
                })}

                {slots.length < 3 && (
                  <Pressable onPress={handleAddSlot} style={styles.addSlotBtn}>
                    <Plus size={15} color={colors.primary} />
                    <Text variant="caption" color={colors.primary} style={styles.addSlotText}>
                      + Add Tote
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Active Slot Configuration Card */}
            <View style={styles.configCard}>
              <View style={styles.slotConfigHeader}>
                <Text variant="headline" style={styles.slotConfigTitle}>
                  Configuring Tray Slot {currentSlot.slotNo}
                </Text>
                {slots.length > 1 && (
                  <Pressable
                    onPress={() => handleRemoveSlot(activeSlotIdx)}
                    style={styles.deleteSlotBtn}
                    accessibilityLabel={`Remove Slot ${currentSlot.slotNo}`}
                  >
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                )}
              </View>

              <Input
                label="Container Barcode (Tote ID)"
                value={currentSlot.container}
                onChangeText={(v) => handleUpdateActiveSlot('container', v)}
                placeholder="e.g. BOX-101"
              />

              <Input
                label="Product Cargo SKU"
                value={currentSlot.product}
                onChangeText={(v) => handleUpdateActiveSlot('product', v)}
                placeholder="e.g. Electronic Components"
              />

              <Input
                label="Pickup Source Station"
                value={currentSlot.source}
                onChangeText={(v) => handleUpdateActiveSlot('source', v)}
                placeholder="e.g. DOCK-IN-01"
              />

              <Input
                label="Dropoff Destination Location"
                value={currentSlot.destination}
                onChangeText={(v) => handleUpdateActiveSlot('destination', v)}
                placeholder="e.g. RACK-A-02 · Level 2 · Bin 03"
              />

              <Input
                label="Cargo Quantity in Tote"
                value={currentSlot.qty}
                onChangeText={(v) => handleUpdateActiveSlot('qty', v)}
                keyboardType="numeric"
                placeholder="e.g. 45"
              />
            </View>

            <Button
              label="Dispatch Mission"
              icon={<Rocket size={18} color="#ffffff" />}
              onPress={handleConfirmDispatch}
              variant="primary"
              size="lg"
            />
          </View>
        )}

        {/* Step 3: Success Confirmation Screen */}
        {step === 3 && (
          <View style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Check size={28} color="#ffffff" strokeWidth={2.8} />
            </View>

            <Text variant="title" style={styles.successTitle}>
              Transport Mission Dispatched
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.successSub}>
              {slots.length} container{slots.length !== 1 ? 's' : ''} assigned to AMR-01 for autonomous routing.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Dispatch Order:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>TR-2049</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Workflow:</Text>
                <Text variant="caption" color={colors.primary} style={styles.receiptHighlight}>
                  {selectedWorkflow.name}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Assigned Carrier:</Text>
                <Text variant="caption" color={colors.success} style={styles.receiptSuccess}>
                  AMR-01 (Online · 85% Battery)
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Payload Slots:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>
                  {slots.length} Containers Loaded
                </Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text variant="caption" color={colors.textSecondary}>First Waypoint:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>
                  {slots[0].destination}
                </Text>
              </View>
            </View>

            <View style={styles.successActions}>
              <Button
                label="Track on Live Map"
                icon={<MapPin size={16} color="#ffffff" />}
                onPress={() => navigate('live_map', { robotId: 'AMR-01', jobId: 'TR-2049' })}
                variant="primary"
                size="lg"
              />
              <Button
                label="Back to Transport Hub"
                onPress={goBack}
                variant="outline"
                size="md"
              />
            </View>
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
  workflowIntro: {
    marginBottom: 4,
  },
  workflowIntroTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  workflowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  workflowGridItem: {
    width: '48%',
  },
  flowBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
    ...shadows.sm,
  },
  flowBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flowBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  flowBadgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  flowTitle: {
    fontWeight: '700',
    flex: 1,
  },
  deckCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    ...shadows.sm,
  },
  deckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deckHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deckTitle: {
    fontWeight: '700',
  },
  deckSlotsBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotsSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 2,
  },
  slotTabActive: {
    backgroundColor: colors.surface,
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  slotTabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  slotTabLabelActive: {
    fontWeight: '700',
  },
  slotTabCode: {
    fontWeight: '700',
  },
  slotTabCodeActive: {
    fontWeight: '800',
  },
  addSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderStyle: 'dashed',
    backgroundColor: colors.primaryLight,
  },
  addSlotText: {
    fontWeight: '700',
    fontSize: 11,
  },
  configCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
    ...shadows.sm,
  },
  slotConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  slotConfigTitle: {
    fontWeight: '700',
  },
  deleteSlotBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
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
