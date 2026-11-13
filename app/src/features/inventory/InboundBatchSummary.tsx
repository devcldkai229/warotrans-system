import React from 'react';
import { View } from 'react-native';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import { batchOverrides, type InboundBatchGroup } from './inboundBatch';
import { createVoucherStyles } from './voucherStyles';

/** A summary of intended contents, without inventing allocated Containers or barcodes. */
export function InboundBatchSummary({ groups }: { groups: InboundBatchGroup[] }) {
  const { styles } = useThemedStyles(createVoucherStyles);
  return <View style={{ gap: 8 }}>{groups.map((group, index) => {
    const overrides = batchOverrides(group);
    return <View key={group.key} style={styles.containerRow}>
      <View style={styles.between}><Text variant="bodyMedium" style={styles.flex}>{group.product?.name || t('Product Group {group}', { group: index + 1 })}</Text><Text variant="bodyMedium">{t('{count} boxes', { count: group.containerCount || '—' })}</Text></View>
      {!!group.product && <Text variant="caption" color="textSecondary">{group.product.sku}</Text>}
      <Text variant="body" color="textSecondary">{t('{quantity} {unit} per box', { quantity: group.quantity || '—', unit: group.unit })}</Text>
      {!!overrides.length && <Text variant="caption" color="textSecondary">{t('{count} individual quantities', { count: overrides.length })}</Text>}
      {overrides.slice(0, 10).map(override => <Text key={override.containerNo} variant="caption">{t('Box {number}: {quantity} {unit}', { number: override.containerNo, quantity: override.quantity || '—', unit: group.unit })}</Text>)}
      {overrides.length > 10 && <Text variant="caption" color="textMuted">{t('{count} more individual quantities', { count: overrides.length - 10 })}</Text>}
    </View>;
  })}</View>;
}
