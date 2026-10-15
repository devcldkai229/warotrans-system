import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  RotateCcw,
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

const EDGES = [
  { id: 'EDGE-A01-A02', name: 'Aisle A-01 (Between Rack A01 & A02)', zone: 'Zone A Storage' },
  { id: 'EDGE-MAIN-TRANSIT', name: 'Main Transit Corridor (Dock 01 ➔ Rack B)', zone: 'Arterial Highway' },
  { id: 'EDGE-DOCK-RECV', name: 'Dock Receiving Bay 01 Apron', zone: 'Inbound Staging' },
  { id: 'EDGE-PICK-C02', name: 'Zone C Fast-Pick Lane', zone: 'Zone C Pick-Face' },
];

const HAZARD_CATEGORIES = [
  { id: 'LIQUID_SPILL', title: 'Liquid spill', desc: 'Wet / slippery floor surface' },
  { id: 'FALLEN_PALLET', title: 'Fallen pallet', desc: 'Physical cargo / debris obstruction' },
  { id: 'MAINTENANCE', title: 'Maintenance', desc: 'Active facility repairs underway' },
  { id: 'COLLISION_RISK', title: 'Machinery hazard', desc: 'Manual forklift congestion' },
];

export function BlockPathHazardScreen() {
  const { goBack } = useNavigation();
  const [selectedEdge, setSelectedEdge] = useState('EDGE-A01-A02');
  const [hazardType, setHazardType] = useState('LIQUID_SPILL');
  const [severity, setSeverity] = useState<'FULL_BLOCK' | 'CAUTION_ZONE'>('FULL_BLOCK');
  const [duration, setDuration] = useState('30m');
  const [notes, setNotes] = useState('Hydraulic fluid leakage spotted near Rack A-02 column 3. Caution tape placed.');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    triggerHaptic('success');
    setSubmitted(true);
  };

  const handleClear = () => {
    triggerHaptic('tap');
    setSubmitted(false);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Safety exception"
        title="Report Corridor Hazard"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {submitted ? (
          <View style={styles.submittedCard}>
            <View style={styles.submittedIconBadge}>
              <AlertTriangle size={24} color="#dc2626" />
            </View>
            <Text style={styles.submittedTitle}>Corridor blocked & fleet rerouted</Text>
            <Text style={styles.submittedSub}>
              Dynamic edge cost set to ∞. Central Fleet Management System (FMS) has excluded this aisle from navigation meshes.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Blocked edge</Text>
                <Text style={styles.receiptDanger}>{selectedEdge}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Hazard type</Text>
                <Text style={styles.receiptVal}>
                  {hazardType === 'LIQUID_SPILL' && 'Liquid Spill / Wet Floor'}
                  {hazardType === 'FALLEN_PALLET' && 'Fallen Pallet / Cargo Obstacle'}
                  {hazardType === 'MAINTENANCE' && 'Facility Maintenance'}
                  {hazardType === 'COLLISION_RISK' && 'Equipment Collision Risk'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Routing impact</Text>
                <Text style={styles.receiptDanger}>
                  {severity === 'FULL_BLOCK' ? 'Edge cost = ∞ (100% detour)' : 'Caution speed crawl (0.3m/s)'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Fleet telemetry</Text>
                <Text style={styles.receiptHighlight}>AMR-01 rerouted via Corridor B</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Estimated duration</Text>
                <Text style={styles.receiptDuration}>{duration}</Text>
              </View>
            </View>

            <View style={styles.submittedActions}>
              <Button
                label="Reopen corridor"
                icon={<RotateCcw size={16} color={colors.textPrimary} />}
                onPress={handleClear}
                variant="outline"
                size="md"
              />
              <Button
                label="Back to hub"
                onPress={goBack}
                variant="primary"
                size="lg"
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Blocked Corridor / Edge */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>Blocked corridor</Text>
              <View style={{ gap: 8 }}>
                {EDGES.map((e) => {
                  const isSelected = selectedEdge === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => {
                        triggerHaptic('tap');
                        setSelectedEdge(e.id);
                      }}
                      style={[
                        styles.edgeCard,
                        isSelected && styles.edgeCardSelected,
                      ]}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.edgeId}>{e.id}</Text>
                          <View style={styles.edgeZonePill}>
                            <Text style={styles.edgeZoneText}>{e.zone}</Text>
                          </View>
                        </View>
                        <Text style={styles.edgeName}>{e.name}</Text>
                      </View>
                      {isSelected && (
                        <View style={styles.checkBadge}>
                          <Check size={14} color="#ffffff" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Hazard Category */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>Hazard category</Text>
              <View style={styles.hazardGrid}>
                {HAZARD_CATEGORIES.map((h) => {
                  const isSelected = hazardType === h.id;
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => {
                        triggerHaptic('tap');
                        setHazardType(h.id);
                      }}
                      style={[
                        styles.hazardCard,
                        isSelected && styles.hazardCardSelected,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.hazardTitle, isSelected && styles.hazardTitleSelected]}>
                        {h.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Severity & Routing Policy */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>Severity & routing policy</Text>
              <View style={styles.severityRow}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setSeverity('FULL_BLOCK');
                  }}
                  style={[
                    styles.severityBtn,
                    severity === 'FULL_BLOCK' && styles.severityBtnSelectedFull,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.severityTitle}>Full blockage</Text>
                  <Text style={styles.severitySub}>Edge Cost = ∞ (100% detour)</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setSeverity('CAUTION_ZONE');
                  }}
                  style={[
                    styles.severityBtn,
                    severity === 'CAUTION_ZONE' && styles.severityBtnSelectedCaution,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.severityTitle}>Caution zone</Text>
                  <Text style={styles.severitySub}>Slow crawl speed (0.3m/s)</Text>
                </Pressable>
              </View>
            </View>

            {/* Estimated Duration Until Clear */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>Estimated duration</Text>
              <View style={styles.durationRow}>
                {['15m', '30m', '60m', 'Until cleared'].map((dur) => {
                  const isSelected = duration === dur;
                  return (
                    <Pressable
                      key={dur}
                      onPress={() => {
                        triggerHaptic('tap');
                        setDuration(dur);
                      }}
                      style={[
                        styles.durationBtn,
                        isSelected && styles.durationBtnSelected,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.durationBtnText,
                          isSelected && styles.durationBtnTextSelected,
                        ]}
                      >
                        {dur}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Field Observation Notes */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>Field notes</Text>
              <Input
                value={notes}
                onChangeText={setNotes}
                placeholder="Describe hazard details..."
                containerStyle={{ marginBottom: 0 }}
              />
            </View>

            {/* Submit Button in Warm Dark Gray */}
            <Button
              label="Report Hazard"
              icon={<AlertOctagon size={18} color="#ffffff" />}
              onPress={handleSubmit}
              variant="primary"
              size="lg"
              style={{ marginTop: 8 }}
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
    paddingBottom: 48,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  edgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    padding: 14,
    minHeight: 58,
    ...shadows.panel,
  },
  edgeCardSelected: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  edgeId: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  edgeZonePill: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  edgeZoneText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  edgeName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 3,
    fontFamily: typography.fontSans,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.darkAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hazardCard: {
    flex: 1,
    minWidth: 140,
    minHeight: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.panel,
  },
  hazardCardSelected: {
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  hazardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  hazardTitleSelected: {
    color: colors.darkAction,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    flex: 1,
    minHeight: 60,
    padding: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
  },
  severityBtnSelectedFull: {
    borderColor: '#dc2626',
    borderWidth: 1.5,
    backgroundColor: 'rgba(220, 38, 38, 0.04)',
  },
  severityBtnSelectedCaution: {
    borderColor: '#b45309',
    borderWidth: 1.5,
    backgroundColor: 'rgba(245, 158, 11, 0.04)',
  },
  severityTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  severitySub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  durationBtnSelected: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  durationBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  durationBtnTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  submittedCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    padding: 18,
    ...shadows.panel,
  },
  submittedIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  submittedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  submittedSub: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 16,
    fontFamily: typography.fontSans,
  },
  receiptBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  receiptVal: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  receiptDanger: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontMono,
  },
  receiptHighlight: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  receiptDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  submittedActions: {
    marginTop: 18,
    gap: 10,
  },
});
