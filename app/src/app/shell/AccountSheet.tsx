import { LogOut } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { toast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  operatorName: string;
  operatorRole: string;
  /** Avatar initials, computed by the caller from the operator name. */
  initials: string;
  zone: string;
  /** Omitted when the shell is embedded somewhere that owns sign-out itself. */
  onLogout?: () => void;
}

/**
 * Anchored Account Dropdown Card.
 *
 * Drops down cleanly right beneath the avatar with an ultra-lightweight,
 * transparent dismiss layer instead of a heavy centered screen modal.
 */
export function AccountSheet({
  visible,
  onClose,
  operatorName,
  operatorRole,
  initials,
  zone,
  onLogout,
}: AccountSheetProps) {
  const topInset = useTopInset();

  const handleSignOut = () => {
    triggerHaptic('warning');
    onClose();
    onLogout?.();
    toast.info('Signed out of the shift console.');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close account menu"
        />

        <View style={[styles.dropdownCard, { top: topInset + 50 }]}>
          {/* Operator Profile */}
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text variant="caption" color={colors.textInverse} style={styles.avatarText}>
                {initials}
              </Text>
            </View>
            <View style={styles.profileText}>
              <Text variant="bodyMedium" numberOfLines={1} style={styles.operatorName}>
                {operatorName}
              </Text>
              <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
                {operatorRole} · {zone}
              </Text>
            </View>
          </View>

          {/* Shift Details */}
          <View style={styles.shiftBox}>
            <Text variant="caption" color={colors.textSecondary}>
              Current shift
            </Text>
            <Text variant="label" color={colors.textPrimary}>
              Morning (06:00 – 14:00)
            </Text>
          </View>

          {/* Sign Out Action */}
          {onLogout ? (
            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out of shift"
              style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
            >
              <LogOut size={15} color={colors.dangerText} />
              <Text variant="label" color={colors.dangerText}>
                Sign Out
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  dropdownCard: {
    position: 'absolute',
    right: 16,
    width: 260,
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
    ...shadows.lg,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121317', // Calm monochrome ink
  },
  avatarText: {
    fontWeight: '700',
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  operatorName: {
    fontWeight: '700',
  },
  shiftBox: {
    padding: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    gap: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  signOutBtnPressed: {
    opacity: 0.85,
  },
});