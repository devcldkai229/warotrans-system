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
  Navigation,
  Rocket,
  RotateCw,
  Route as RouteIcon,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

const STATIONS = [
  { id: 'DOCK-IN-01', name: 'Inbound Dock 01', type: 'Receiving Bay' },
  { id: 'DOCK-OUT-01', name: 'Outbound Shipping Dock 01', type: 'Shipping Bay' },
  { id: 'QA-02', name: 'QA Station 02', type: 'Inspection Lab' },
  { id: 'ASSEMBLY-01', name: 'Assembly Bench 01', type: 'Workstation' },
  { id: 'PACKING-01', name: 'Packing Bench 01', type: 'Outbound Bay' },
  { id: 'RACK-D-01', name: 'Bulk Yard D', type: 'Heavy Storage' },
  { id: 'RACK-A-02', name: 'Rack A · Level 2', type: 'Standard Shelf' },
];

export function PointToPointScreen() {
  const { goBack } = useNavigation();
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
        label="POINT-TO-POINT TRANSPORT"
        title="Point-to-Point Transport"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {dispatched ? (
          <View style={styles.successCard}>
            <View style={styles.successIconBadge}>
              <Check size={28} color="#ffffff" />
            </View>
            <Text style={styles.successTitle}>Direct P2P Move Dispatched</Text>
            <Text style={styles.successSub}>
              AMR-02 allocated for direct point-to-point transit from {origin} to {destination}.
            </Text>

            <View style={styles.receiptBox}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Origin Station</Text>
                <Text style={styles.receiptVal} numberOfLines={1}>{origin}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Destination</Text>
                <Text style={styles.receiptHighlight} numberOfLines={1}>{destination}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Cargo ID</Text>
                <Text style={styles.receiptVal} numberOfLines={1}>{cargoTag}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Speed Profile</Text>
                <Text style={styles.receiptSuccess}>{priority.toUpperCase()}</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Assigned Carrier</Text>
                <Text style={styles.receiptSuccess} numberOfLines={1}>AMR-02 (Healthy)</Text>
              </View>
            </View>

            <Button
              label="Back to Hub"
              onPress={goBack}
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 16 }}
            />
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {/* Intro Card */}
            <View style={styles.introCard}>
              <View style={styles.introIconBox}>
                <Navigation size={20} color="#ffffff" />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text style={styles.introTitle} numberOfLines={1}>Custom Point-to-Point Routing</Text>
                <Text style={styles.introCategory} numberOfLines={1}>DIRECT · AD-HOC STATION TRANSFER</Text>
              </View>
            </View>

            {/* Empty Tote Return Preset - elegant 1-touch card */}
            <Pressable
              onPress={handleApplyEmptyTotePreset}
              style={({ pressed }) => [
                styles.presetCard,
                pressed && styles.presetCardPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Apply empty tote return preset"
            >
              <View style={styles.presetRow}>
                <View style={styles.presetIconBox}>
                  <RotateCw size={18} color="#ffffff" />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={styles.presetTitle} numberOfLines={1}>Return Empty Totes</Text>
                  <Text style={styles.presetDesc} numberOfLines={2}>
                    Recirculate discharged empty totes from Outbound Shipping Dock back to Inbound Receiving.
                  </Text>
                </View>
                <View style={styles.presetArrow}>
                  <Text style={styles.presetArrowText} numberOfLines={1}>1-touch</Text>
                </View>
              </View>
            </Pressable>

            {/* Step 1: Origin Station */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel} numberOfLines={1}>1. ORIGIN STATION (FROM):</Text>
              <View style={styles.stationsGrid}>
                {STATIONS.map((st) => {
                  const isSelected = origin === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setOrigin(st.id)}
                      style={[
                        styles.stationCard,
                        isSelected ? styles.stationCardSelected : styles.stationCardNormal,
                      ]}
                    >
                      <Text style={styles.stationId} numberOfLines={1}>{st.id}</Text>
                      <Text style={styles.stationName} numberOfLines={1}>{st.name}</Text>
                      <Text style={styles.stationType} numberOfLines={1}>{st.type}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Routing Connector Indicator */}
            <View style={styles.connectorRow}>
              <View style={styles.connectorLine} />
              <View style={styles.connectorBadge}>
                <RouteIcon size={12} color={colors.primary} />
                <Text style={styles.connectorText} numberOfLines={1}>Est. 38m · ~2m 45s transit</Text>
              </View>
              <View style={styles.connectorLine} />
            </View>

            {/* Step 2: Destination Station */}
            <View style={{ gap: 8 }}>
              <Text style={styles.sectionLabel} numberOfLines={1}>2. DESTINATION STATION (TO):</Text>
              <View style={styles.stationsGrid}>
                {STATIONS.map((st) => {
                  const isSelected = destination === st.id;
                  const isSameAsOrigin = origin === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      disabled={isSameAsOrigin}
                      onPress={() => setDestination(st.id)}
                      style={[
                        styles.stationCard,
                        isSameAsOrigin
                          ? styles.stationCardDisabled
                          : isSelected
                          ? styles.stationCardSelected
                          : styles.stationCardNormal,
                      ]}
                    >
                      <Text style={styles.stationId} numberOfLines={1}>{st.id}</Text>
                      <Text style={styles.stationName} numberOfLines={1}>{st.name}</Text>
                      <Text style={styles.stationType} numberOfLines={1}>{st.type}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Step 3: Cargo & Priority */}
            <View style={styles.cargoPriorityCard}>
              <View style={{ gap: 6 }}>
                <Text style={styles.sectionLabel} numberOfLines={1}>CARGO TAG / TOTE IDENTIFIER</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Input
                      value={cargoTag}
                      onChangeText={setCargoTag}
                      placeholder="e.g. TOTE-EXP-08"
                      containerStyle={{ marginBottom: 0 }}
                      inputStyle={{ height: 44, fontSize: 12, fontFamily: typography.fontMono, fontWeight: '700' }}
                    />
                  </View>
                  <Pressable
                    onPress={() => setCargoTag(`TOTE-${Math.floor(100 + Math.random() * 900)}`)}
                    style={styles.randomBtn}
                  >
                    <Text style={styles.randomBtnText} numberOfLines={1}>Random</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ gap: 6, marginTop: 12 }}>
                <Text style={styles.sectionLabel} numberOfLines={1}>TRANSPORT SPEED & LANE PRIORITY</Text>
                <View style={styles.priorityGrid}>
                  <Pressable
                    onPress={() => setPriority('normal')}
                    style={[
                      styles.priorityCard,
                      priority === 'normal' ? styles.priorityCardActive : styles.priorityCardNormal,
                    ]}
                  >
                    <Text style={styles.priorityCardTitle} numberOfLines={1}>Standard Lane</Text>
                    <Text style={styles.priorityCardSub} numberOfLines={2}>Normal speed profile</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setPriority('urgent')}
                    style={[
                      styles.priorityCard,
                      priority === 'urgent' ? styles.priorityCardActiveUrgent : styles.priorityCardNormal,
                    ]}
                  >
                    <Text style={styles.priorityCardUrgentTitle} numberOfLines={1}>Expedited Express</Text>
                    <Text style={styles.priorityCardSub} numberOfLines={2}>High priority lane clearance</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={handleDispatch}
              style={styles.dispatchBtn}
              accessibilityRole="button"
            >
              <Rocket size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.dispatchBtnText} numberOfLines={1}>
                Dispatch P2P ({origin} ➔ {destination})
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
    paddingBottom: 130,
    gap: 16,
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  introCategory: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  presetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.panel,
  },
  presetCardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  presetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  presetDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  presetArrow: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  presetArrowText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 8,
    fontFamily: typography.fontSans,
  },
  stationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stationCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 78,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadows.panel,
  },
  stationCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 92, 209, 0.1)',
  },
  stationCardNormal: {
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  stationCardDisabled: {
    opacity: 0.35,
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  stationId: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  stationName: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  stationType: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
  connectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
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
    backgroundColor: 'rgba(0, 92, 209, 0.1)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexShrink: 1,
  },
  connectorText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
    flexShrink: 1,
  },
  cargoPriorityCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
    ...shadows.panel,
  },
  randomBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    flexShrink: 0,
  },
  randomBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  priorityGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  priorityCardActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 92, 209, 0.1)',
  },
  priorityCardActiveUrgent: {
    borderColor: '#b45309',
    backgroundColor: '#fef3c7',
  },
  priorityCardNormal: {
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  priorityCardTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  priorityCardUrgentTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#b45309',
    fontFamily: typography.fontSans,
  },
  priorityCardSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    minHeight: 64,
    borderBottomWidth: 3,
    borderBottomColor: '#004bb0',
    paddingHorizontal: 20,
    marginTop: 4,
    gap: 8,
    ...shadows.panel,
  },
  dispatchBtnText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
    fontFamily: typography.fontSans,
    flexShrink: 1,
    textAlign: 'center',
  },
  successCard: {
    backgroundColor: colors.successBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 18,
    alignItems: 'center',
    ...shadows.panel,
    gap: 8,
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
    textAlign: 'center',
  },
  successSub: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    fontFamily: typography.fontSans,
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
    gap: 8,
  },
  receiptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
    flex: 1,
    minWidth: 0,
  },
  receiptVal: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    flexShrink: 1,
    textAlign: 'right',
  },
  receiptHighlight: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
    flexShrink: 1,
    textAlign: 'right',
  },
  receiptSuccess: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
    flexShrink: 1,
    textAlign: 'right',
  },
  receiptBorderTop: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 4,
  },
});
