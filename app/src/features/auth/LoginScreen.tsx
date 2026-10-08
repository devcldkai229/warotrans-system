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
  ChevronDown,
  Lock,
  LogIn,
  MapPin,
  UserCheck,
} from 'lucide-react-native';
import { BrandMark } from '../../shared/components/BrandMark';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { useToast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { PRESET_OPERATORS, useAuth } from './authContext';

export const WORK_ZONES = [
  {
    value: 'Inbound Dock 01',
    label: 'Inbound Dock 01 (Receiving Bay)',
    detail: 'Dock 01 - 03 · High Load · Inbound Putaway',
  },
  {
    value: 'Storage Zone A',
    label: 'Storage Zone A (Racks A01-A12)',
    detail: 'Standard pallet racking · Active fleet coverage',
  },
  {
    value: 'Storage Zone B',
    label: 'Storage Zone B (Racks B01-B12)',
    detail: 'Heavy bulk reserve · Standby status',
  },
  {
    value: 'Outbound Dock 04',
    label: 'Outbound Dock 04 (Staging & Dispatch)',
    detail: 'Shipping bay · Ready for delivery transfers',
  },
  {
    value: 'Depot Charger Station',
    label: 'Depot Charging & Maintenance',
    detail: 'AMR service bays & battery swap hubs',
  },
];

export function LoginScreen() {
  const { login } = useAuth();
  const { info: showToastInfo, success: showToastSuccess } = useToast();
  const [staffId, setStaffId] = useState('STF-2026-088');
  const [password, setPassword] = useState('••••••••');
  const [selectedZone, setSelectedZone] = useState('Inbound Dock 01');
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
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
    const matched = PRESET_OPERATORS.find(
      (op) => op.id.toLowerCase() === staffId.trim().toLowerCase()
    );
    const opName = matched ? matched.name : `Operator (${staffId})`;
    showToastSuccess(`Signed in as ${opName} (${selectedZone})`);
  };

  const activeZoneObj =
    WORK_ZONES.find((z) => z.value === selectedZone || z.label.includes(selectedZone)) ||
    WORK_ZONES[0];

  return (
    <View style={styles.outerWrapper}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.container}>
          {/* Top Section with high stacking context to overlay over actionSection */}
          <View style={styles.topSection}>
            {/* Top Brand Bar */}
            <View style={styles.topBar}>
              <View style={styles.brandRow}>
                <BrandMark size={40} />
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

            {/* Quick Operator Profiles Section */}
            <View style={styles.presetSection}>
              <Text style={styles.sectionLabel}>QUICK OPERATOR PROFILES</Text>
              <View style={styles.presetChips}>
                {PRESET_OPERATORS.map((op) => {
                  const isSelected = staffId === op.id;
                  return (
                    <Pressable
                      key={op.id}
                      onPress={() => handleSelectPreset(op)}
                      style={({ pressed }) => [
                        styles.presetChip,
                        isSelected && styles.presetChipSelected,
                        pressed && styles.presetChipPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Select profile ${op.name}`}
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
                leftIcon={<UserCheck size={18} color={colors.textSecondary} />}
                error={error || undefined}
              />

              <Input
                label="Access Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Enter shift password"
                secureTextEntry
                leftIcon={<Lock size={18} color={colors.textSecondary} />}
              />

              {/* Assigned Work Zone Selector Field */}
              <View style={styles.zoneField}>
                <Text style={styles.inputLabel}>Assigned Work Zone</Text>
                <Pressable
                  onPress={() => {
                    triggerHaptic('tap');
                    setIsZoneDropdownOpen(!isZoneDropdownOpen);
                  }}
                  style={({ pressed }) => [
                    styles.zoneSelector,
                    isZoneDropdownOpen && styles.zoneSelectorActive,
                    pressed && styles.zoneSelectorPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Select assigned work zone"
                >
                  <View style={styles.zoneLeft}>
                    <MapPin size={18} color={colors.primary} style={styles.mapPinIcon} />
                    <View style={styles.zoneDetails}>
                      <Text style={styles.zoneName} numberOfLines={1}>
                        {activeZoneObj.label}
                      </Text>
                      <Text style={styles.zoneDetailText} numberOfLines={1}>
                        {activeZoneObj.detail}
                      </Text>
                    </View>
                  </View>
                  <ChevronDown
                    size={16}
                    color={colors.textSecondary}
                    style={[
                      styles.chevron,
                      isZoneDropdownOpen && styles.chevronRotated,
                    ]}
                  />
                </Pressable>

                {/* Floating Popover Dropdown (OVERLAYS ON TOP of the screen without pushing button down) */}
                {isZoneDropdownOpen && (
                  <>
                    <Pressable
                      style={styles.dropdownDismissLayer}
                      onPress={() => setIsZoneDropdownOpen(false)}
                    />
                    <View style={styles.floatingDropdownCard}>
                      {WORK_ZONES.map((zone, index) => {
                        const isSelected =
                          selectedZone === zone.value || selectedZone === zone.label;
                        const isLast = index === WORK_ZONES.length - 1;
                        return (
                          <Pressable
                            key={zone.value}
                            onPress={() => {
                              triggerHaptic('tick');
                              setSelectedZone(zone.value);
                              setIsZoneDropdownOpen(false);
                            }}
                            style={({ pressed }) => [
                              styles.dropdownItem,
                              isSelected && styles.dropdownItemSelected,
                              pressed && styles.dropdownItemPressed,
                              !isLast && styles.dropdownItemDivider,
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Select ${zone.label}`}
                          >
                            <View style={styles.dropdownItemContent}>
                              <Text
                                style={[
                                  styles.dropdownItemTitle,
                                  isSelected && styles.dropdownItemTitleSelected,
                                ]}
                              >
                                {zone.label}
                              </Text>
                              <Text style={styles.dropdownItemDesc}>{zone.detail}</Text>
                            </View>
                            {isSelected && (
                              <Check size={16} color={colors.primary} strokeWidth={2.6} />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>

          {/* Action Button & Device Tag */}
          <View style={styles.actionSection}>
            <Button
              label="SIGN IN TO ACTIVE SHIFT"
              icon={<LogIn size={18} color="#ffffff" strokeWidth={2.4} />}
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
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.background,
    justifyContent: 'space-between',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    position: 'relative',
  },
  topSection: {
    position: 'relative',
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  brandSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  statusPill: {
    backgroundColor: 'rgba(0, 122, 56, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
    lineHeight: 12,
  },
  headerSection: {
    marginTop: 22,
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
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 6,
    fontFamily: typography.fontSans,
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
  presetChipPressed: {
    backgroundColor: colors.surfaceSubtle,
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
    fontWeight: '900',
  },
  presetChipId: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontMono,
  },
  presetChipIdSelected: {
    color: colors.primary,
    fontWeight: '800',
  },
  formSection: {
    marginTop: 16,
    gap: 6,
    position: 'relative',
    zIndex: 100,
  },
  zoneField: {
    marginTop: 4,
    marginBottom: 8,
    position: 'relative',
    zIndex: 100,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 6,
    fontFamily: typography.fontSans,
  },
  zoneSelector: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...shadows.panel,
  },
  zoneSelectorActive: {
    borderColor: colors.primary,
    borderWidth: 1.5,
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
  mapPinIcon: {
    flexShrink: 0,
  },
  zoneDetails: {
    flex: 1,
  },
  zoneName: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  zoneDetailText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
  chevron: {
    marginLeft: 6,
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },
  dropdownDismissLayer: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  floatingDropdownCard: {
    position: 'absolute',
    top: 76,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 30,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  dropdownItemSelected: {
    backgroundColor: colors.primaryLight,
  },
  dropdownItemPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  dropdownItemDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  dropdownItemContent: {
    flex: 1,
    marginRight: 10,
  },
  dropdownItemTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  dropdownItemTitleSelected: {
    color: colors.primary,
    fontWeight: '900',
  },
  dropdownItemDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  actionSection: {
    marginTop: 24,
    paddingTop: 8,
    position: 'relative',
    zIndex: 1,
  },
  submitButton: {
    width: '100%',
    minHeight: 56,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  footerDevice: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
});
