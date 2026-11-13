import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Box, Check, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { ThemeColors } from '../../shared/theme/colors';
import type { ThemeShadows } from '../../shared/theme/shadows';
import { radii } from '../../shared/theme/radii';
import { Button, Text, TextField } from '../../shared/ui';
import { ReceivingProductPicker } from './ReceivingProductPicker';
import { applyBatchGroupProduct, batchCounts, newBatchGroup, type InboundBatchGroup } from './inboundBatch';

interface Props { requestedCount: string; groups: InboundBatchGroup[]; editable: boolean; onChange: (groups: InboundBatchGroup[]) => void }
export function InboundBatchEditor({ requestedCount, groups, editable, onChange }: Props) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [picker, setPicker] = useState<string | null>(null);
  const { total, grouped, assigned, remaining } = batchCounts(requestedCount, groups);
  const over = total !== null && grouped > total;
  const matched = total !== null && total > 0 && assigned === total && grouped === total;
  const edit = (key: string, apply: (group: InboundBatchGroup) => InboundBatchGroup) => {
    if (editable) onChange(groups.map(group => group.key === key ? apply(group) : group));
  };
  return <View style={styles.section}>
    <View style={styles.between}>
      <Text variant="headline">Products</Text>
      <View style={[styles.progressPill, matched && styles.progressMatched, over && styles.progressOver]}>
        {matched && <Check size={13} strokeWidth={2.4} color={colors.successText} />}
        <Text variant="caption" color={over ? 'dangerText' : matched ? 'successText' : 'textSecondary'} style={styles.progressText}>
          {t('{assigned}/{total} assigned', { assigned, total: total ?? '—' })}
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
          {groups.length > 1 && <Pressable style={({ pressed }) => [styles.action, pressed && editable && styles.actionPressed]} disabled={!editable} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Remove Product Group {group}', { group: index + 1 })} onPress={() => onChange(groups.filter(item => item.key !== group.key))}><Trash2 size={18} color={colors.textMuted} /></Pressable>}
        </View>
        <View style={styles.groupDivider} />
        <View style={styles.fields}>
          <TextField containerStyle={styles.fieldWide} label="Containers" accessibilityLabel={t('Containers In Group {group}', { group: index + 1 })} value={group.containerCount} onChangeText={containerCount => edit(group.key, previous => ({ ...previous, containerCount }))} keyboardType="number-pad" maxLength={4} editable={editable} placeholder="0" />
          <TextField containerStyle={styles.fieldWide} label="Qty / Box" accessibilityLabel={t('Quantity Per Container In Group {group}', { group: index + 1 })} value={group.quantity} onChangeText={quantity => edit(group.key, previous => ({ ...previous, quantity }))} keyboardType="decimal-pad" maxLength={16} editable={editable} placeholder="24" />
          <TextField containerStyle={styles.fieldNarrow} label="Unit" accessibilityLabel={t('Unit In Group {group}', { group: index + 1 })} value={group.unit} onChangeText={unit => edit(group.key, previous => ({ ...previous, unit }))} maxLength={32} editable={editable} placeholder="pcs" />
        </View>
      </View>
    ))}
    <Button title="Add Product" icon={Plus} variant="outline" disabled={!editable || !total || groups.length >= total} onPress={() => onChange([...groups, newBatchGroup(groups, remaining && remaining > 0 ? String(remaining) : '')])} />
    {picker && editable && groups.some(group => group.key === picker) && <ReceivingProductPicker selectedProduct={groups.find(group => group.key === picker)?.product || null} initialBarcode={null} onClose={() => setPicker(null)} onSelect={product => { onChange(applyBatchGroupProduct(groups, picker, product)); setPicker(null); }} />}
  </View>;
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
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
