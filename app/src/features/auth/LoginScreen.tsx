import React, { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  MapPin,
  User,
} from 'lucide-react-native';
import { BrandMark } from '../../shared/components/BrandMark';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { useToast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { useAuth } from './authContext';

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
  const { success: showToastSuccess } = useToast();
  const zoneSelectorRef = useRef<View>(null);
  const [username, setUsername] = useState('alex.tran');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedZone, setSelectedZone] = useState('Inbound Dock 01');
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Measured window rect of the zone selector so the popover anchors to it
  // instead of relying on a hardcoded offset that breaks when text wraps.
  const [zoneRect, setZoneRect] = useState({ top: 0, left: 0, width: 0 });

  const handleToggleZoneDropdown = () => {
    triggerHaptic('tap');
    if (isZoneDropdownOpen) {
      setIsZoneDropdownOpen(false);
      return;
    }
    zoneSelectorRef.current?.measureInWindow((x, y, width, height) => {
      setZoneRect({ top: y + height, left: x, width });
    });
    setIsZoneDropdownOpen(true);
  };

  const handleLogin = () => {
    if (!username.trim()) {
      triggerHaptic('error');
      setPasswordError(null);
      setError('Staff Username is required.');
      return;
    }
    if (!password) {
      triggerHaptic('error');
      setError(null);
      setPasswordError('Access Password is required.');
      return;
    }
    triggerHaptic('success');
    setError(null);
    setPasswordError(null);
    login(username, selectedZone);
    showToastSuccess(`Signed in as ${username} (${selectedZone})`);
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
            {/* Centered Brand Hero */}
            <View style={styles.brandHero}>
              <View style={styles.logoBadgeWrap}>
                <BrandMark size={56} />
              </View>
              <Text style={styles.brandTitle}>WAROTRANS</Text>
              <Text style={styles.brandSubtitle}>Autonomous Fleet Operator Console</Text>
            </View>

            {/* Form Fields */}
            <View style={styles.formSection}>
              <Input
                label="Staff Username"
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (error) setError(null);
                }}
                placeholder="e.g. alex.tran"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                leftIcon={<User size={18} color={colors.textSecondary} />}
                containerStyle={styles.fieldSpacing}
                inputStyle={styles.identifierInput}
                error={error || undefined}
              />

              <Input
                label="Access Password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(null);
                }}
                placeholder="Enter shift password"
                secureTextEntry={!showPassword}
                returnKeyType="done"
                leftIcon={<Lock size={18} color={colors.textSecondary} />}
                containerStyle={styles.fieldSpacing}
                error={passwordError || undefined}
                rightIcon={
                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      setShowPassword(!showPassword);
                    }}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    accessibilityState={{ selected: showPassword }}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={colors.textSecondary} />
                    ) : (
                      <Eye size={18} color={colors.textSecondary} />
                    )}
                  </Pressable>
                }
              />

              {/* Assigned Work Zone Selector Field */}
              <View style={styles.zoneField}>
                <Text style={styles.inputLabel}>Assigned Work Zone</Text>
                <Pressable
                  ref={zoneSelectorRef}
                  onPress={handleToggleZoneDropdown}
                  style={({ pressed }) => [
                    styles.zoneSelector,
                    isZoneDropdownOpen && styles.zoneSelectorActive,
                    pressed && styles.zoneSelectorPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Select assigned work zone"
                  accessibilityHint="Double tap to choose the work zone for this shift"
                  accessibilityState={{ expanded: isZoneDropdownOpen }}
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
              </View>
            </View>
          </View>

          {/* Action Button */}
          <View style={styles.actionSection}>
            <Button
              label="SIGN IN TO SHIFT"
              icon={<LogIn size={18} color="#ffffff" strokeWidth={2.4} />}
              onPress={handleLogin}
              size="lg"
              variant="primary"
              style={styles.submitButton}
            />
          </View>
        </View>
      </ScrollView>

      {/* Popover layer sits outside the ScrollView so it can cover the whole
          screen without being clipped by the scroll container. Anchored to the
          measured window rect of the zone selector. */}
      {isZoneDropdownOpen && zoneRect.width > 0 && (
        <>
          <Pressable
            style={styles.dropdownDismissLayer}
            onPress={() => setIsZoneDropdownOpen(false)}
            accessibilityLabel="Close work zone list"
          />
          <View
            style={[
              styles.floatingDropdownCard,
              {
                top: zoneRect.top,
                left: zoneRect.left,
                width: zoneRect.width,
              },
            ]}
          >
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
                  accessibilityState={{ selected: isSelected }}
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
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 48 : 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
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
  brandHero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.select({ android: 12, default: 18 }),
    marginBottom: 4,
  },
  logoBadgeWrap: {
    marginBottom: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    marginTop: 4,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  formSection: {
    marginTop: 36,
    position: 'relative',
    zIndex: 100,
  },
  // 4pt vertical rhythm: 16 between fields, 32 before the primary CTA.
  // Input's own marginBottom is neutralised here via containerStyle.
  fieldSpacing: {
    marginBottom: 16,
  },
  zoneField: {
    marginBottom: 32,
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
  identifierInput: {
    fontFamily: typography.fontMono,
    letterSpacing: 0.4,
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
    ...shadows.input,
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
    fontWeight: '600',
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  floatingDropdownCard: {
    position: 'absolute',
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
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  actionSection: {
    position: 'relative',
    zIndex: 1,
  },
  submitButton: {
    width: '100%',
  },
});
