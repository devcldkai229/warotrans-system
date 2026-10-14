import { LogOut } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { toast } from '../../shared/context/ToastContext';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { SheetDialog } from './SheetDialog';

export interface AccountSheetProps {
  visible: boolean;
  onClose: () => void;
  operatorName: string;
  operatorRole: string;
  /** Avatar initials. Falls back to the operator name's first two initials. */
  initials: string;
  zone: string;
  /** Omitted when the shell is embedded somewhere that owns sign-out itself. */
  onLogout?: () => void;
}

/**
 * Who is on shift, and the one way out of it.
 *
 * Signing out is a full-width `danger` row on a `dangerBg` fill, placed *after*
 * the shift summary rather than under the avatar: an operator ending a shift is
 * reaching for this deliberately, and a bare icon in the corner is the one
 * control on the shell a mis-tap would end their session over.
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
  const handleSignOut = () => {
    triggerHaptic('warning');
    onClose();
    onLogout?.();
    toast.info('Signed out of the shift console.');
  };

  return (
    <SheetDialog visible={visible} onClose={onClose} closeLabel="Close account menu">
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text variant="bodyMedium" color={colors.textInverse}>
            {initials}
          </Text>
        </View>
        <View style={styles.text}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {operatorName}
          </Text>
          <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {operatorRole} · {zone}
          </Text>
        </View>
      </View>

      <View style={styles.shiftRow}>
        <Text variant="caption" color={colors.textSecondary}>
          Current shift
        </Text>
        <Text variant="label">Morning (06:00 – 14:00)</Text>
      </View>

      {onLogout ? (
        <Pressable
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out of shift"
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.signOutBtnPressed]}
        >
          <LogOut size={16} color={colors.danger} />
          <Text variant="label" color={colors.danger}>
            Sign out of shift
          </Text>
        </Pressable>
      ) : null}
    </SheetDialog>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  shiftRow: {
    marginTop: 4,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
    gap: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    marginTop: 4,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
  },
  signOutBtnPressed: {
    opacity: 0.85,
  },
});