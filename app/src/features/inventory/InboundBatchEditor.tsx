import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Box, ChevronDown, ChevronRight, ChevronUp, Plus, RotateCcw, ScanLine, Trash2 } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { Button, Text, TextField } from '../../shared/ui';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { ReceivingProductPicker } from './ReceivingProductPicker';
import { applyBatchGroupProduct, batchCounts, batchOverrideReveal, batchQuantity, newBatchGroup, type BatchProblem, type InboundBatchGroup } from './inboundBatch';
import { preparationCount } from './voucherPreparation';

interface Props { requestedCount: string; groups: InboundBatchGroup[]; editable: boolean; problem?: BatchProblem | null; onChange: (groups: InboundBatchGroup[]) => void }
export function InboundBatchEditor({ requestedCount, groups, editable, problem, onChange }: Props) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [picker, setPicker] = useState<{ key: string; barcode: string | null } | null>(null);
  const [scanKey, setScanKey] = useState<string | null>(null);
  const [individual, setIndividual] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const { total, assigned, remaining } = batchCounts(requestedCount, groups);
  const edit = (key: string, apply: (group: InboundBatchGroup) => InboundBatchGroup) => {
    if (editable) onChange(groups.map(group => group.key === key ? apply(group) : group));
  };
  useEffect(() => {
    const reveal = batchOverrideReveal(problem, 10);
    if (!reveal) return;
    setIndividual(reveal.groupKey);
    setLimit(current => individual === reveal.groupKey ? Math.max(current, reveal.limit) : reveal.limit);
  }, [problem]);
  return <View style={styles.section}>
    <View style={styles.between}><Text variant="headline">Products</Text><Text variant="caption" color="textSecondary">{t('{assigned}/{total} assigned', { assigned, total: total ?? '—' })}</Text></View>
    {groups.map((group, index) => {
      const count = preparationCount(group.containerCount) || 0;
      const expanded = individual === group.key;
      const numbers = Array.from({ length: Math.min(count, limit) }, (_, i) => i + 1);
      return <View key={group.key} style={styles.group}>
        <View style={styles.row}>
          <Pressable style={styles.product} accessibilityRole="button" accessibilityLabel={t('Choose Product For Group {group}', { group: index + 1 })} disabled={!editable} onPress={() => setPicker({ key: group.key, barcode: null })}>
            <View style={styles.productIcon}><Box size={20} strokeWidth={1.7} color={colors.textSecondary} /></View>
            <View style={styles.flex}><Text variant="bodyMedium">{group.product?.name || t('Choose Product')}</Text><Text variant="caption" color="textSecondary">{group.product?.sku || t('Product Group {group}', { group: index + 1 })}</Text></View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable style={styles.action} disabled={!editable} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Scan Product For Group {group}', { group: index + 1 })} onPress={() => setScanKey(group.key)}><ScanLine size={20} color={colors.primaryText} /></Pressable>
        </View>
        <View style={styles.fields}>
          <TextField containerStyle={styles.flex} label="Containers" accessibilityLabel={t('Containers In Group {group}', { group: index + 1 })} value={group.containerCount} onChangeText={containerCount => edit(group.key, previous => ({ ...previous, containerCount }))} keyboardType="number-pad" maxLength={4} editable={editable} placeholder="0" />
          <TextField containerStyle={styles.flex} label="Qty / Box" accessibilityLabel={t('Quantity Per Container In Group {group}', { group: index + 1 })} value={group.quantity} onChangeText={quantity => edit(group.key, previous => ({ ...previous, quantity }))} keyboardType="decimal-pad" maxLength={16} editable={editable} placeholder="24" />
          <TextField containerStyle={styles.flex} label="Unit" accessibilityLabel={t('Unit In Group {group}', { group: index + 1 })} value={group.unit} onChangeText={unit => edit(group.key, previous => ({ ...previous, unit }))} maxLength={32} editable={editable} placeholder="pcs" />
        </View>
        <View style={styles.between}>
          <Pressable style={styles.individual} disabled={!count} accessibilityRole="button" accessibilityState={{ expanded, disabled: !count }} onPress={() => { setIndividual(expanded ? null : group.key); setLimit(10); }}>
            <Text variant="caption" color={count ? 'primaryText' : 'textMuted'}>Individual Quantities</Text>{expanded ? <ChevronUp size={16} color={colors.textMuted} /> : <ChevronDown size={16} color={colors.textMuted} />}
          </Pressable>
          {groups.length > 1 && <Pressable style={styles.action} disabled={!editable} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Remove Product Group {group}', { group: index + 1 })} onPress={() => onChange(groups.filter(item => item.key !== group.key))}><Trash2 size={18} color={colors.textMuted} /></Pressable>}
        </View>
        {expanded && count > 0 && <View style={styles.overrides}>
          {numbers.map(number => <View key={number} style={styles.row}>
            <Text variant="body" style={styles.flex}>{t('Box {number}', { number })}</Text>
            <TextField containerStyle={styles.overrideInput} accessibilityLabel={t('Quantity In Box {number} Of Group {group}', { number, group: index + 1 })} value={batchQuantity(group, number)} onChangeText={quantity => edit(group.key, previous => ({ ...previous, quantities: { ...previous.quantities, [number]: quantity } }))} keyboardType="decimal-pad" maxLength={16} editable={editable} placeholder={group.quantity || '0'} />
            <Text variant="caption" color="textSecondary" style={styles.unit}>{group.unit}</Text>
            <Pressable style={styles.action} disabled={!editable || !Object.hasOwn(group.quantities, number)} accessibilityRole="button" accessibilityState={{ disabled: !editable || !Object.hasOwn(group.quantities, number) }} accessibilityLabel={t('Reset Box {number} Of Group {group}', { number, group: index + 1 })} onPress={() => edit(group.key, previous => { const quantities = { ...previous.quantities }; delete quantities[String(number)]; return { ...previous, quantities }; })}><RotateCcw size={16} color={Object.hasOwn(group.quantities, number) ? colors.primaryText : colors.textMuted} /></Pressable>
          </View>)}
          {count > limit && <Button title="Show More Containers" variant="ghost" size="sm" onPress={() => setLimit(value => value + 10)} />}
        </View>}
      </View>;
    })}
    <Button title="Add Product" icon={Plus} variant="outline" disabled={!editable || !total || groups.length >= total} onPress={() => onChange([...groups, newBatchGroup(groups, remaining && remaining > 0 ? String(remaining) : '')])} />
    {picker && editable && groups.some(group => group.key === picker.key) && <ReceivingProductPicker selectedProduct={groups.find(group => group.key === picker.key)?.product || null} initialBarcode={picker.barcode} onClose={() => setPicker(null)} onSelect={product => { onChange(applyBatchGroupProduct(groups, picker.key, product)); setPicker(null); }} />}
    {scanKey && editable && <BarcodeScannerHUD visible title="Scan Product Barcode" manualLabel="Product Or Supplier Barcode" onClose={() => setScanKey(null)} onScanResult={barcode => { onChange(applyBatchGroupProduct(groups, scanKey, null)); setPicker({ key: scanKey, barcode }); setScanKey(null); }} />}
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
  individual: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  overrides: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 12 },
  overrideInput: { width: 84 },
  unit: { maxWidth: 48, flexShrink: 1 },
});
