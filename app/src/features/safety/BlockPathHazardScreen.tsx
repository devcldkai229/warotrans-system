import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Check,
  RotateCcw,
  ShieldAlert,
  FileText,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { Text } from '../../shared/ui/Text';

const CORRIDORS = [
  { id: 'CORR-A01-A02', name: 'Aisle A-01 (Between Rack A01 & A02)', zone: 'Zone A Storage' },
  { id: 'CORR-MAIN-TRANSIT', name: 'Main Transit Corridor (Dock 01 ➔ Rack B)', zone: 'Arterial Highway' },
  { id: 'CORR-DOCK-RECV', name: 'Dock Receiving Bay 01 Apron', zone: 'Inbound Staging' },
  { id: 'CORR-PICK-C02', name: 'Zone C Fast-Pick Lane', zone: 'Zone C Pick-Face' },
];

const HAZARD_CATEGORIES = [
  { id: 'LIQUID_SPILL', title: 'Liquid Spill', desc: 'Wet / slippery floor surface' },
  { id: 'FALLEN_CARGO', title: 'Fallen Cargo', desc: 'Physical pallet or carton obstruction' },
  { id: 'FACILITY_WORK', title: 'Maintenance Work', desc: 'Active facility repairs or electrical work' },
  { id: 'FORKLIFT_TRAFFIC', title: 'Machinery Congestion', desc: 'Manual forklift or heavy traffic stoppage' },
];

