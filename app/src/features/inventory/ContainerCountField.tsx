import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text, TextField } from '../../shared/ui';
import { radii } from '../../shared/theme/radii';
import type { ThemeColors } from '../../shared/theme/colors';
import { stepContainerCount } from './voucherPreparation';

interface Props { value: string; onChange: (value: string) => void; editable: boolean }
export function ContainerCountField({ value, onChange, editable }: Props) {
  const { styles, colors } = useThemedStyles(createStyles);
  const wheelArea = useRef<React.ComponentRef<typeof View>>(null);
  const focused = useRef(false);
  const latest = useRef({ value, onChange, editable }); latest.current = { value, onChange, editable };
  const step = (direction: 1 | -1) => {
    const current = latest.current;
    if (current.editable) current.onChange(stepContainerCount(current.value, direction));
  };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const target = wheelArea.current as unknown as HTMLElement | null;
    if (!target?.addEventListener) return;
    let lastWheel = -Infinity;
    const wheel = (event: WheelEvent) => {
      if (!latest.current.editable || !focused.current || event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      // One unit per wheel tick; throttle dense trackpad events.
      const now = Date.now();
      if (now - lastWheel < 120) return;
      lastWheel = now;
      step(event.deltaY < 0 ? 1 : -1);
    };
    target.addEventListener('wheel', wheel, { passive: false });
    return () => target.removeEventListener('wheel', wheel);
  }, []);
  return <View style={{ gap: 8 }}>
    <Text variant="label" color="textSecondary">Number Of Containers</Text>
    <View ref={wheelArea}>
      <TextField accessibilityLabel="Number Of Containers" value={value} onChangeText={onChange} keyboardType="number-pad" maxLength={4} editable={editable} placeholder="e.g. 5"
        inputStyle={styles.number} onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; }}
        onKeyPress={event => { if (event.nativeEvent.key === 'ArrowUp') step(1); if (event.nativeEvent.key === 'ArrowDown') step(-1); }}
        rightIcon={<View style={styles.stepper}>
          {([1, -1] as const).map(direction => {
            const disabled = !editable || (direction === 1 ? Number(value) >= 9999 : Number(value) === 1);
            return <Pressable key={direction} style={({ pressed }) => [styles.stepButton, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
              accessibilityRole="button" accessibilityLabel={direction === 1 ? 'Increase Container Count' : 'Decrease Container Count'} accessibilityState={{ disabled }} disabled={disabled} onPress={() => step(direction)}>
              {direction === 1 ? <ChevronUp size={18} strokeWidth={1.8} color={colors.textSecondary} /> : <ChevronDown size={18} strokeWidth={1.8} color={colors.textSecondary} />}
            </Pressable>;
          })}
          <View pointerEvents="none" style={styles.divider} />
        </View>} />
    </View>
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  number: { fontSize: 24, lineHeight: 32, fontWeight: '600', fontVariant: ['tabular-nums'], paddingVertical: 20 },
  stepper: { position: 'relative', width: 44, marginRight: -12, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  divider: { position: 'absolute', top: 44, left: 10, right: 10, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  pressed: { backgroundColor: colors.primaryLight },
  disabled: { opacity: 0.3 },
});
