import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';
import { PRESET_OPERATORS, useAuth } from './authContext';

const WORK_ZONES = [
  {
    value: 'Storage Zone A (Racks A01-A12)',
    label: 'Storage Zone A (Racks A01-A12)',
    detail: 'Standard pallet racking · Active fleet coverage',
  },
  {
    value: 'Inbound Dock 01 (Receiving Bay)',
    label: 'Inbound Dock 01 (Receiving Bay)',
    detail: 'Dock 01 - 03 · High Load · Inbound Putaway',
  },
  {
    value: 'Storage Zone B (Racks B01-B12)',
    label: 'Storage Zone B (Racks B01-B12)',
    detail: 'Heavy bulk reserve · Standby status',
  },
  {
    value: 'Outbound Dock 04 (Staging & Dispatch)',
    label: 'Outbound Dock 04 (Staging & Dispatch)',
    detail: 'Shipping bay · Ready for delivery transfers',
  },
  {
    value: 'Depot Charging & Maintenance',
    label: 'Depot Charging & Maintenance',
    detail: 'AMR service bays & battery swap hubs',
  },
];

export function LoginScreen() {
  const { login } = useAuth();
  const [staffId, setStaffId] = useState('STF-2026-088');
  const [password, setPassword] = useState('••••••••');
  const [selectedZone, setSelectedZone] = useState('Storage Zone A (Racks A01-A12)');
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (operator: typeof PRESET_OPERATORS[0]) => {
    setStaffId(operator.id);
    setSelectedZone(operator.zone);
    setError(null);
  };

  const handleLogin = () => {
    if (!staffId.trim()) {
      setError('Staff Identifier is required.');
      return;
    }
    setError(null);
    login(staffId, selectedZone);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        {/* Top Brand Bar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>WT</Text>
            </View>
            <View>
              <Text style={styles.brandTitle}>WAROTRANS</Text>
              <Text style={styles.brandSubtitle}>Autonomous Fleet Mobile</Text>
            </View>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>FLEET ONLINE</Text>
          </View>
        </View>

        {/* Screen Title */}
        <View style={styles.headerSection}>
          <Text style={styles.screenTag}>SCR-STF-01 · AUTHENTICATION</Text>
          <Text style={styles.heading}>Shift Authentication</Text>
          <Text style={styles.description}>
            Verify operator credentials to access AMR fleet handover and dispatch controls.
          </Text>
        </View>

        {/* Operator Quick-Select Chips */}
        <View style={styles.presetSection}>
          <Text style={styles.sectionLabel}>Quick Operator Profiles</Text>
          <View style={styles.presetChips}>
            {PRESET_OPERATORS.map((op) => {
              const isSelected = staffId === op.id;
              return (
                <Pressable
                  key={op.id}
                  onPress={() => handleSelectPreset(op)}
                  style={[
                    styles.presetChip,
                    isSelected && styles.presetChipSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.presetChipName,
                      isSelected && styles.presetChipNameSelected,
                    ]}
                  >
                    {op.name}
                  </Text>
                  <Text
                    style={[
                      styles.presetChipId,
                      isSelected && styles.presetChipIdSelected,
                    ]}
                  >
                    {op.id}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.formSection}>
          <Input
            label="Staff Identifier (Staff ID)"
            value={staffId}
            onChangeText={(text) => {
              setStaffId(text);
              if (error) setError(null);
            }}
            placeholder="STF-2026-XXX"
            autoCapitalize="characters"
            error={error || undefined}
          />

          <Input
            label="Access Password / PIN"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter shift PIN or password"
            secureTextEntry
          />

          {/* Assigned Work Zone Selector */}
          <View style={styles.zoneField}>
            <Text style={styles.inputLabel}>Assigned Work Zone</Text>
            <Pressable
              onPress={() => setIsZoneModalOpen(true)}
              style={styles.zoneSelector}
            >
              <View style={styles.zoneIconWrap}>
                <Text style={styles.zoneIcon}>📍</Text>
              </View>
              <View style={styles.zoneDetails}>
                <Text style={styles.zoneName} numberOfLines={1}>
                  {selectedZone}
                </Text>
                <Text style={styles.zoneDetailText} numberOfLines={1}>
                  Tap to change operational staging area
                </Text>
              </View>
              <Text style={styles.zoneChevron}>▼</Text>
            </Pressable>
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.actionSection}>
          <Button
            label="SIGN IN TO ACTIVE SHIFT"
            onPress={handleLogin}
            size="lg"
            variant="primary"
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>WaroTrans Core v2.4.1-rc</Text>
            <Text style={styles.footerDevice}>DEVICE #PDA-04</Text>
          </View>
        </View>

        {/* Zone Selection Modal */}
        <Modal
          visible={isZoneModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsZoneModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Select Assigned Work Zone</Text>
                  <Text style={styles.modalSubtitle}>
                    Tasks and AMR alerts will be prioritized for this zone
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsZoneModalOpen(false)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.modalScroll}>
                {WORK_ZONES.map((zone) => {
                  const isSelected = selectedZone === zone.value;
                  return (
                    <Pressable
                      key={zone.value}
                      onPress={() => {
                        setSelectedZone(zone.value);
                        setIsZoneModalOpen(false);
                      }}
                      style={[
                        styles.zoneItem,
                        isSelected && styles.zoneItemSelected,
                      ]}
                    >
                      <View style={styles.zoneItemInfo}>
                        <Text
                          style={[
                            styles.zoneItemTitle,
                            isSelected && styles.zoneItemTitleSelected,
                          ]}
                        >
                          {zone.label}
                        </Text>
                        <Text style={styles.zoneItemDesc}>{zone.detail}</Text>
                      </View>
                      {isSelected && (
                        <View style={styles.selectedBadge}>
                          <Text style={styles.selectedBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    color: colors.textInverse,
    fontWeight: '900',
    fontSize: 16,
  },
  brandTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 0.8,
  },
  brandSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
    letterSpacing: 0.5,
  },
  headerSection: {
    marginBottom: 24,
  },
  screenTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.primary,
    marginBottom: 4,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  presetSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  presetChips: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  presetChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  presetChipName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  presetChipNameSelected: {
    color: colors.primaryDark,
  },
  presetChipId: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  presetChipIdSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  formSection: {
    marginBottom: 20,
  },
  zoneField: {
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  zoneSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  zoneIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneIcon: {
    fontSize: 14,
  },
  zoneDetails: {
    flex: 1,
  },
  zoneName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  zoneDetailText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  zoneChevron: {
    fontSize: 10,
    color: colors.textMuted,
  },
  actionSection: {
    marginTop: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  footerDevice: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: '700',
  },
  modalScroll: {
    marginBottom: 16,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  zoneItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  zoneItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  zoneItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  zoneItemTitleSelected: {
    color: colors.primaryDark,
  },
  zoneItemDesc: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  selectedBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  selectedBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '800',
  },
});
