import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Box, FileText, MapPin } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { mobileCapabilities } from '../../shared/api/capabilities';
import { confirmStockVoucher, getStockVoucher } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, Text } from '../../shared/ui';
import { canCreateVoucher, canReadVouchers, voucherDate } from './stockVoucherData';
import { createVoucherStyles } from './voucherStyles';
import { VoucherDraftWorkspace } from './VoucherDraftWorkspace';

export function StockVoucherDetailScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { session } = useAuth();
  const { params, goBack } = useNavigation();
  const insets = useSafeAreaInsets();
  const voucherId = typeof params?.voucherId === 'string' ? params.voucherId : '';
  const allowed = canReadVouchers(session);
  const query = useQuery({
    queryKey: ['stock-voucher', session?.id, voucherId], queryFn: ({ signal }) => getStockVoucher(voucherId, signal),
    enabled: allowed && !!voucherId, staleTime: 0, refetchInterval: 15_000, retry: false,
  });
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const data = allowed && !denied && query.data?.id === voucherId ? query.data : undefined;
  const inbound = data?.type === 'INBOUND';

  return <View style={styles.screen}>
    <ScreenHeader title={data ? inbound ? 'Inbound Voucher' : 'Outbound Voucher' : 'Voucher Details'} subtitle={data?.code} canGoBack onBack={goBack}
      rightAction={data ? <StatusPill status={data.status} /> : undefined} />
    {!allowed || !voucherId ? <EmptyState title={!allowed ? 'Voucher Access Unavailable' : 'No Voucher Selected'} />
      : !data ? query.isPending ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text variant="body">Loading Voucher…</Text></View>
        : <EmptyState icon={FileText} title="Voucher Unavailable" message={getUserErrorMessage(query.error, 'This voucher could not be loaded.')} actionTitle="Retry" onAction={() => { void query.refetch(); }} />
        : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, data.status !== 'DRAFT' && { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
            refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.primary} />}>
            {query.isError && <View style={styles.error}><Text variant="caption" color="dangerText">Could not refresh. Showing the last loaded voucher.</Text><Button title="Retry" variant="outline" size="sm" onPress={() => { void query.refetch(); }} /></View>}
            <Card gap={12} style={styles.reviewCard}>
              {(data.containerCount > 0 || data.status !== 'DRAFT') && <View style={styles.batchStatBar}>
                <View style={styles.stat}><Text variant="title" style={styles.tabular}>{data.containerCount}</Text><Text variant="bodyMedium" color="textSecondary">{data.containerCount === 1 ? 'container' : 'containers'}</Text></View>
              </View>}
              <View style={styles.row}>
                <View style={styles.summaryIcon}><MapPin size={18} color={colors.primaryText} /></View>
                <View style={styles.summaryInfo}>
                  <Text variant="bodyMedium" numberOfLines={1}>{data.warehouseName || data.warehouseCode || 'Warehouse not reported'}</Text>
                  <Text variant="caption" color="textSecondary">{t('Created {date}', { date: voucherDate(data.createdAt) })}</Text>
                </View>
              </View>
              {!!data.referenceNo && <View style={styles.flex}><Text variant="caption" color="textSecondary">Reference</Text><Text variant="bodyMedium" selectable>{data.referenceNo}</Text></View>}
              {!!data.note && <Text variant="body" color="textSecondary">{data.note}</Text>}
              {!!data.confirmedAt && <Text variant="caption" color="textSecondary">Confirmed {voucherDate(data.confirmedAt)}</Text>}
              {data.status === 'CONFIRMED' && <Text variant="caption" color="textSecondary">Stock posting status is unavailable.</Text>}
              {!!data.cancelledAt && <Text variant="caption" color="textSecondary">Cancelled {voucherDate(data.cancelledAt)}</Text>}
            </Card>

            {params?.preparationCopyFailed && <View style={styles.error}><Text variant="body" color="dangerText">The server draft was created, but preparation could not be copied. Enter the container count again; do not create another draft.</Text></View>}
            {data.status === 'DRAFT' && <VoucherDraftWorkspace key={`${session?.id}:${data.id}:${data.type}`} data={data} accountId={session?.id || ''} writable={canCreateVoucher(session) && !query.isError} />}

            {data.status !== 'DRAFT' && !!data.lines.length && <Card gap={8} style={styles.reviewCard}>
              <Text variant="headline">Containers</Text>
              {data.lines.map((line, index) => <View key={line.id} style={[styles.summaryRow, index === 0 && { paddingTop: 4 }, index === data.lines.length - 1 && { borderBottomWidth: 0, paddingBottom: 2 }]}>
                <View style={styles.summaryIcon}><Box size={18} strokeWidth={1.8} color={colors.primaryText} /></View>
                <View style={styles.summaryInfo}>
                  <View style={styles.between}><Text variant="code" selectable style={{ flex: 1 }}>{line.containerBarcode}</Text><StatusPill status={line.containerStatus} /></View>
                  <Text variant="bodyMedium" numberOfLines={1}>{line.productName}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>{line.productSku} · {line.currentStorageLocationCode || 'Location not reported'}{line.currentLevelNo != null ? ` · Level ${line.currentLevelNo}` : ''}</Text>
                </View>
              </View>)}
            </Card>}
          </ScrollView>
          {data.status === 'DRAFT' && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {(!mobileCapabilities.confirmStockVoucher || !data.lines.length) && <Text variant="caption" color="textSecondary">{inbound ? 'Awaiting server barcode allocation and inbound confirmation.' : 'Awaiting server container lines and outbound confirmation.'}</Text>}
            <Button title={inbound ? 'Confirm Inbound Voucher' : 'Confirm Outbound Voucher'} fullWidth disabled={!canCreateVoucher(session) || !mobileCapabilities.confirmStockVoucher || !data.lines.length} onPress={() => { if (mobileCapabilities.confirmStockVoucher && data.lines.length) void confirmStockVoucher(data.id); }} />
          </View>}
        </KeyboardAvoidingView>}
  </View>;
}
