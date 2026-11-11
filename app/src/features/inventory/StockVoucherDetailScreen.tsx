import React, { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Barcode, Box, Check, FileText, MapPin } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { getStockVoucher } from '../../shared/api/warehouseApi';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, Text, TextField } from '../../shared/ui';
import { canReadVouchers, voucherDate } from './stockVoucherData';
import { createVoucherStyles } from './voucherStyles';

export function StockVoucherDetailScreen() {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const { session } = useAuth();
  const { params, goBack } = useNavigation();
  const insets = useSafeAreaInsets();
  const [count, setCount] = useState('1');
  const voucherId = typeof params?.voucherId === 'string' ? params.voucherId : '';
  const allowed = canReadVouchers(session);
  const query = useQuery({
    queryKey: ['stock-voucher', session?.id, voucherId], queryFn: ({ signal }) => getStockVoucher(voucherId, signal),
    enabled: allowed && !!voucherId, staleTime: 0, refetchInterval: 15_000, retry: false,
  });
  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const data = allowed && !denied && query.data?.id === voucherId ? query.data : undefined;
  const inbound = data?.type === 'INBOUND';
  const steps = inbound ? ['Barcodes', 'Contents', 'Confirm'] : ['Containers', 'Review', 'Confirm'];
  // Codes on existing server records are real; product quantities are not available in this contract.
  const currentStep = data?.lines.length ? 1 : 0;

  return <View style={styles.screen}>
    <ScreenHeader title={data ? inbound ? 'Inbound Voucher' : 'Outbound Voucher' : 'Voucher Details'} subtitle={data?.code} canGoBack onBack={goBack}
      rightAction={data ? <StatusPill status={data.status} /> : undefined} />
    {!allowed || !voucherId ? <EmptyState title={!allowed ? 'Voucher Access Unavailable' : 'No Voucher Selected'} />
      : !data ? query.isPending ? <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text variant="body">Loading Voucher…</Text></View>
        : <EmptyState icon={FileText} title="Voucher Unavailable" message={getUserErrorMessage(query.error, 'This voucher could not be loaded.')} actionTitle="Retry" onAction={() => { void query.refetch(); }} />
        : <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.primary} />}>
          {query.isError && <View style={styles.error}><Text variant="caption" color="dangerText">Could not refresh. Showing the last loaded voucher.</Text><Button title="Retry" variant="outline" size="sm" onPress={() => { void query.refetch(); }} /></View>}
          <Card gap={16}>
            <View style={styles.between}><View style={styles.row}><FileText size={20} color={colors.textSecondary} /><Text variant="headline" selectable>{data.code}</Text></View></View>
            <View style={styles.stat}><Text variant="title">{data.containerCount}</Text><Text variant="body" color="textSecondary">{data.containerCount === 1 ? 'container' : 'containers'}</Text></View>
            <View style={styles.row}><MapPin size={16} color={colors.textMuted} /><Text variant="bodyMedium" style={{ flex: 1 }}>{data.warehouseName || data.warehouseCode || 'Warehouse not reported'}</Text></View>
            <Text variant="caption" color="textSecondary">Created {voucherDate(data.createdAt)}</Text>
            {!!data.referenceNo && <View style={styles.flex}><Text variant="caption">Reference</Text><Text variant="body" selectable>{data.referenceNo}</Text></View>}
            {!!data.note && <Text variant="body" color="textSecondary">{data.note}</Text>}
            {!!data.confirmedAt && <Text variant="caption">Confirmed {voucherDate(data.confirmedAt)}</Text>}
            {data.status === 'CONFIRMED' && <Text variant="caption" color="textSecondary">Stock posting status is unavailable.</Text>}
            {!!data.cancelledAt && <Text variant="caption">Cancelled {voucherDate(data.cancelledAt)}</Text>}
          </Card>

          {data.status === 'DRAFT' && <>
            <View style={styles.stepTrack}>{steps.map((label, index) => <React.Fragment key={label}>
              {!!index && <View style={styles.stepLine} />}
              <View style={styles.step}><View style={[styles.stepNumber, index <= currentStep && styles.stepCurrent]}>
                {index < currentStep ? <Check size={15} color={colors.primaryText} /> : <Text variant="caption" color={index === currentStep ? 'primaryText' : 'textMuted'}>{index + 1}</Text>}
              </View><Text variant="caption" color={index === currentStep ? 'textPrimary' : 'textMuted'}>{label}</Text></View>
            </React.Fragment>)}</View>
            {!data.lines.length ? <Card gap={16}>
              <View style={styles.row}>{inbound ? <Barcode size={22} color={colors.primaryText} /> : <Box size={22} color={colors.warningText} />}<Text variant="headline">{inbound ? 'Prepare Containers' : 'Select Staged Containers'}</Text></View>
              <Text variant="body" color="textSecondary">{inbound ? 'Each container receives a unique barcode before you enter its product and quantity.' : 'Choose the containers for this voucher. All must already be at Outbound.'}</Text>
              {inbound && <TextField label="New Containers" value={count} onChangeText={setCount} keyboardType="number-pad" maxLength={4} accessibilityLabel="Number of new containers" />}
              <Button title={inbound ? 'Generate Barcodes' : 'Select Containers'} disabled onPress={() => {}} />
              <Text variant="caption" color="textSecondary">{inbound ? 'Barcode generation is not available yet.' : 'Selection of containers at Outbound is not available yet.'}</Text>
            </Card> : null}
          </>}

          {!!data.lines.length && <Card gap={8}>
            <Text variant="headline">Containers</Text>
            {data.lines.map(line => <View key={line.id} style={styles.containerRow}>
              <View style={styles.between}><Text variant="code" selectable style={{ flex: 1 }}>{line.containerBarcode}</Text><StatusPill status={line.containerStatus} /></View>
              <Text variant="bodyMedium">{line.productName}</Text><Text variant="caption" color="textSecondary">{line.productSku}</Text>
              <Text variant="caption" color="textSecondary">{line.currentStorageLocationCode || 'Location not reported'}{line.currentLevelNo != null ? ` · Level ${line.currentLevelNo}` : ''}</Text>
              {data.status === 'DRAFT' && inbound && <Text variant="caption" color="textMuted">Contents quantity not recorded</Text>}
            </View>)}
          </Card>}
          {data.status === 'DRAFT' && !!data.lines.length && <Card gap={12}>
            <Text variant="headline">Confirmation</Text>
            <Text variant="body" color="textSecondary">{inbound ? 'Confirm after every container is ready at Inbound.' : 'Confirm after every selected container is at Outbound.'}</Text>
            <Button title={inbound ? 'Confirm Inbound Voucher' : 'Confirm Outbound Voucher'} disabled onPress={() => {}} />
            <Text variant="caption" color="textSecondary">Confirmation is not available yet. Saving a draft does not change stock.</Text>
          </Card>}
        </ScrollView>}
  </View>;
}
