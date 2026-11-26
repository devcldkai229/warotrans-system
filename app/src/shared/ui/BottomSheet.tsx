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
  floating?: boolean;
}

const WEB_FLOATING_GLASS_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      } as unknown as ViewStyle)
    : null;

export function BottomSheet({
  onClose,
  children,
  accessibilityLabel = 'task details',
  autoHeight = false,
  floating = false,
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

  const floatingBottom = Math.max(insets.bottom, 14);
  const verticalSlack = floating ? insets.top + floatingBottom + 12 : insets.top + 12;

  const heightStyle: ViewStyle = autoHeight
    ? {
        maxHeight: (availableHeight
          ? Math.min(availableHeight * (expanded ? 0.94 : 0.84), Math.max(120, availableHeight - verticalSlack))
          : '84%') as DimensionValue,
      }
    : {
        height: (availableHeight
          ? Math.min(availableHeight * (expanded ? 0.94 : 0.72), Math.max(120, availableHeight - verticalSlack))
          : '72%') as DimensionValue,
      };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={[styles.overlay, floating && styles.overlayFloating]}
          onLayout={event => setAvailableHeight(event.nativeEvent.layout.height)}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={`Dismiss ${accessibilityLabel}`} />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={[
              styles.sheet,
              floating && styles.sheetFloating,
              floating && WEB_FLOATING_GLASS_STYLE,
              heightStyle,
              floating
                ? { marginBottom: floatingBottom, paddingBottom: 4 }
                : { paddingBottom: Math.max(insets.bottom, 16) },
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
    overlayFloating: { paddingHorizontal: 14 },
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
    sheetFloating: {
      maxWidth: 540,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(18, 19, 23, 0.10)',
      backgroundColor: isDark ? 'rgba(28, 30, 34, 0.94)' : 'rgba(255, 255, 255, 0.95)',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: isDark ? 0.55 : 0.18,
      shadowRadius: 28,
      elevation: 20,
    },
    handleTarget: { minHeight: 30, paddingTop: 8, paddingBottom: 6, alignItems: 'center', justifyContent: 'center' },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(60, 60, 67, 0.28)',
    },
  });
