import React, { useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Box, Check, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { ThemeColors } from '../../shared/theme/colors';
import type { ThemeShadows } from '../../shared/theme/shadows';
import { radii } from '../../shared/theme/radii';
import { Button, Text } from '../../shared/ui';
import { ReceivingProductPicker } from './ReceivingProductPicker';
import { applyBatchGroupProduct, batchCounts, newBatchGroup, type InboundBatchGroup } from './inboundBatch';

interface Props { requestedCount: string; groups: InboundBatchGroup[]; editable: boolean; onChange: (groups: InboundBatchGroup[]) => void }
export function InboundBatchEditor({ requestedCount, groups, editable, onChange }: Props) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [picker, setPicker] = useState<string | null>(null);
  const { total, assigned } = batchCounts(requestedCount, groups);
  const matched = total !== null && total > 0 && assigned === total;
  const edit = (key: string, apply: (group: InboundBatchGroup) => InboundBatchGroup) => {
    if (editable) onChange(groups.map(group => group.key === key ? apply(group) : group));
  };
  return <View style={styles.section}>
    <View style={styles.between}>
      <Text variant="headline">Products</Text>
      <View style={[styles.progressPill, matched && styles.progressMatched]}>
        {matched && <Check size={13} strokeWidth={2.4} color={colors.successText} />}
        <Text variant="caption" color={matched ? 'successText' : 'textSecondary'} style={styles.progressText}>
          {t('{count} containers in total', { count: total ?? 0 })}
        </Text>
      </View>
    </View>
    {groups.map((group, index) => (
      <View key={group.key} style={styles.group}>
        <View style={styles.row}>
          <Pressable style={({ pressed }) => [styles.product, !group.product && styles.productEmpty, pressed && editable && styles.pressed]} accessibilityRole="button" accessibilityLabel={t('Choose Product For Group {group}', { group: index + 1 })} disabled={!editable} onPress={() => setPicker(group.key)}>
            <View style={[styles.productIcon, !!group.product && styles.productIconActive]}>
              <Box size={19} strokeWidth={1.8} color={group.product ? colors.primaryText : colors.textSecondary} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyMedium" color={group.product ? 'textPrimary' : 'primaryText'} numberOfLines={1}>{group.product?.name || t('Choose Product')}</Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>{group.product?.sku || t('Product Group {group}', { group: index + 1 })}</Text>
            </View>
            <ChevronRight size={18} color={group.product ? colors.textMuted : colors.primaryText} />
          </Pressable>
          {groups.length > 1 && <Pressable style={({ pressed }) => [styles.action, pressed && editable && styles.actionPressed]} disabled={!editable} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Remove Product Group {group}', { group: index + 1 })} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onChange(groups.filter(item => item.key !== group.key)); }}><Trash2 size={18} color={colors.textMuted} /></Pressable>}
        </View>
        <View style={styles.groupDivider} />
        <View style={styles.countRow}>
          <Text variant="bodyMedium" color="textSecondary" numberOfLines={1} style={styles.countLabel}>Containers</Text>
          <Stepper value={group.containerCount} editable={editable} label={t('Containers In Group {group}', { group: index + 1 })}
            onChange={containerCount => edit(group.key, previous => ({ ...previous, containerCount }))} />
        </View>
      </View>
    ))}
    <Button title="Add Product" icon={Plus} variant="outline" disabled={!editable || groups.length >= 20} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onChange([...groups, newBatchGroup(groups, '1')]); }} />
    {picker && editable && groups.some(group => group.key === picker) && <ReceivingProductPicker selectedProduct={groups.find(group => group.key === picker)?.product || null} initialBarcode={null} onClose={() => setPicker(null)} onSelect={product => { onChange(applyBatchGroupProduct(groups, picker, product)); setPicker(null); }} />}
  </View>;
}

/** A whole-number stepper (1 to 9,999) with the typed value in the middle. */
function Stepper({ value, onChange, editable, label }: { value: string; onChange: (value: string) => void; editable: boolean; label: string }) {
  const { styles, colors } = useThemedStyles(createStyles);
  const count = Number.parseInt(value, 10) || 0;
  const set = (next: number) => onChange(String(Math.max(1, Math.min(9999, next))));
  return <View style={styles.stepper}>
    <Pressable style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]} disabled={!editable || count <= 1} accessibilityRole="button" accessibilityLabel="Fewer" onPress={() => set(count - 1)}>
      <Minus size={18} color={count <= 1 ? colors.textMuted : colors.textPrimary} />
    </Pressable>
    <TextInput style={styles.stepValue} value={value} editable={editable} keyboardType="number-pad" maxLength={4} selectTextOnFocus
      onChangeText={text => onChange(text.replace(/[^0-9]/g, ''))} accessibilityLabel={label} />
    <Pressable style={({ pressed }) => [styles.stepButton, pressed && styles.pressed]} disabled={!editable || count >= 9999} accessibilityRole="button" accessibilityLabel="More" onPress={() => set(count + 1)}>
      <Plus size={18} color={colors.textPrimary} />
    </Pressable>
  </View>;
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  countLabel: { flex: 1, minWidth: 80 },
  stepper: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSubtle },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // A fixed width: a web text input otherwise stretches and squeezes the label into one letter per line.
  stepValue: { width: 64, height: 44, padding: 0, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  section: { gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progressPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  progressMatched: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  progressOver: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  progressText: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  group: { padding: 14, gap: 12, backgroundColor: colors.surface, borderRadius: radii.lg, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, ...shadows.sm },
  product: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, borderRadius: radii.md, borderCurve: 'continuous' },
  productEmpty: { backgroundColor: colors.surfaceSubtle, paddingHorizontal: 10, paddingVertical: 6 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
  productIcon: { width: 36, height: 36, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  productIconActive: { backgroundColor: colors.primaryLight },
  groupDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  action: { minWidth: 44, minHeight: 44, borderRadius: radii.sm, borderCurve: 'continuous', justifyContent: 'center', alignItems: 'center' },
  actionPressed: { backgroundColor: colors.dangerBg, transform: [{ scale: 0.95 }] },
  fields: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldWide: { flex: 1.1, minWidth: 0 },
  fieldNarrow: { flex: 0.85, minWidth: 0 },
});
