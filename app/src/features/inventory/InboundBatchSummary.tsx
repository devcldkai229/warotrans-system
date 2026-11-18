import React from 'react';
import { View } from 'react-native';
import { Box } from 'lucide-react-native';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Text } from '../../shared/ui';
import type { InboundBatchGroup } from './inboundBatch';
import { createVoucherStyles } from './voucherStyles';

/** A summary of intended contents, without inventing allocated Containers or barcodes. */
export function InboundBatchSummary({ groups }: { groups: InboundBatchGroup[] }) {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  return <View>{groups.map((group, index) => (
    <View key={group.key} style={[styles.summaryRow, index === 0 && { paddingTop: 4 }, index === groups.length - 1 && { borderBottomWidth: 0, paddingBottom: 2 }]}>
      <View style={styles.summaryIcon}>
        <Box size={18} strokeWidth={1.8} color={colors.primaryText} />
      </View>
      <View style={styles.summaryInfo}>
        <Text variant="bodyMedium" numberOfLines={1}>{group.product?.name || t('Product Group {group}', { group: index + 1 })}</Text>
        {!!group.product && <Text variant="code" color="textSecondary" numberOfLines={1}>{group.product.sku}</Text>}
      </View>
      <View style={styles.summaryMetrics}>
        <Text variant="bodyMedium" style={styles.tabular}>{t('{count} boxes', { count: group.containerCount || '—' })}</Text>
        <Text variant="caption" color="textSecondary" style={styles.tabular}>{t('{quantity} {unit} per box', { quantity: group.quantity || '—', unit: group.unit })}</Text>
      </View>
    </View>
  ))}</View>;
}
