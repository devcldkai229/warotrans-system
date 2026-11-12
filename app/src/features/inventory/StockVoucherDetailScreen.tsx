import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileText, MapPin } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { getStockVoucher } from '../../shared/api/warehouseApi';
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
        : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.primary} />}>
          {query.isError && <View style={styles.error}><Text variant="caption" color="dangerText">Could not refresh. Showing the last loaded voucher.</Text><Button title="Retry" variant="outline" size="sm" onPress={() => { void query.refetch(); }} /></View>}
          <Card gap={16}>
            <View style={styles.stat}><Text variant="title">{data.containerCount}</Text><Text variant="body" color="textSecondary">{data.containerCount === 1 ? 'container' : 'containers'}</Text></View>
            <View style={styles.row}><MapPin size={16} color={colors.textMuted} /><Text variant="bodyMedium" style={{ flex: 1 }}>{data.warehouseName || data.warehouseCode || 'Warehouse not reported'}</Text></View>
            <Text variant="caption" color="textSecondary">Created {voucherDate(data.createdAt)}</Text>
            {!!data.referenceNo && <View style={styles.flex}><Text variant="caption">Reference</Text><Text variant="body" selectable>{data.referenceNo}</Text></View>}
            {!!data.note && <Text variant="body" color="textSecondary">{data.note}</Text>}
            {!!data.confirmedAt && <Text variant="caption">Confirmed {voucherDate(data.confirmedAt)}</Text>}
            {data.status === 'CONFIRMED' && <Text variant="caption" color="textSecondary">Stock posting status is unavailable.</Text>}
            {!!data.cancelledAt && <Text variant="caption">Cancelled {voucherDate(data.cancelledAt)}</Text>}
          </Card>

          {params?.preparationCopyFailed && <View style={styles.error}><Text variant="body" color="dangerText">The server draft was created, but preparation could not be copied. Enter the container count again; do not create another draft.</Text></View>}
          {data.status === 'DRAFT' && <VoucherDraftWorkspace key={`${session?.id}:${data.id}:${data.type}`} data={data} accountId={session?.id || ''} writable={canCreateVoucher(session) && !query.isError} />}

          {data.status !== 'DRAFT' && !!data.lines.length && <Card gap={8}>
            <Text variant="headline">Containers</Text>
            {data.lines.map(line => <View key={line.id} style={styles.containerRow}>
              <View style={styles.between}><Text variant="code" selectable style={{ flex: 1 }}>{line.containerBarcode}</Text><StatusPill status={line.containerStatus} /></View>
              <Text variant="bodyMedium">{line.productName}</Text><Text variant="caption" color="textSecondary">{line.productSku}</Text>
              <Text variant="caption" color="textSecondary">{line.currentStorageLocationCode || 'Location not reported'}{line.currentLevelNo != null ? ` · Level ${line.currentLevelNo}` : ''}</Text>
            </View>)}
          </Card>}
        </ScrollView></KeyboardAvoidingView>}
  </View>;
}
