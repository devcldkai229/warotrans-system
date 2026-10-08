import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowUpRight,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  Lock,
  LogIn,
  MapPin,
  Truck,
  UserCheck,
  X,
} from 'lucide-react-native';
import { BrandMark } from '../../shared/components/BrandMark';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { PRESET_OPERATORS, useAuth } from './authContext';

export const WORK_ZONES = [
  {
    value: 'Inbound Dock 01',
    label: 'Inbound Dock 01 (Receiving Bay)',
    detail: 'Dock 01 - 03 · High Load · Inbound Putaway',
    tag: 'HIGH LOAD',
    icon: 'truck',
  },
  {
    value: 'Storage Zone A (Racks A01-A12)',
    label: 'Storage Zone A (Racks A01-A12)',
    detail: 'Standard pallet racking · Active fleet coverage',
    tag: 'ACTIVE',
    icon: 'mappin',
  },
  {
    value: 'Storage Zone B (Racks B01-B12)',
    label: 'Storage Zone B (Racks B01-B12)',
    detail: 'Heavy bulk reserve · Standby status',
    tag: 'READY',
    icon: 'mappin',
  },
  {
    value: 'Outbound Dock 04',
    label: 'Outbound Dock 04 (Staging & Dispatch)',
    detail: 'Shipping bay · Ready for delivery transfers',
    tag: 'CLEAR',
    icon: 'arrow',
  },
  {
    value: 'Depot Charger Station',
    label: 'Depot Charging & Maintenance',
    detail: 'AMR service bays & battery swap hubs',
    tag: 'MAINTENANCE',
    icon: 'battery',
  },
];

