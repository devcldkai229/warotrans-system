import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  ArrowUpRight,
  Box,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPin,
  PackageCheck,
  Printer,
  QrCode,
  ScanLine,
  Truck,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { getJobDetail, listJobSummaries } from '../../shared/api/executionApi';
import { getOperatingContext } from '../../shared/api/operatingContextApi';
import {
  getContainer,
  getContainerByBarcode,
  listContainers,
  listStorageLocations,
  recoverContainer,
} from '../../shared/api/warehouseApi';
import { toast } from '../../shared/context/ToastContext';
import { t } from '../../shared/i18n';
import { usePlaceDirectory } from '../../shared/places/usePlaceDirectory';
import { Code128View, QrCodeView } from '../../shared/scan/CodeViews';
import { containerLabels, printLabels } from '../../shared/scan/printLabels';
import { qrPayload } from '../../shared/scan/scanCodes';
import { Scanner } from '../../shared/scan/Scanner';
import { containerTasks, type ContainerTask } from '../../shared/scan/scanRouter';
import type { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import type { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, ScreenHeader, StatusPill, Text } from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { InspectionSheet } from '../scan/ScanScreen';
import {
  canMoveContainer,
  canRecoverContainer,
  formatContainerLocation,
  matchesRecordedShelf,
} from './containerDetailData';
import { voucherDate } from './stockVoucherData';

export function ContainerDetailScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { params, goBack, navigate, replace } = useNavigation();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const places = usePlaceDirectory();

  const containerId = typeof params?.containerId === 'string' ? params.containerId.trim() : '';
  const paramBarcode = typeof params?.barcode === 'string'
    ? params.barcode.trim()
    : typeof params?.container === 'string'
      ? params.container.trim()
      : '';
  const allowed = sessionCan(session, PERMISSIONS.warehouseRead);

  const [showCode, setShowCode] = useState(false);
  const [shelfScan, setShelfScan] = useState(false);
  const [shelfCheck, setShelfCheck] = useState<{ scanned: string; ok: boolean } | null>(null);
  const [showRecoverPicker, setShowRecoverPicker] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<ContainerTask | null>(null);

  const query = useQuery({
    queryKey: ['container-detail', session?.id, containerId, paramBarcode],
    queryFn: () => (paramBarcode ? getContainerByBarcode(paramBarcode) : getContainer(containerId)),
    enabled: allowed && Boolean(paramBarcode || containerId),
    staleTime: 0,
    refetchInterval: 15_000,
    retry: false,
  });

  const denied = query.error instanceof ApiError && [401, 403].includes(query.error.status);
  const rawContainer = allowed && !denied ? query.data : undefined;

  const contextQuery = useQuery({
    queryKey: ['container-detail-context', session?.id, rawContainer?.id, rawContainer?.barcode],
    enabled: allowed && !!rawContainer,
    staleTime: 10_000,
    retry: false,
    queryFn: async () => {
      const current = rawContainer!;
      const [operating, runningJobs] = await Promise.all([
        getOperatingContext().catch(() => null),
        listJobSummaries({ status: 'RUNNING', take: 50 })
          .then(page => Promise.all(page.items.map(item => getJobDetail(item.id))))
          .catch(() => []),
      ]);
      const warehouseId = operating?.warehouse.id || '';
      const listHit = warehouseId
        ? await listContainers({ warehouseId, search: current.barcode, eligibleOnly: false, take: 10 })
            .then(page => page.items.find(
              item => item.id === current.id || item.barcode.toUpperCase() === current.barcode.toUpperCase(),
            ) ?? null)
            .catch(() => null)
        : null;
      return {
        warehouseId,
        voucher: listHit?.voucher ?? null,
        inActiveTransport: listHit?.inActiveTransport ?? false,
        listEndpointId: listHit?.currentEndpointId ?? null,
        listEndpointCode: listHit?.currentEndpointCode ?? null,
        tasks: containerTasks(runningJobs, current.id),
      };
    },
  });

  const container = useMemo(() => {
    if (!rawContainer) return undefined;
    const ctx = contextQuery.data;
    return {
      ...rawContainer,
      currentEndpointId: rawContainer.currentEndpointId ?? ctx?.listEndpointId ?? null,
      currentEndpointCode: rawContainer.currentEndpointCode ?? ctx?.listEndpointCode ?? null,
      voucher: rawContainer.voucher ?? ctx?.voucher ?? null,
      inActiveTransport: rawContainer.inActiveTransport ?? ctx?.inActiveTransport ?? false,
    };
  }, [rawContainer, contextQuery.data]);

  const warehouseId = contextQuery.data?.warehouseId ?? '';
  const tasks = contextQuery.data?.tasks ?? [];
  const canRecover = !!container && canRecoverContainer(container, sessionCan(session, PERMISSIONS.containerRecover));
  const canMove = !!container && canMoveContainer(container, sessionCan(session, PERMISSIONS.transportCreate));

  const recoverLocationsQuery = useQuery({
    queryKey: ['recover-locations', warehouseId],
    queryFn: () => listStorageLocations({ warehouseId, activeOnly: true }),
    enabled: Boolean(warehouseId) && canRecover,
  });

  const locationInfo = useMemo(
    () => (container ? formatContainerLocation(container, places) : null),
    [container, places],
  );

  const handlePrint = async () => {
    if (!container) return;
    try {
      await printLabels(
        containerLabels([container.barcode], container.productName, container.productSku),
        container.barcode,
      );
    } catch {
      toast.error(t('Could not open the print dialog.'));
    }
  };

  const handleRecover = async (storageLocationId: string) => {
    if (!container || recovering) return;
    setRecovering(true);
    setRecoverError(null);
    try {
      await recoverContainer(container.id, { storageLocationId, levelNo: 1 });
      triggerHaptic('success');
      toast.success(t('Container location updated.'));
      setShowRecoverPicker(false);
      void client.invalidateQueries({ queryKey: ['inventory-containers'] });
      void client.invalidateQueries({ queryKey: ['inventory-stock'] });
      await Promise.all([query.refetch(), contextQuery.refetch()]);
    } catch (failure) {
      triggerHaptic('error');
      setRecoverError(getUserErrorMessage(failure, 'The container could not be recovered.'));
    } finally {
      setRecovering(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Container Details"
        subtitle={container?.barcode || paramBarcode || undefined}
        canGoBack
        onBack={goBack}
        rightAction={container ? <StatusPill status={container.status} /> : undefined}
      />

      {!allowed || (!paramBarcode && !containerId) ? (
        <EmptyState
          icon={Box}
          title={!allowed ? 'Container Access Unavailable' : 'No Container Selected'}
        />
      ) : !container ? (
        query.isPending ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
            <Text variant="body">Loading Container…</Text>
          </View>
        ) : (
          <EmptyState
            icon={Box}
            title="Container Unavailable"
            message={getUserErrorMessage(query.error, 'This container could not be loaded.')}
            actionTitle="Retry"
            onAction={() => { void query.refetch(); }}
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching || contextQuery.isRefetching}
              onRefresh={() => {
                void query.refetch();
                void contextQuery.refetch();
              }}
              tintColor={colors.primary}
            />
          }
        >
          {query.isError ? (
            <View style={styles.errorBanner}>
              <Text variant="caption" color="dangerText">
                Could not refresh. Showing the last loaded container.
              </Text>
              <Button title="Retry" variant="outline" size="sm" onPress={() => { void query.refetch(); }} />
            </View>
          ) : null}

          <Card gap={12}>
            <View style={styles.headRow}>
              <View style={styles.iconBox}>
                <Box size={22} color={colors.primaryText} />
              </View>
              <View style={styles.flexCol}>
                <Text variant="code" selectable style={styles.barcodeText}>
                  {container.barcode}
                </Text>
                <Text variant="bodyMedium" numberOfLines={2}>
                  {container.productName}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {container.productSku}
                </Text>
              </View>
            </View>

            {container.inActiveTransport ? (
              <View style={styles.noticeWell}>
                <Truck size={16} color={colors.infoText} />
                <Text variant="caption" color="infoText" style={{ flex: 1 }}>
                  In Active Transport
                </Text>
              </View>
            ) : null}

            <View style={styles.metaList}>
              <View style={styles.metaRow}>
                <Text variant="caption" color="textSecondary">Contents Quantity</Text>
                <Text variant="bodyMedium" fontWeight="600" style={styles.tabular}>
                  {container.contentsQuantity != null ? String(container.contentsQuantity) : t('Quantity not set')}
                </Text>
              </View>
              <View style={styles.metaRow}>
                <Text variant="caption" color="textSecondary">Supplier Package</Text>
                <Text variant="bodyMedium" selectable={!!container.supplierPackageBarcode} style={styles.metaValue}>
                  {container.supplierPackageBarcode || '—'}
                </Text>
              </View>
              {container.createdAt ? (
                <View style={styles.metaRow}>
                  <Text variant="caption" color="textSecondary">Created</Text>
                  <Text variant="caption" style={styles.metaValue}>{voucherDate(container.createdAt)}</Text>
                </View>
              ) : null}
              {container.updatedAt ? (
                <View style={[styles.metaRow, styles.metaRowLast]}>
                  <Text variant="caption" color="textSecondary">Last Updated</Text>
                  <Text variant="caption" style={styles.metaValue}>{voucherDate(container.updatedAt)}</Text>
                </View>
              ) : null}
            </View>
          </Card>

          <Card gap={12}>
            <View style={styles.between}>
              <Text variant="headline">Location</Text>
              <Button
                title="Check shelf"
                icon={ScanLine}
                variant="outline"
                size="sm"
                onPress={() => {
                  triggerHaptic('tap');
                  setShelfCheck(null);
                  setShelfScan(true);
                }}
              />
            </View>

            <View style={styles.locationWell}>
              <MapPin size={18} color={colors.primaryText} />
              <View style={styles.flexCol}>
                <Text variant="bodyMedium" fontWeight="600">
                  {locationInfo?.primary}
                </Text>
                {locationInfo?.shelfCode && locationInfo.shelfCode !== locationInfo.primary ? (
                  <Text variant="caption" color="textSecondary" mono>
                    {locationInfo.shelfCode}
                  </Text>
                ) : null}
                {locationInfo?.areas.length ? (
                  <Text variant="caption" color="textSecondary">
                    {locationInfo.areas.map(area => area.name).join(' · ')}
                  </Text>
                ) : null}
              </View>
            </View>

            {shelfCheck ? (
              <View style={[styles.checkBanner, shelfCheck.ok ? styles.checkOk : styles.checkBad]}>
                {shelfCheck.ok
                  ? <CheckCircle2 size={16} color={colors.successText} />
                  : <AlertTriangle size={16} color={colors.dangerText} />}
                <Text
                  variant="caption"
                  color={shelfCheck.ok ? 'successText' : 'dangerText'}
                  style={{ flex: 1 }}
                >
                  {shelfCheck.ok
                    ? t('Matches {shelf}', { shelf: shelfCheck.scanned })
                    : t('Scanned {scanned}, recorded {recorded}', {
                        scanned: shelfCheck.scanned,
                        recorded: container.currentStorageLocationCode || t('Not on a shelf'),
                      })}
                </Text>
              </View>
            ) : null}
          </Card>

          {container.voucher ? (
            <Card gap={10}>
              <View style={styles.between}>
                <Text variant="headline">Stock Voucher</Text>
                <StatusPill status={container.voucher.status} size="sm" />
              </View>
              <View style={styles.flexCol}>
                <Text variant="code" selectable>{container.voucher.code}</Text>
                <Text variant="caption" color="textSecondary">
                  {container.voucher.type === 'INBOUND' ? t('Inbound Voucher') : t('Outbound Voucher')}
                  {` · ${t('Created {date}', { date: voucherDate(container.voucher.createdAt) })}`}
                </Text>
              </View>
              <Button
                title="Open Voucher"
                icon={FileText}
                variant="outline"
                size="sm"
                onPress={() => navigate('stock_voucher_detail', { voucherId: container.voucher!.id })}
              />
            </Card>
          ) : null}

          <Card gap={10}>
            <View style={styles.between}>
              <Text variant="headline">Label & QR Code</Text>
              <Button
                title={showCode ? 'Hide Label Code' : 'Show Label Code'}
                icon={QrCode}
                variant="ghost"
                size="sm"
                onPress={() => setShowCode(value => !value)}
              />
            </View>
            {showCode ? (
              <View style={styles.labelPreview}>
                <QrCodeView value={qrPayload('CONTAINER', container.barcode)} size={168} />
                <Code128View value={container.barcode} width={250} height={50} />
                <Text variant="code" selectable>{container.barcode}</Text>
                <Button
                  title="Print Label"
                  icon={Printer}
                  variant="outline"
                  size="sm"
                  onPress={() => { void handlePrint(); }}
                />
              </View>
            ) : null}
          </Card>

          {canRecover ? (
            <Card gap={10}>
              <Text variant="headline">Recover Container</Text>
              <Text variant="caption" color="textSecondary">
                This container lost its place. Which shelf is it on now? (level 1)
              </Text>
              {recoverError ? (
                <Text variant="caption" color="dangerText" accessibilityRole="alert">
                  {recoverError}
                </Text>
              ) : null}
              {!showRecoverPicker ? (
                <Button
                  title="Choose Current Shelf"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setRecoverError(null);
                    setShowRecoverPicker(true);
                  }}
                />
              ) : (
                <View style={styles.recoverList}>
                  {recoverLocationsQuery.isPending ? <ActivityIndicator color={colors.primary} /> : null}
                  {(recoverLocationsQuery.data?.items ?? [])
                    .filter(location => location.isActive)
                    .map(location => (
                      <Button
                        key={location.id}
                        title={`${location.code} · ${location.name}`}
                        variant="secondary"
                        size="sm"
                        disabled={recovering}
                        loading={recovering}
                        onPress={() => { void handleRecover(location.id); }}
                      />
                    ))}
                </View>
              )}
            </Card>
          ) : null}

          <Card gap={10}>
            <Text variant="headline">Actions</Text>
            {tasks.map(task => (
              task.operation === 'INSPECTION_CONFIRM' ? (
                <Button
                  key={task.stepId}
                  title={t('Inspect ({job})', { job: task.jobNo })}
                  icon={ClipboardCheck}
                  fullWidth
                  onPress={() => setInspect(task)}
                />
              ) : (
                <Button
                  key={task.stepId}
                  title={
                    task.operation === 'PICKUP_CONFIRM'
                      ? t('Confirm loading ({job})', { job: task.jobNo })
                      : t('Confirm unloading ({job})', { job: task.jobNo })
                  }
                  icon={task.operation === 'PICKUP_CONFIRM' ? Truck : PackageCheck}
                  fullWidth
                  onPress={() => navigate('job_detail', { jobId: task.jobId, modal: 'verify' })}
                />
              )
            ))}
            {canMove ? (
              <Button
                title="Move To Another Shelf"
                icon={ArrowUpRight}
                variant={tasks.length ? 'outline' : 'primary'}
                fullWidth
                onPress={() => navigate('transport_create', {
                  workflow: 'INTERNAL_RELOCATION',
                  containers: [container.barcode],
                })}
              />
            ) : null}
            {!tasks.length ? (
              <Text variant="caption" color="textSecondary">
                No job is waiting for this container right now.
              </Text>
            ) : null}
            <Button
              title="Scan Another Code"
              icon={ScanLine}
              variant="outline"
              fullWidth
              onPress={() => replace('scanner')}
            />
          </Card>
        </ScrollView>
      )}

      {container ? (
        <Scanner
          visible={shelfScan}
          expect={['LOCATION']}
          title="Scan the shelf label"
          manualLabel="Shelf code"
          placeholder="Scan or type the shelf code"
          onClose={() => setShelfScan(false)}
          onScanResult={(_raw, scanned) => {
            setShelfScan(false);
            const result = matchesRecordedShelf(
              container.currentStorageLocationCode,
              scanned.code,
              places.locations,
            );
            triggerHaptic(result.ok ? 'success' : 'error');
            setShelfCheck({ scanned: result.scannedLabel, ok: result.ok });
          }}
        />
      ) : null}

      {inspect && container ? (
        <InspectionSheet
          task={inspect}
          container={container}
          onClose={() => setInspect(null)}
          onDone={() => {
            setInspect(null);
            void query.refetch();
            void contextQuery.refetch();
          }}
        />
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, flexGrow: 1 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorBanner: {
    padding: 12,
    gap: 8,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    flexShrink: 0,
  },
  flexCol: { flex: 1, minWidth: 0, gap: 2 },
  barcodeText: { fontSize: 16, fontWeight: '700' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  noticeWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.infoBorder,
  },
  metaList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  metaRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  metaValue: { flexShrink: 1, textAlign: 'right' },
  tabular: { fontVariant: ['tabular-nums'] },
  locationWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSubtle,
  },
  checkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  checkOk: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  checkBad: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  labelPreview: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  recoverList: { gap: 8 },
});
