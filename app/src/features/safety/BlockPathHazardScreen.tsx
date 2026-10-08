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
                  {HAZARD_CATEGORIES.find((h) => h.id === hazardType)?.title || 'Hazard'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Routing Impact:</Text>
                <Text style={styles.receiptDanger}>
                  {severity === 'FULL_BLOCK' ? 'Edge Cost = ∞ (100% Detour)' : 'Caution Speed 0.3 m/s'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Fleet Telemetry:</Text>
                <Text style={styles.receiptHighlight}>AMR-01 rerouted via Corridor B</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Est. Duration:</Text>
                <Text style={styles.receiptVal}>{duration}</Text>
              </View>
            </View>

            <View style={styles.submittedActions}>
              <Button
                label="Reopen Path & Clear Hazard"
                icon={<RotateCcw size={16} color={colors.primary} />}
                onPress={handleClear}
                variant="outline"
                size="md"
              />
              <Button
                label="Done & Return to Console"
                onPress={goBack}
                variant="primary"
                size="lg"
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {/* Intro Card */}
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

            {/* Step 1: Corridor Selector */}
            <View>
              <Text style={styles.sectionLabel}>1. SELECT BLOCKED CORRIDOR / EDGE:</Text>
              <View style={{ gap: 6 }}>
                {EDGES.map((e) => {
                  const isSelected = selectedEdge === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => setSelectedEdge(e.id)}
                      style={[
                        styles.edgeCard,
                        isSelected && styles.edgeCardSelected,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.edgeId}>{e.id}</Text>
                          <View style={styles.edgeZonePill}>
                            <Text style={styles.edgeZoneText}>{e.zone}</Text>
                          </View>
                        </View>
                        <Text style={styles.edgeName}>{e.name}</Text>
                      </View>
                      {isSelected && <Check size={18} color={colors.danger} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Step 2: Hazard Category */}
            <View>
              <Text style={styles.sectionLabel}>2. HAZARD CATEGORY:</Text>
              <View style={styles.hazardGrid}>
                {HAZARD_CATEGORIES.map((h) => {
                  const isSelected = hazardType === h.id;
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => setHazardType(h.id)}
                      style={[
                        styles.hazardCard,
                        isSelected && styles.hazardCardSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.hazardTitle,
                          isSelected && styles.hazardTitleSelected,
                        ]}
                      >
                        {h.title}
                      </Text>
                      <Text style={styles.hazardDesc}>{h.desc}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Step 3: Severity Profile */}
            <View style={styles.configCard}>
              <Text style={styles.sectionLabel}>3. SEVERITY PROFILE & DURATION:</Text>
              <View style={styles.severityRow}>
                <Pressable
                  onPress={() => setSeverity('FULL_BLOCK')}
                  style={[
                    styles.severityBtn,
                    severity === 'FULL_BLOCK' && styles.severityBtnSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.severityBtnText,
                      severity === 'FULL_BLOCK' && styles.severityBtnTextSelected,
                    ]}
                  >
                    Full Block (Cost = ∞)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setSeverity('CAUTION_ZONE')}
                  style={[
                    styles.severityBtn,
                    severity === 'CAUTION_ZONE' && styles.severityBtnSelectedCaution,
                  ]}
                >
                  <Text
                    style={[
                      styles.severityBtnText,
                      severity === 'CAUTION_ZONE' && styles.severityBtnTextSelectedCaution,
                    ]}
                  >
                    Caution Speed (0.3m/s)
                  </Text>
                </Pressable>
              </View>

              <Input
                label="Observation Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Describe hazard specifics..."
              />
            </View>

            <Button
              label="Report Blocked Path & Reroute Fleet"
              icon={<AlertOctagon size={18} color="#ffffff" />}
              onPress={handleSubmit}
              variant="danger"
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
  introCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.dangerBg,
    borderWidth: 1.5,
    borderColor: colors.dangerBorder,
    borderRadius: 14,
    padding: 12,
    ...shadows.panel,
  },
  introIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.danger,
    fontFamily: typography.fontSans,
  },
  introDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 6,
  },
  edgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 12,
    ...shadows.panel,
  },
  edgeCardSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  edgeId: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  edgeZonePill: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  edgeZoneText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  edgeName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hazardCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 10,
    ...shadows.panel,
  },
  hazardCardSelected: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  hazardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  hazardTitleSelected: {
    color: colors.danger,
    fontWeight: '900',
  },
  hazardDesc: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  configCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    ...shadows.panel,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  severityBtnSelected: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  severityBtnSelectedCaution: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  severityBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  severityBtnTextSelected: {
    color: '#ffffff',
    fontWeight: '900',
  },
  severityBtnTextSelectedCaution: {
    color: '#ffffff',
    fontWeight: '900',
  },
  submittedCard: {
    backgroundColor: colors.dangerBg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.dangerBorder,
    padding: 18,
    alignItems: 'center',
    ...shadows.panel,
  },
  submittedIconBadge: {
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  submittedTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.danger,
    marginTop: 12,
    fontFamily: typography.fontSans,
  },
  submittedSub: {
    fontSize: 11,
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
  receiptDanger: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.danger,
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
    marginTop: 16,
    gap: 8,
  },
});
