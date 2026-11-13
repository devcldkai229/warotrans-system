import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Box, ChevronRight, Plus, Trash2 } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Button, Text, TextField } from '../../shared/ui';
import { ReceivingProductPicker } from './ReceivingProductPicker';
import { applyBatchGroupProduct, batchCounts, newBatchGroup, type InboundBatchGroup } from './inboundBatch';

interface Props { requestedCount: string; groups: InboundBatchGroup[]; editable: boolean; onChange: (groups: InboundBatchGroup[]) => void }
export function InboundBatchEditor({ requestedCount, groups, editable, onChange }: Props) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [picker, setPicker] = useState<string | null>(null);
  const { total, assigned, remaining } = batchCounts(requestedCount, groups);
  const edit = (key: string, apply: (group: InboundBatchGroup) => InboundBatchGroup) => {
    if (editable) onChange(groups.map(group => group.key === key ? apply(group) : group));
  };
  return <View style={styles.section}>
    <View style={styles.between}><Text variant="headline">Products</Text><Text variant="caption" color="textSecondary">{t('{assigned}/{total} assigned', { assigned, total: total ?? '—' })}</Text></View>
    {groups.map((group, index) => (
      <View key={group.key} style={styles.group}>
        <View style={styles.row}>
          <Pressable style={styles.product} accessibilityRole="button" accessibilityLabel={t('Choose Product For Group {group}', { group: index + 1 })} disabled={!editable} onPress={() => setPicker(group.key)}>
            <View style={styles.productIcon}><Box size={20} strokeWidth={1.7} color={colors.textSecondary} /></View>
            <View style={styles.flex}><Text variant="bodyMedium">{group.product?.name || t('Choose Product')}</Text><Text variant="caption" color="textSecondary">{group.product?.sku || t('Product Group {group}', { group: index + 1 })}</Text></View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
          {groups.length > 1 && <Pressable style={styles.action} disabled={!editable} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Remove Product Group {group}', { group: index + 1 })} onPress={() => onChange(groups.filter(item => item.key !== group.key))}><Trash2 size={18} color={colors.textMuted} /></Pressable>}
        </View>
        <View style={styles.fields}>
          <TextField containerStyle={styles.flex} label="Containers" accessibilityLabel={t('Containers In Group {group}', { group: index + 1 })} value={group.containerCount} onChangeText={containerCount => edit(group.key, previous => ({ ...previous, containerCount }))} keyboardType="number-pad" maxLength={4} editable={editable} placeholder="0" />
          <TextField containerStyle={styles.flex} label="Qty / Box" accessibilityLabel={t('Quantity Per Container In Group {group}', { group: index + 1 })} value={group.quantity} onChangeText={quantity => edit(group.key, previous => ({ ...previous, quantity }))} keyboardType="decimal-pad" maxLength={16} editable={editable} placeholder="24" />
          <TextField containerStyle={styles.flex} label="Unit" accessibilityLabel={t('Unit In Group {group}', { group: index + 1 })} value={group.unit} onChangeText={unit => edit(group.key, previous => ({ ...previous, unit }))} maxLength={32} editable={editable} placeholder="pcs" />
        </View>
      </View>
    ))}
    <Button title="Add Product" icon={Plus} variant="outline" disabled={!editable || !total || groups.length >= total} onPress={() => onChange([...groups, newBatchGroup(groups, remaining && remaining > 0 ? String(remaining) : '')])} />
    {picker && editable && groups.some(group => group.key === picker) && <ReceivingProductPicker selectedProduct={groups.find(group => group.key === picker)?.product || null} initialBarcode={null} onClose={() => setPicker(null)} onSelect={product => { onChange(applyBatchGroupProduct(groups, picker, product)); setPicker(null); }} />}
  </View>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  section: { gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, minWidth: 0, gap: 3 },
  group: { padding: 14, gap: 12, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  product: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  productIcon: { width: 34, height: 34, backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  action: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  fields: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
});