export function LoginScreen() {
  const { login } = useAuth();
  const [staffId, setStaffId] = useState('STF-2026-088');
  const [password, setPassword] = useState('••••••••');
  const [selectedZone, setSelectedZone] = useState('Inbound Dock 01');
  const [isZoneModalOpen, setIsZoneModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (operator: (typeof PRESET_OPERATORS)[0]) => {
    triggerHaptic('tap');
    setStaffId(operator.id);
    setSelectedZone(operator.zone);
    setError(null);
  };

  const handleLogin = () => {
    if (!staffId.trim()) {
      triggerHaptic('error');
      setError('Staff Identifier is required.');
      return;
    }
    triggerHaptic('success');
    setError(null);
    login(staffId, selectedZone);
  };

  const activeZoneObj =
    WORK_ZONES.find((z) => z.value === selectedZone || z.label.includes(selectedZone)) ||
    WORK_ZONES[0];

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        {/* Top Brand Bar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <BrandMark size={42} />
            <View>
              <Text style={styles.brandTitle}>WAROTRANS</Text>
              <Text style={styles.brandSubtitle}>Autonomous Fleet Mobile</Text>
            </View>
          </View>
          <View style={styles.statusPill}>
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
            leftIcon={<UserCheck size={18} color={colors.textMuted} />}
            error={error || undefined}
          />

          <Input
            label="Access Password / PIN"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter shift PIN or password"
            secureTextEntry
            leftIcon={<Lock size={18} color={colors.textMuted} />}
          />

          {/* Assigned Work Zone Selector */}
          <View style={styles.zoneField}>
            <Text style={styles.inputLabel}>Assigned Work Zone</Text>
            <Pressable
              onPress={() => setIsZoneModalOpen(true)}
              style={({ pressed }) => [
                styles.zoneSelector,
                pressed && styles.zoneSelectorPressed,
              ]}
            >
              <View style={styles.zoneLeft}>
                <View style={styles.zoneIconWrap}>
                  <MapPin size={18} color={colors.primary} />
                </View>
                <View style={styles.zoneDetails}>
                  <Text style={styles.zoneName} numberOfLines={1}>
                    {activeZoneObj.label}
                  </Text>
                  <Text style={styles.zoneDetailText} numberOfLines={1}>
                    {activeZoneObj.detail}
                  </Text>
                </View>
              </View>
              <ChevronDown size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Action Button */}
        <View style={styles.actionSection}>
          <Button
            label="SIGN IN TO ACTIVE SHIFT"
            icon={<LogIn size={18} color="#ffffff" />}
            onPress={handleLogin}
            size="lg"
            variant="primary"
            style={styles.submitButton}
          />

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>WaroTrans Core v2.4.1-rc</Text>
            <Text style={styles.footerDevice}>DEVICE #PDA-04</Text>
          </View>
        </View>

        {/* Zone Selection Modal (SCR-STF-02) */}
        <Modal
          visible={isZoneModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIsZoneModalOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.dragHandle} />
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTag}>SCR-STF-02 · WORK ZONE SELECTION</Text>
                  <Text style={styles.modalTitle}>Select Operating Work Zone</Text>
                  <Text style={styles.modalSubtitle}>
                    Designate active warehouse perimeter for cargo handover and robot dispatch.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setIsZoneModalOpen(false)}
                  style={styles.modalCloseBtn}
                >
                  <X size={20} color={colors.textSecondary} />
                </Pressable>
              </View>

              <ScrollView style={styles.modalScroll}>
                {WORK_ZONES.map((zone) => {
                  const isSelected =
                    selectedZone === zone.value || selectedZone === zone.label;
                  return (
                    <Pressable
                      key={zone.value}
                      onPress={() => {
                        triggerHaptic('tick');
                        setSelectedZone(zone.value);
                        setIsZoneModalOpen(false);
                      }}
                      style={[
                        styles.zoneItem,
                        isSelected && styles.zoneItemSelected,
                      ]}
                    >
                      <View style={styles.zoneItemLeft}>
                        <View
                          style={[
                            styles.zoneItemIconBox,
                            isSelected && styles.zoneItemIconBoxActive,
                          ]}
                        >
                          {zone.icon === 'truck' ? (
                            <Truck
                              size={18}
                              color={isSelected ? '#ffffff' : colors.textMuted}
                            />
                          ) : zone.icon === 'arrow' ? (
                            <ArrowUpRight
                              size={18}
                              color={isSelected ? '#ffffff' : colors.textMuted}
                            />
                          ) : zone.icon === 'battery' ? (
                            <BatteryCharging
                              size={18}
                              color={isSelected ? '#ffffff' : colors.textMuted}
                            />
                          ) : (
                            <MapPin
                              size={18}
                              color={isSelected ? '#ffffff' : colors.textMuted}
                            />
                          )}
                        </View>
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
                      </View>
                      <View
                        style={[
                          styles.zoneItemBadge,
                          isSelected && styles.zoneItemBadgeSelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.zoneItemBadgeText,
                            isSelected && styles.zoneItemBadgeTextSelected,
                          ]}
                        >
                          {isSelected ? 'CURRENT SELECTION' : zone.tag}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.modalFooter}>
                <Button
                  label="CONFIRM ASSIGNED WORK ZONE"
                  icon={<CheckCircle2 size={16} color="#ffffff" />}
                  onPress={() => setIsZoneModalOpen(false)}
                  size="md"
                  variant="primary"
                />
              </View>
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
    justifyContent: 'space-between',
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.control,
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  statusPill: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.success,
    letterSpacing: 0.5,
    fontFamily: typography.fontMono,
  },
  headerSection: {
    marginTop: 24,
  },
  screenTag: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 1.2,
    marginBottom: 4,
    fontFamily: typography.fontMono,
  },
  heading: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    fontFamily: typography.fontSans,
  },
  description: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  presetSection: {
    marginTop: 18,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.textMuted,
    marginBottom: 8,
  },
  presetChips: {
    flexDirection: 'row',
    gap: 8,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadows.panel,
  },
  presetChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  presetChipName: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  presetChipNameSelected: {
    color: colors.primary,
  },
  presetChipId: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontMono,
  },
  presetChipIdSelected: {
    color: colors.primary,
    fontWeight: '800',
  },
  formSection: {
    marginTop: 18,
    gap: 4,
  },
  zoneField: {
    marginTop: 4,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.textSecondary,
    marginBottom: 6,
    fontFamily: typography.fontSans,
  },
  zoneSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows.panel,
  },
  zoneSelectorPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  zoneLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  zoneIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneDetails: {
    flex: 1,
  },
  zoneName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  zoneDetailText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
  actionSection: {
    marginTop: 24,
    paddingTop: 12,
  },
  submitButton: {
    borderRadius: 12,
    ...shadows.control,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 2,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  footerDevice: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
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
    padding: 18,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    ...shadows.sheet,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
  },
  modalTag: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    letterSpacing: 1,
    fontFamily: typography.fontMono,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 290,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
  },
  modalScroll: {
    marginTop: 12,
    maxHeight: 340,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: 8,
    backgroundColor: colors.surface,
    ...shadows.panel,
  },
  zoneItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  zoneItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  zoneItemIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneItemIconBoxActive: {
    backgroundColor: colors.primary,
  },
  zoneItemInfo: {
    flex: 1,
  },
  zoneItemTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  zoneItemTitleSelected: {
    color: colors.primary,
  },
  zoneItemDesc: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  zoneItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surfaceSubtle,
  },
  zoneItemBadgeSelected: {
    backgroundColor: colors.primary,
  },
  zoneItemBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  zoneItemBadgeTextSelected: {
    color: '#ffffff',
  },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
