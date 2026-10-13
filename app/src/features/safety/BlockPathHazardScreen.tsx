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
  Check,
  RotateCcw,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

const EDGES = [
  { id: 'EDGE-A01-A02', name: 'Aisle A-01 (Between Rack A01 & A02)', zone: 'Zone A Storage' },
  { id: 'EDGE-MAIN-TRANSIT', name: 'Main Transit Corridor (Dock 01 ➔ Rack B)', zone: 'Arterial Highway' },
  { id: 'EDGE-DOCK-RECV', name: 'Dock Receiving Bay 01 Apron', zone: 'Inbound Staging' },
  { id: 'EDGE-PICK-C02', name: 'Zone C Fast-Pick Lane', zone: 'Zone C Pick-Face' },
];

const HAZARD_CATEGORIES = [
  { id: 'LIQUID_SPILL', title: 'Liquid Spill', desc: 'Wet / slippery floor' },
  { id: 'FALLEN_PALLET', title: 'Fallen Pallet', desc: 'Cargo / debris on path' },
  { id: 'MAINTENANCE', title: 'Maintenance', desc: 'Active floor repairs' },
  { id: 'COLLISION_RISK', title: 'Machinery Hazard', desc: 'Forklift congestion' },
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
    setSubmitted(true);
  };

  const handleClear = () => {
    setSubmitted(false);
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="SCR-STF-26 · SAFETY EXCEPTION"
        title="Report Block Path Hazard"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {submitted ? (
          <View style={styles.submittedCard}>
            <View style={styles.submittedIconBadge}>
              <AlertOctagon size={30} color="#ffffff" />
            </View>
            <Text style={styles.submittedTitle}>Corridor Blocked & Fleet Rerouted</Text>
            <Text style={styles.submittedSub}>
              Dynamic Edge Cost set to ∞. Central Fleet Management System (FMS) has excluded this aisle from navigation meshes.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Blocked Edge:</Text>
                <Text style={styles.receiptDanger}>{selectedEdge}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Hazard Type:</Text>
                <Text style={styles.receiptVal}>
                  {hazardType === 'LIQUID_SPILL' && 'Liquid Spill / Wet Floor'}
                  {hazardType === 'FALLEN_PALLET' && 'Fallen Pallet / Cargo Obstacle'}
                  {hazardType === 'MAINTENANCE' && 'Facility Maintenance'}
                  {hazardType === 'COLLISION_RISK' && 'Equipment Collision Risk'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Routing Impact:</Text>
                <Text style={styles.receiptDanger}>
                  {severity === 'FULL_BLOCK' ? 'Edge Cost = ∞ (100% Detour)' : 'Caution Speed 0.3m/s'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Fleet Telemetry:</Text>
                <Text style={styles.receiptHighlight}>AMR-01 rerouted via Corridor B</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Est. Duration:</Text>
                <Text style={styles.receiptDuration}>{duration}</Text>
              </View>
            </View>

            <View style={styles.submittedActions}>
              <Pressable
                onPress={handleClear}
                style={styles.reopenBtn}
                accessibilityRole="button"
              >
                <RotateCcw size={16} color={colors.textPrimary} style={{ marginRight: 6 }} />
                <Text style={styles.reopenBtnText}>Reopen Path</Text>
              </Pressable>
              <Pressable
                onPress={goBack}
                style={styles.doneBtn}
                accessibilityRole="button"
              >
                <Text style={styles.doneBtnText}>Done & Return</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Top Banner Card */}
            <View style={styles.introCard}>
              <View style={styles.introIconBox}>
                <AlertOctagon size={22} color="#ffffff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.introTitle}>Floor Hazard & Temporary Obstacle</Text>
                <Text style={styles.introDesc}>
                  Section 8.2 Rule 5: Reports aisle blockages so AMRs automatically detour around the hazard.
                </Text>
              </View>
            </View>

            {/* 1. Select Blocked Corridor / Edge */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>
                1. Select Blocked Corridor / Edge:
              </Text>
              <View style={{ gap: 8 }}>
                {EDGES.map((e) => {
                  const isSelected = selectedEdge === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => setSelectedEdge(e.id)}
                      style={[
                        styles.edgeCard,
                        isSelected ? styles.edgeCardSelected : styles.edgeCardNormal,
                      ]}
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
                      {isSelected && <Check size={18} color="#ef4444" />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 2. Hazard Category */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>
                2. Hazard Category:
              </Text>
              <View style={styles.hazardGrid}>
                {HAZARD_CATEGORIES.map((h) => {
                  const isSelected = hazardType === h.id;
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => setHazardType(h.id)}
                      style={[
                        styles.hazardCard,
                        isSelected ? styles.hazardCardSelected : styles.hazardCardNormal,
                      ]}
                    >
                      <Text style={styles.hazardTitle}>
                        {h.title}
                      </Text>
                      <Text style={styles.hazardDesc}>{h.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 3. Severity & Routing Policy */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel}>
                3. Severity & Routing Policy:
              </Text>
              <View style={styles.severityRow}>
                <Pressable
                  onPress={() => setSeverity('FULL_BLOCK')}
                  style={[
                    styles.severityBtn,
                    severity === 'FULL_BLOCK' ? styles.severityBtnSelectedFull : styles.severityBtnNormal,
                  ]}
                >
                  <Text style={styles.severityBtnFullTitle}>
                    Full Blockage
                  </Text>
                  <Text style={styles.severityBtnSub}>
                    Edge Cost = ∞ (100% detour)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSeverity('CAUTION_ZONE')}
                  style={[
                    styles.severityBtn,
                    severity === 'CAUTION_ZONE' ? styles.severityBtnSelectedCaution : styles.severityBtnNormal,
                  ]}
                >
                  <Text style={styles.severityBtnCautionTitle}>
                    Caution Zone
                  </Text>
                  <Text style={styles.severityBtnSub}>
                    Slow crawl speed 0.3m/s
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* 4. Estimated Duration Until Clear */}
            <View style={{ gap: 6 }}>
              <Text style={styles.sectionLabel}>
                Estimated Duration Until Clear:
              </Text>
              <View style={styles.durationRow}>
                {['15m', '30m', '60m', 'Until Clear'].map((dur) => {
                  const isSelected = duration === dur;
                  return (
                    <Pressable
                      key={dur}
                      onPress={() => setDuration(dur)}
                      style={[
                        styles.durationBtn,
                        isSelected ? styles.durationBtnSelected : styles.durationBtnNormal,
                      ]}
                    >
                      <Text
                        style={[
                          styles.durationBtnText,
                          isSelected ? styles.durationBtnTextSelected : styles.durationBtnTextNormal,
                        ]}
                      >
                        {dur}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 5. Field Observation Notes */}
            <View style={{ gap: 6 }}>
              <Text style={styles.sectionLabel}>
                Field Observation Notes:
              </Text>
              <Input
                value={notes}
                onChangeText={setNotes}
                placeholder="Describe hazard details..."
                containerStyle={{ marginBottom: 0 }}
                inputStyle={{ height: 40, fontSize: 12, fontWeight: '500' }}
              />
            </View>

            {/* Submit Button (size="large" - min-h-16 = 64px) */}
            <Pressable
              onPress={handleSubmit}
              style={styles.submitBtn}
              accessibilityRole="button"
            >
              <AlertOctagon size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>
                Report Hazard & Reroute Fleet
              </Text>
            </Pressable>
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
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 16,
    ...shadows.panel,
  },
  introIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    lineHeight: 20,
  },
  introDesc: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 16,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  edgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    minHeight: 61,
    ...shadows.panel,
  },
  edgeCardNormal: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  edgeCardSelected: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  edgeId: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  edgeZonePill: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  edgeZoneText: {
    fontSize: 8,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  edgeName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hazardCard: {
    width: 195,
    minHeight: 57,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'center',
    ...shadows.panel,
  },
  hazardCardNormal: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hazardCardSelected: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  hazardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 16,
  },
  hazardDesc: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    flex: 1,
    minHeight: 57,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
  },
  severityBtnNormal: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  severityBtnSelectedFull: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
  },
  severityBtnSelectedCaution: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
  },
  severityBtnFullTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ef4444',
    lineHeight: 16,
  },
  severityBtnCautionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#b45309',
    lineHeight: 16,
  },
  severityBtnSub: {
    fontSize: 10,
    color: colors.textMuted,
    lineHeight: 15,
    marginTop: 2,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  durationBtnNormal: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  durationBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  durationBtnText: {
    fontSize: 12,
    fontWeight: '900',
  },
  durationBtnTextNormal: {
    color: colors.textPrimary,
  },
  durationBtnTextSelected: {
    color: '#ffffff',
  },
  submitBtn: {
    backgroundColor: colors.danger,
    minHeight: 64,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#991b1b',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  submittedCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 20,
    alignItems: 'center',
    ...shadows.panel,
  },
  submittedIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  submittedTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 12,
    fontFamily: typography.fontSans,
  },
  submittedSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  receiptBox: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    padding: 16,
    gap: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  receiptHighlight: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  receiptDanger: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ef4444',
    fontFamily: typography.fontMono,
  },
  receiptDuration: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontMono,
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
  submittedActions: {
    width: '100%',
    marginTop: 20,
    flexDirection: 'row',
    gap: 8,
  },
  reopenBtn: {
    flex: 1,
    minHeight: 64,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reopenBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  doneBtn: {
    flex: 1,
    minHeight: 64,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});
