import React, { useMemo, useState } from 'react';
import { Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';

interface BottomSheetProps {
  onClose: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}

export function BottomSheet({ onClose, children, accessibilityLabel = 'task details' }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [availableHeight, setAvailableHeight] = useState(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -35) setExpanded(true);
      else if (gesture.dy > 80 && !expanded) onClose();
      else if (gesture.dy > 35) setExpanded(false);
    },
  }), [expanded, onClose]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay} onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Dismiss ${accessibilityLabel}`} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, {
            height: availableHeight ? Math.min(availableHeight * (expanded ? 0.94 : 0.72), availableHeight - insets.top - 12) : '72%',
            paddingBottom: Math.max(insets.bottom, 16),
          }]}
        >
          <View {...pan.panHandlers}>
            <Pressable
              onPress={() => setExpanded(value => !value)}
              accessibilityRole="button"
              accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} ${accessibilityLabel}`}
              accessibilityState={{ expanded }}
              style={styles.handleTarget}
            >
              <View style={styles.handle} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, overflow: 'hidden' },
  handleTarget: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 4, borderRadius: radii.pill, backgroundColor: colors.borderStrong },
});
