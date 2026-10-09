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
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
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
  { name: 'Electronic Components', container: 'BOX-101', defaultQty: '45', source: 'DOCK-IN-01', destination: 'RACK-A-02' },
  { name: 'Control Module (CM-3100)', container: 'BOX-102', defaultQty: '25', source: 'DOCK-IN-01', destination: 'RACK-B-04' },
  { name: 'Sensor Array (SA-8820)', container: 'BOX-103', defaultQty: '20', source: 'RACK-D-01', destination: 'RACK-A-01' },
];

export function TransportCreationScreen() {
  const { goBack, navigate, params } = useNavigation();

  // If passed directly from Quick Dispatch or Home
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
      destination: 'RACK-A-02 · L2 · Bin 03',
      qty: params?.qty || '45',
    },
  ]);
  const [activeSlotIdx, setActiveSlotIdx] = useState<number>(0);
  const [dispatched, setDispatched] = useState<boolean>(false);

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
    setDispatched(true);
    setStep(3);
  };

  const currentSlot = slots[activeSlotIdx] || slots[0];

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={
          step === 1
            ? 'SCR-STF-10 · DISPATCH HUB'
            : `SCR-STF-11 · ${selectedWorkflow.name.toUpperCase()}`
        }
        title={
          step === 1
            ? 'Select Workflow'
            : step === 2
            ? 'Configure Transport Mission'
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

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Step 1: Workflow Template Selection Grid */}
        {step === 1 && (
          <View style={{ gap: 12 }}>
            <View style={styles.workflowIntro}>
              <Text style={styles.workflowIntroTitle}>
                5 Routine + 1 Safety Workflows
              </Text>
              <View style={styles.rbacPill}>
                <Text style={styles.rbacPillText}>Section 8 RBAC</Text>
              </View>
            </View>

            <View style={styles.workflowGrid}>
              {WORKFLOWS.map((wf) => (
                <View key={wf.id} style={{ width: '48%' }}>
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
          <View style={{ gap: 14 }}>
            {/* Workflow Banner */}
            <View style={styles.flowBanner}>
              <View style={styles.flowBadge}>
                <Text style={styles.flowBadgeText}>{selectedWorkflow.category}</Text>
              </View>
              <Text style={styles.flowTitle}>{selectedWorkflow.name}</Text>
              <Text style={styles.flowNote}>{selectedWorkflow.note}</Text>
            </View>

            {/* Flatbed 3-Slot Selector */}
            <View style={styles.deckCard}>
              <View style={styles.deckHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Layers size={16} color={colors.primary} />
                  <Text style={styles.deckTitle}>AMR Flatbed 3-Slot Payload</Text>
                </View>
                <Text style={styles.deckSlotsCount}>{slots.length}/3 Trays Loaded</Text>
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
                      <Text style={[styles.slotTabLabel, isActive && styles.slotTabLabelActive]}>
                        Slot {s.slotNo}
                      </Text>
                      <Text style={[styles.slotTabCode, isActive && styles.slotTabCodeActive]}>
                        {s.container}
                      </Text>
                    </Pressable>
                  );
                })}

                {slots.length < 3 && (
                  <Pressable onPress={handleAddSlot} style={styles.addSlotBtn}>
                    <Plus size={16} color={colors.primary} />
                    <Text style={styles.addSlotText}>+ Add Tote</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Active Slot Configuration Card */}
            <View style={styles.configCard}>
              <View style={styles.slotConfigHeader}>
                <Text style={styles.slotConfigTitle}>
                  Configuring Tray Slot {currentSlot.slotNo}
                </Text>
                {slots.length > 1 && (
                  <Pressable
                    onPress={() => handleRemoveSlot(activeSlotIdx)}
                    style={styles.deleteSlotBtn}
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
                label="Quantity inside Container"
                value={currentSlot.qty}
                onChangeText={(v) => handleUpdateActiveSlot('qty', v)}
                keyboardType="numeric"
                placeholder="e.g. 45"
              />
            </View>

            <Button
              label={`Dispatch Multi-Tote Mission (${slots.length} Totes ➔ AMR-01)`}
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
              <Check size={28} color="#ffffff" />
            </View>
            <Text style={styles.successTitle}>Smart Multi-Tote Dispatch Queued</Text>
            <Text style={styles.successSub}>
              {slots.length} container{slots.length !== 1 ? 's' : ''} allocated to AMR-01 for autonomous transport.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Dispatch Order:</Text>
                <Text style={styles.receiptVal}>TR-2049</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Workflow:</Text>
                <Text style={styles.receiptHighlight}>{selectedWorkflow.name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Assigned Robot:</Text>
                <Text style={styles.receiptSuccess}>AMR-01 (Online · 85%)</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Payload Slots:</Text>
                <Text style={styles.receiptVal}>{slots.length} Containers Loaded</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>First Drop Station:</Text>
                <Text style={styles.receiptVal}>{slots[0].destination}</Text>
              </View>
            </View>

            <View style={{ width: '100%', gap: 8, marginTop: 16 }}>
              <Button
                label="Track on Live Nav2 Map"
                icon={<MapPin size={16} color="#ffffff" />}
                onPress={() => navigate('live_map', { robotId: 'AMR-01', jobId: 'TR-2049' })}
                variant="primary"
                size="lg"
              />
              <Button
                label="Done & Return to Console"
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  workflowIntroTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  rbacPill: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rbacPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  workflowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  flowBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.panel,
  },
  flowBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  flowBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  flowTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 6,
    fontFamily: typography.fontSans,
  },
  flowNote: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  deckCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    ...shadows.panel,
  },
  deckHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deckTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  deckSlotsCount: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  slotsSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  slotTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  slotTabLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  slotTabLabelActive: {
    color: colors.primary,
    fontWeight: '900',
  },
  slotTabCode: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    marginTop: 2,
  },
  slotTabCodeActive: {
    color: colors.primary,
  },
  addSlotBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  addSlotText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 2,
  },
  configCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.panel,
  },
  slotConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  slotConfigTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  deleteSlotBtn: {
    padding: 4,
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
    fontFamily: typography.fontMono,
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
