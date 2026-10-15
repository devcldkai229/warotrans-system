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
  Navigation,
  RotateCw,
  Route as RouteIcon,
  Shuffle,
  Zap,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui/Text';

const STATIONS = [
  { id: 'DOCK-IN-01', name: 'Inbound Dock 01', type: 'Receiving' },
  { id: 'DOCK-OUT-01', name: 'Outbound Dock 01', type: 'Shipping' },
  { id: 'QA-02', name: 'QA Station 02', type: 'Inspection' },
  { id: 'ASSEMBLY-01', name: 'Assembly Bench 01', type: 'Production' },
  { id: 'PACKING-01', name: 'Packing Bench 01', type: 'Outbound' },
  { id: 'RACK-D-01', name: 'Bulk Yard D', type: 'Heavy Storage' },
  { id: 'RACK-A-02', name: 'Rack A · Level 2', type: 'Standard Shelf' },
];

export function PointToPointScreen() {
  const { goBack, navigate } = useNavigation();
  const [origin, setOrigin] = useState('QA-02');
  const [destination, setDestination] = useState('PACKING-01');
  const [cargoTag, setCargoTag] = useState('TOTE-EXP-08');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [dispatched, setDispatched] = useState(false);

  const handleApplyEmptyTotePreset = () => {
    setOrigin('DOCK-OUT-01');
    setDestination('DOCK-IN-01');
    setCargoTag('EMPTY-TOTE-STACK');
    setPriority('normal');
  };

  const handleDispatch = () => {
    setDispatched(true);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Ad-hoc Transfer"
        title="Point-to-Point Transport"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {dispatched ? (
          <View style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Check size={28} color="#ffffff" strokeWidth={2.8} />
            </View>

            <Text variant="title" style={styles.successTitle}>
              Point-to-Point Dispatched
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.successSub}>
              AMR-02 allocated for direct transit from {origin} to {destination}.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Origin Station:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>{origin}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Destination:</Text>
                <Text variant="caption" color={colors.primary} style={styles.receiptHighlight}>{destination}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Cargo ID:</Text>
                <Text variant="caption" color={colors.textPrimary} style={styles.receiptVal}>{cargoTag}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Speed Priority:</Text>
                <Text variant="caption" color={priority === 'urgent' ? colors.warning : colors.textPrimary} style={styles.receiptVal}>
                  {priority === 'urgent' ? 'Urgent / Priority Lane' : 'Standard Speed'}
                </Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text variant="caption" color={colors.textSecondary}>Assigned Robot:</Text>
                <Text variant="caption" color={colors.success} style={styles.receiptSuccess}>
                  AMR-02 (Ready)
                </Text>
              </View>
            </View>

            <View style={styles.successActions}>
              <Button
                label="Track on Live Map"
                variant="primary"
                size="lg"
                onPress={() => navigate('live_map', { robotId: 'AMR-02', jobId: 'P2P-DIRECT' })}
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
            {/* Quick 1-Touch Preset: Return Empty Totes */}
            <Pressable
              onPress={handleApplyEmptyTotePreset}
              style={({ pressed }) => [
                styles.presetCard,
                pressed && styles.presetPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Apply empty tote return preset"
            >
              <View style={styles.presetLeft}>
                <View style={styles.presetIconWell}>
                  <RotateCw size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '700' }}>
                    Quick Preset · Return Empty Totes
                  </Text>
                </View>
              </View>
              <View style={styles.presetPill}>
                <Text variant="caption" color={colors.primaryText} style={{ fontWeight: '700', fontSize: 11 }}>
                  1-Tap
                </Text>
              </View>
            </Pressable>

            {/* Origin Station Selection */}
            <View style={styles.sectionCard}>
              <Text variant="label" style={styles.sectionHeaderTitle}>
                Origin Station (From)
              </Text>
              <View style={styles.stationChipsGrid}>
                {STATIONS.map((st) => {
                  const isSelected = origin === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setOrigin(st.id)}
                      style={[
                        styles.stationChip,
                        isSelected && styles.stationChipSelected,
                      ]}
                    >
                      <Text
                        variant="caption"
                        color={isSelected ? '#ffffff' : colors.textPrimary}
                        style={[styles.stationChipId, isSelected && styles.textWhite]}
                        numberOfLines={1}
                      >
                        {st.id}
                      </Text>
                      <Text
                        variant="caption"
                        color={isSelected ? 'rgba(255, 255, 255, 0.8)' : colors.textSecondary}
                        numberOfLines={1}
                      >
                        {st.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Route Connector Indicator */}
            <View style={styles.connectorRow}>
              <View style={styles.connectorLine} />
              <View style={styles.connectorBadge}>
                <RouteIcon size={13} color={colors.primary} />
                <Text variant="caption" color={colors.primaryText} style={{ fontWeight: '700' }}>
                  Est. 38m · ~2m 45s transit
                </Text>
              </View>
              <View style={styles.connectorLine} />
            </View>

            {/* Destination Station Selection */}
            <View style={styles.sectionCard}>
              <Text variant="label" style={styles.sectionHeaderTitle}>
                Destination Station (To)
              </Text>
              <View style={styles.stationChipsGrid}>
                {STATIONS.map((st) => {
                  const isSelected = destination === st.id;
                  const isSame = origin === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      disabled={isSame}
                      onPress={() => setDestination(st.id)}
                      style={[
                        styles.stationChip,
                        isSelected && styles.stationChipSelected,
                        isSame && styles.stationChipDisabled,
                      ]}
                    >
                      <Text
                        variant="caption"
                        color={isSame ? colors.textMuted : isSelected ? '#ffffff' : colors.textPrimary}
                        style={[styles.stationChipId, isSelected && styles.textWhite]}
                        numberOfLines={1}
                      >
                        {st.id}
                      </Text>
                      <Text
                        variant="caption"
                        color={isSame ? colors.textMuted : isSelected ? 'rgba(255, 255, 255, 0.8)' : colors.textSecondary}
                        numberOfLines={1}
                      >
                        {isSame ? 'Current Origin' : st.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Cargo Tag & Priority Console */}
            <View style={styles.sectionCard}>
              <Text variant="label" style={styles.sectionHeaderTitle}>
                Cargo & Priority Configuration
              </Text>

              <View style={styles.cargoInputRow}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Cargo Tote / Container Tag"
                    value={cargoTag}
                    onChangeText={setCargoTag}
                    placeholder="e.g. TOTE-EXP-08"
                  />
                </View>
                <Pressable
                  onPress={() => setCargoTag(`TOTE-${Math.floor(100 + Math.random() * 900)}`)}
                  style={styles.randomPillBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Generate random container ID"
                >
                  <Shuffle size={13} color={colors.textSecondary} />
                  <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                    Auto-fill
                  </Text>
                </Pressable>
              </View>

              <View style={{ gap: 8, marginTop: 4 }}>
                <Text variant="caption" color={colors.textSecondary} style={{ fontWeight: '600' }}>
                  Dispatch Priority
                </Text>
                <View style={styles.priorityGrid}>
                  <Pressable
                    onPress={() => setPriority('normal')}
                    style={[
                      styles.priorityCard,
                      priority === 'normal' && styles.priorityCardActive,
                    ]}
                  >
                    <Text variant="bodyMedium" style={{ fontWeight: '700' }}>
                      Standard
                    </Text>
                    <Text variant="caption" color={colors.textSecondary}>
                      Standard queue & speed
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setPriority('urgent')}
                    style={[
                      styles.priorityCard,
                      priority === 'urgent' && styles.priorityCardUrgentActive,
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Zap size={14} color={priority === 'urgent' ? colors.warning : colors.textSecondary} />
                      <Text variant="bodyMedium" style={{ fontWeight: '700', color: priority === 'urgent' ? colors.warning : colors.textPrimary }}>
                        Urgent
                      </Text>
                    </View>
                    <Text variant="caption" color={colors.textSecondary}>
                      High-priority traffic lane
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <Button
              label="Dispatch Move"
              icon={<Navigation size={18} color="#ffffff" />}
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
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    ...shadows.sm,
  },
  presetPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  presetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  presetIconWell: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    ...shadows.sm,
  },
  sectionHeaderTitle: {
    fontWeight: '700',
  },
  stationChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stationChip: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  stationChipSelected: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  stationChipDisabled: {
    opacity: 0.45,
    backgroundColor: colors.surfaceMuted,
  },
  stationChipId: {
    fontWeight: '700',
  },
  textWhite: {
    color: '#ffffff',
  },
  connectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  connectorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  connectorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  cargoInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  randomPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    justifyContent: 'center',
  },
  priorityGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityCard: {
    flex: 1,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  priorityCardActive: {
    backgroundColor: colors.surface,
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  priorityCardUrgentActive: {
    backgroundColor: '#fffbeb',
    borderColor: colors.warning,
    borderWidth: 1.5,
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
