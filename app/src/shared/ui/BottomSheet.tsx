import React, { useMemo, useState } from 'react';
import {
  DimensionValue,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { radii } from '../theme/radii';

interface BottomSheetProps {
  onClose: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
  autoHeight?: boolean;
}

export function BottomSheet({
  onClose,
  children,
  accessibilityLabel = 'task details',
  autoHeight = false,
}: BottomSheetProps) {
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

  const heightStyle: ViewStyle = autoHeight
    ? {
        maxHeight: (availableHeight
          ? Math.min(availableHeight * (expanded ? 0.94 : 0.84), availableHeight - insets.top - 12)
          : '84%') as DimensionValue,
      }
    : {
        height: (availableHeight
          ? Math.min(availableHeight * (expanded ? 0.94 : 0.72), availableHeight - insets.top - 12)
          : '72%') as DimensionValue,
      };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay} onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Dismiss ${accessibilityLabel}`} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[
            styles.sheet,
            heightStyle,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
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
  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.8)',
  },
  handleTarget: { minHeight: 30, paddingTop: 8, paddingBottom: 6, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(60, 60, 67, 0.28)' },
});
