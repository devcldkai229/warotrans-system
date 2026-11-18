import React, { useMemo, useState } from 'react';
import {
  DimensionValue,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors } from '../theme/colors';
import { useThemedStyles } from '../theme/ThemeContext';

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
  const styles = useThemedStyles(createStyles);
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
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, _shadows: unknown, isDark: boolean) =>
  StyleSheet.create({
    keyboard: { flex: 1 },
    overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
    sheet: {
      width: '100%',
      maxWidth: 560,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderCurve: 'continuous',
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: isDark ? 0.5 : 0.12,
      shadowRadius: 20,
      elevation: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    handleTarget: { minHeight: 30, paddingTop: 8, paddingBottom: 6, alignItems: 'center', justifyContent: 'center' },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(60, 60, 67, 0.28)',
    },
  });
