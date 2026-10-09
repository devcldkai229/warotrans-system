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
  RotateCw,
  Route as RouteIcon,
  Zap,
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
        label="SCR-STF-22 · AD-HOC TRANSIT"
        title="Point-to-Point Transport"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
                <Text style={styles.receiptVal}>{origin}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Destination</Text>
                <Text style={styles.receiptHighlight}>{destination}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Cargo ID</Text>
                <Text style={styles.receiptVal}>{cargoTag}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Speed Profile</Text>
                <Text style={styles.receiptSuccess}>{priority.toUpperCase()}</Text>
              </View>
              <View style={[styles.receiptRow, styles.receiptBorderTop]}>
                <Text style={styles.receiptLabel}>Assigned Carrier</Text>
                <Text style={styles.receiptSuccess}>AMR-02 (Healthy)</Text>
              </View>
            </View>

            <Button
              label="Done & Return to Console"
              onPress={goBack}
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 16 }}
            />
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            {/* Intro Card */}
            <View style={styles.introCard}>
              <View style={styles.introIconBox}>
                <Navigation size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.introTitle}>Custom Point-to-Point Routing</Text>
                <Text style={styles.introDesc}>
                  Bypasses fixed rack logic for flexible ad-hoc transport between stations.
                </Text>
              </View>
            </View>

            {/* Empty Tote Lifecycle Preset Card */}
            <View style={styles.presetCard}>
              <View style={styles.presetTop}>
                <View style={styles.presetBadge}>
                  <Text style={styles.presetBadgeText}>RULE 3 · TOTE LIFECYCLE</Text>
                </View>
                <Text style={styles.presetRouteNote}>Outbound ➔ Inbound</Text>
              </View>
              <Text style={styles.presetTitle}>Return Empty Totes Preset</Text>
              <Text style={styles.presetDesc}>
                Recirculate discharged empty totes from Outbound Shipping Dock back to Inbound Receiving for incoming shipments.
              </Text>
              <Button
                label="Apply Empty Tote Return Preset"
                icon={<RotateCw size={14} color={colors.primary} />}
                onPress={handleApplyEmptyTotePreset}
                variant="outline"
                size="sm"
                style={styles.presetBtn}
                textStyle={{ color: colors.primary, fontWeight: '800' }}
              />
            </View>

            {/* Step 1: Origin Station */}
            <View>
              <Text style={styles.sectionLabel}>1. ORIGIN STATION (FROM):</Text>
              <View style={styles.stationsGrid}>
                {STATIONS.map((st) => {
                  const isSelected = origin === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setOrigin(st.id)}
                      style={[
                        styles.stationCard,
                        isSelected && styles.stationCardSelected,
                      ]}
                    >
                      <Text style={styles.stationId}>{st.id}</Text>
                      <Text style={styles.stationName} numberOfLines={1}>
                        {st.name}
                      </Text>
                      <Text style={styles.stationType}>{st.type}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Routing Connector Indicator */}
            <View style={styles.connectorRow}>
              <View style={styles.connectorLine} />
              <View style={styles.connectorBadge}>
                <RouteIcon size={13} color={colors.primary} />
                <Text style={styles.connectorText}>Est. 38m · ~2m 45s transit</Text>
              </View>
              <View style={styles.connectorLine} />
            </View>

            {/* Step 2: Destination Station */}
            <View>
              <Text style={styles.sectionLabel}>2. DESTINATION STATION (TO):</Text>
              <View style={styles.stationsGrid}>
                {STATIONS.map((st) => {
                  const isSelected = destination === st.id;
                  return (
                    <Pressable
                      key={st.id}
                      onPress={() => setDestination(st.id)}
                      style={[
                        styles.stationCard,
                        isSelected && styles.stationCardSelected,
                      ]}
                    >
                      <Text style={styles.stationId}>{st.id}</Text>
                      <Text style={styles.stationName} numberOfLines={1}>
                        {st.name}
                      </Text>
                      <Text style={styles.stationType}>{st.type}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Step 3: Cargo & Priority */}
            <View style={styles.configCard}>
              <Input
                label="3. Cargo Tag / Tote Identifier"
                value={cargoTag}
                onChangeText={setCargoTag}
                placeholder="e.g. TOTE-EXP-08"
              />

              <Text style={styles.sectionLabel}>SPEED & PRIORITY PROFILE:</Text>
              <View style={styles.priorityRow}>
                <Pressable
                  onPress={() => setPriority('normal')}
                  style={[
                    styles.priorityBtn,
                    priority === 'normal' && styles.priorityBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.priorityText,
                      priority === 'normal' && styles.priorityTextActive,
                    ]}
                  >
                    Normal (0.8 m/s)
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setPriority('urgent')}
                  style={[
                    styles.priorityBtn,
                    priority === 'urgent' && styles.priorityBtnActiveUrgent,
                  ]}
                >
                  <Zap size={14} color={priority === 'urgent' ? '#ffffff' : colors.warning} />
                  <Text
                    style={[
                      styles.priorityText,
                      priority === 'urgent' && styles.priorityTextActive,
                    ]}
                  >
                    Urgent (1.2 m/s)
                  </Text>
                </Pressable>
              </View>
            </View>

            <Button
              label={`Dispatch Point-to-Point Transit (${priority.toUpperCase()})`}
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
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  introDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  presetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 6,
    ...shadows.panel,
  },
  presetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  presetBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  presetBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  presetRouteNote: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
  },
  presetTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
  },
  presetDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  presetBtn: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
    borderRadius: 8,
    marginTop: 6,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 8,
  },
  stationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stationCard: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 10,
    ...shadows.panel,
  },
  stationCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  stationId: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  stationName: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
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
    backgroundColor: colors.primaryLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  connectorText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
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
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priorityBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  priorityBtnActiveUrgent: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  priorityTextActive: {
    color: '#ffffff',
    fontWeight: '900',
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