export function BlockPathHazardScreen() {
  const { goBack } = useNavigation();
  const [selectedCorridor, setSelectedCorridor] = useState('CORR-A01-A02');
  const [hazardType, setHazardType] = useState('LIQUID_SPILL');
  const [severity, setSeverity] = useState<'CRITICAL_BLOCK' | 'CAUTION_SLOW'>('CRITICAL_BLOCK');
  const [duration, setDuration] = useState('30m');
  const [notes, setNotes] = useState('Hydraulic fluid leakage spotted near Rack A-02 column 3. Caution cone placed.');
  const [submitted, setSubmitted] = useState(false);
  const [incidentCode, setIncidentCode] = useState('');

  const handleSubmit = () => {
    triggerHaptic('success');
    setIncidentCode(`INC-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setSubmitted(true);
  };

  const handleClear = () => {
    triggerHaptic('tap');
    setSubmitted(false);
  };

  const activeCorridorObj = CORRIDORS.find((c) => c.id === selectedCorridor) || CORRIDORS[0];

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Floor Safety & Exceptions"
        title="Report Corridor Hazard"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {submitted ? (
          <View style={styles.submittedCard}>
            <View style={styles.submittedIconBadge}>
              <ShieldAlert size={28} color="#dc2626" />
            </View>
            <Text variant="title" style={styles.submittedTitle}>
              Safety Incident Logged
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.submittedSub}>
              Incident ticket registered in Operations registry. Fleet supervisors and safety officers have been notified.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Incident Ticket:</Text>
                <Text variant="caption" style={styles.receiptDanger}>{incidentCode}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Reported Location:</Text>
                <Text variant="caption" style={styles.receiptVal}>{activeCorridorObj.name}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Hazard Classification:</Text>
                <Text variant="caption" style={styles.receiptVal}>
                  {hazardType === 'LIQUID_SPILL' && 'Liquid Spill / Wet Surface'}
                  {hazardType === 'FALLEN_CARGO' && 'Fallen Cargo / Obstruction'}
                  {hazardType === 'FACILITY_WORK' && 'Facility Maintenance'}
                  {hazardType === 'FORKLIFT_TRAFFIC' && 'Machinery Congestion'}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Severity Level:</Text>
                <Text variant="caption" style={styles.receiptDanger}>
                  {severity === 'CRITICAL_BLOCK' ? 'Critical Blockage (Aisle Impassable)' : 'Caution Advisory (Slow Speed Required)'}
                </Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text variant="caption" color={colors.textSecondary}>Estimated Clearance Time:</Text>
                <Text variant="caption" style={styles.receiptDuration}>{duration}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text variant="caption" color={colors.textSecondary}>Supervisor Action:</Text>
                <Text variant="caption" color={colors.primary} style={styles.receiptHighlight}>
                  Dispatched to Facility Safety Team
                </Text>
              </View>
            </View>

            <View style={styles.submittedActions}>
              <Button
                label="File Another Report"
                icon={<RotateCcw size={16} color={colors.textPrimary} />}
                onPress={handleClear}
                variant="outline"
                size="md"
              />
              <Button
                label="Return to Transport Hub"
                onPress={goBack}
                variant="primary"
                size="lg"
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Corridor Location Selection */}
            <View style={{ gap: 8 }}>
              <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
                AFFECTED CORRIDOR / AISLE
              </Text>
              <View style={{ gap: 8 }}>
                {CORRIDORS.map((c) => {
                  const isSelected = selectedCorridor === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        triggerHaptic('tap');
                        setSelectedCorridor(c.id);
                      }}
                      style={[
                        styles.corridorCard,
                        isSelected && styles.corridorCardSelected,
                      ]}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text variant="headline" style={styles.corridorId}>{c.id}</Text>
                          <View style={styles.corridorZonePill}>
                            <Text variant="caption" style={styles.corridorZoneText}>{c.zone}</Text>
                          </View>
                        </View>
                        <Text variant="caption" color={colors.textSecondary} style={styles.corridorName}>{c.name}</Text>
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
              <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
                HAZARD CLASSIFICATION
              </Text>
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
                      <Text variant="headline" style={[styles.hazardTitle, isSelected && styles.hazardTitleSelected]}>
                        {h.title}
                      </Text>
                      <Text variant="caption" color={colors.textSecondary} style={styles.hazardDesc}>
                        {h.desc}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Severity Level */}
            <View style={{ gap: 8 }}>
              <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
                SEVERITY & IMPACT
              </Text>
              <View style={styles.severityRow}>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setSeverity('CRITICAL_BLOCK');
                  }}
                  style={[
                    styles.severityBtn,
                    severity === 'CRITICAL_BLOCK' && styles.severityBtnSelectedFull,
                  ]}
                  accessibilityRole="button"
                >
                  <Text variant="headline" style={styles.severityTitle}>Critical Blockage</Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.severitySub}>Aisle impassable · Immediate clearance</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setSeverity('CAUTION_SLOW');
                  }}
                  style={[
                    styles.severityBtn,
                    severity === 'CAUTION_SLOW' && styles.severityBtnSelectedCaution,
                  ]}
                  accessibilityRole="button"
                >
                  <Text variant="headline" style={styles.severityTitle}>Caution Advisory</Text>
                  <Text variant="caption" color={colors.textSecondary} style={styles.severitySub}>Reduced clearance · Slow crawl advisory</Text>
                </Pressable>
              </View>
            </View>

            {/* Estimated Duration */}
            <View style={{ gap: 8 }}>
              <Text variant="label" color={colors.textSecondary} style={styles.sectionLabel}>
                ESTIMATED CLEARANCE TIME
              </Text>
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
                        variant="caption"
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

            {/* Operational Notes */}
            <Input
              label="Observation Details & Placement of Safety Cones"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="Describe physical location of spill/pallet..."
            />

            <Button
              label="Submit Incident Report"
              icon={<AlertTriangle size={18} color="#ffffff" />}
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
    backgroundColor: '#FAFAFA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  corridorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  corridorCardSelected: {
    borderColor: '#121317',
    borderWidth: 1.5,
    backgroundColor: '#F9FAFB',
  },
  corridorId: {
    fontSize: 13,
    color: '#121317',
  },
  corridorZonePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
  },
  corridorZoneText: {
    fontSize: 11,
    color: '#4B5563',
  },
  corridorName: {
    marginTop: 4,
    fontSize: 12,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#121317',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hazardCard: {
    width: '48.5%',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hazardCardSelected: {
    borderColor: '#DC2626',
    borderWidth: 1.5,
    backgroundColor: '#FEF2F2',
  },
  hazardTitle: {
    fontSize: 13,
    color: '#121317',
  },
  hazardTitleSelected: {
    color: '#DC2626',
  },
  hazardDesc: {
    marginTop: 4,
    fontSize: 11,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityBtn: {
    flex: 1,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  severityBtnSelectedFull: {
    borderColor: '#DC2626',
    borderWidth: 1.5,
    backgroundColor: '#FEF2F2',
  },
  severityBtnSelectedCaution: {
    borderColor: '#D97706',
    borderWidth: 1.5,
    backgroundColor: '#FFFBEB',
  },
  severityTitle: {
    fontSize: 13,
    color: '#121317',
  },
  severitySub: {
    marginTop: 4,
    fontSize: 11,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  durationBtnSelected: {
    borderColor: '#121317',
    backgroundColor: '#121317',
  },
  durationBtnText: {
    color: '#4B5563',
    fontSize: 12,
    fontWeight: '500',
  },
  durationBtnTextSelected: {
    color: '#FFFFFF',
  },
  submittedCard: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submittedIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  submittedTitle: {
    color: '#121317',
    fontSize: 18,
    textAlign: 'center',
  },
  submittedSub: {
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  receiptBox: {
    width: '100%',
    marginVertical: 20,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },
  receiptVal: {
    color: '#121317',
    fontWeight: '500',
  },
  receiptDanger: {
    color: '#DC2626',
    fontWeight: '700',
  },
  receiptDuration: {
    color: '#121317',
    fontWeight: '700',
  },
  receiptHighlight: {
    fontWeight: '500',
  },
  submittedActions: {
    width: '100%',
    gap: 10,
  },
});
