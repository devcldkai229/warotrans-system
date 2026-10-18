import React from 'react';
import { Modal, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';

export interface SheetDialogProps {
  visible: boolean;
  /** Backdrop tap, Android back button and the scrim itself all land here. */
  onClose: () => void;
  /** Announced by the scrim's accessible label, e.g. "Close zone picker". */
  closeLabel: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The centred white dialog every shell overlay sits in.
 *
 * Extracted because three surfaces need the exact same frame — the zone picker,
 * the account sheet, and (as a bottom sheet) the safety actions — and each one
 * had grown its own copy of the backdrop, the max-width and the shadow. The
 * bottom sheet deliberately keeps its own layout in `SafetyActionSheet`: it is
 * anchored to the bottom edge, not centred, and a shared frame that covers both
 * would need a `placement` prop for one caller.
 *
 * `Modal` rather than an absolutely-positioned overlay: these are occasional
 * actions, and a permanently mounted popover anchored to a measured header
 * height drifts by up to 39pt between an SE and a Dynamic Island.
 */
export function SheetDialog({
  visible,
  onClose,
  closeLabel,
  children,
  style,
}: SheetDialogProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />

        <View style={[styles.dialog, style]}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 10,
    ...shadows.lg,
  },
});