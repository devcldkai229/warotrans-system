import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { Scanner } from '../../shared/scan/Scanner';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Layers,
  Barcode,
  Box,
  CheckCircle2,
  MapPin,
  PackagePlus,
  ScanLine,
  Search,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { RawText as Text, Text as StatusText } from '../../shared/ui/Text';
import { containerLocationFilters, getContainerLocation, groupInventoryByProduct, summarizeWarehouseStock } from './inventoryData';
import { usePlaceDirectory } from '../../shared/places/usePlaceDirectory';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { t } from '../../shared/i18n';
import { ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { ThemeShadows } from '../../shared/theme/shadows';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  ContainerListItem,
  getContainerByBarcode,
  listStorageLocations,
  recoverContainer,
  listContainers,
  listInventory,
  ApiError,
  getOperatingContext,
} from '../../shared/api';

export type LevelFilterKey = 'ALL' | number;

export function InventoryLookupScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { goBack, navigate, params } = useNavigation();
  const { session } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(() => (typeof params?.search === 'string' ? params.search : ''));
  const [shelfScan, setShelfScan] = useState(false);
  const [shelfCheck, setShelfCheck] = useState<{ scanned: string; ok: boolean } | null>(null);
  const [inventoryTab, setInventoryTab] = useState<'containers' | 'skus'>('containers');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState<LevelFilterKey>('ALL');
  const [filterSheet, setFilterSheet] = useState<'location' | 'level' | null>(null);
  const places = usePlaceDirectory();
  const shelfName = (code: string) => places.locations.find(location => location.code === code)?.name ?? code;
  const [verifiedContainer, setVerifiedContainer] = useState<ContainerListItem | null>(null);
  const [isVerifyingBarcode, setIsVerifyingBarcode] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [serverSearch, setServerSearch] = useState('');
  const verificationRequest = useRef(0);
  const operatingQuery = useQuery({
    queryKey: ['operating-context'],
    queryFn: () => getOperatingContext(),
    refetchInterval: 30_000,
  });
  const activeWarehouseId = operatingQuery.data?.warehouse.id || '';
  const containersQuery = useQuery({
    queryKey: ['inventory-containers', activeWarehouseId, serverSearch],
    queryFn: () => listContainers({ warehouseId: activeWarehouseId, search: serverSearch || undefined, eligibleOnly: false, take: 500 }),
    enabled: Boolean(activeWarehouseId),
  });
  const inventoryQuery = useInfiniteQuery({
    queryKey: ['inventory-stock', activeWarehouseId, serverSearch],
    queryFn: ({ pageParam }) => listInventory({ warehouseId: activeWarehouseId, search: serverSearch || undefined, skip: pageParam, take: 200 }),
    initialPageParam: 0,
    getNextPageParam: (page, pages) => {
      const loaded = pages.reduce((count, item) => count + item.items.length, 0);
      return page.items.length > 0 && loaded < page.total ? loaded : undefined;
    },
    enabled: Boolean(activeWarehouseId),
  });
  const recoverLocations = useQuery({
    queryKey: ['recover-locations', activeWarehouseId],
    queryFn: () => listStorageLocations({ warehouseId: activeWarehouseId, activeOnly: true }),
    enabled: Boolean(activeWarehouseId) && (verifiedContainer?.status === 'IN_TRANSIT' || verifiedContainer?.status === 'HOLD'),
  });
  const containers = containersQuery.data?.items || [];
  const containerTotal = containersQuery.data?.total || 0;
  const stockRows = inventoryQuery.data?.pages.flatMap(page => page.items) || [];
  const stockTotal = inventoryQuery.data?.pages[0]?.total || 0;
  const stockSummary = summarizeWarehouseStock(inventoryQuery.data?.pages[0]);
  const catalogProducts = useMemo(() => groupInventoryByProduct(inventoryQuery.data?.pages.flatMap(page => page.items) || []), [inventoryQuery.data]);
  const levelOptions: { value: LevelFilterKey; label: string }[] = [
    { value: 'ALL', label: 'All Levels' },
    ...[...new Set(containers.flatMap(container => container.currentLevelNo == null ? [] : [container.currentLevelNo]))]
      .sort((a, b) => a - b).map(value => ({ value, label: `Level ${value}` })),
  ];
  const activeQuery = inventoryTab === 'containers' ? containersQuery : inventoryQuery;
  const loading = operatingQuery.isPending || (Boolean(activeWarehouseId) && activeQuery.isPending);
  const loadError = operatingQuery.error || (activeWarehouseId ? activeQuery.error : null);

  useEffect(() => {
    const timer = setTimeout(() => setServerSearch(searchTerm.trim().slice(0, 100)), 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);
  useEffect(() => {
    verificationRequest.current++;
    setVerifiedContainer(null);
    setVerificationError(null);
    setSelectedLocation(typeof params?.locationId === 'string' ? `storage:${params.locationId}` : 'ALL');
    setSelectedLevel('ALL');
    setIsVerifyingBarcode(false);
    return () => { verificationRequest.current++; };
  }, [activeWarehouseId]);

  const handleVerifyBarcode = async (codeToVerify?: string) => {
    const raw = (codeToVerify ?? searchTerm).trim();
    if (!raw) {
      setVerificationError('Enter a container barcode to verify.');
      return;
    }

    if (isVerifyingBarcode) return;
    triggerHaptic('tap');
    setVerifiedContainer(null);
    setVerificationError(null);
    setIsVerifyingBarcode(true);
    const request = ++verificationRequest.current;
    try {
      const res = await getContainerByBarcode(raw);
      if (request !== verificationRequest.current) return;
      if (res && res.barcode) {
        setVerifiedContainer(res);
        triggerHaptic('success');
        toast.success(`Container ${res.barcode} verified with backend!`);
        return;
      }
      throw new Error('Not found in by-barcode');
    } catch (error) {
      if (request !== verificationRequest.current) return;
      setVerificationError(error instanceof ApiError && error.status === 404
        ? `Container "${raw}" was not found in the registry.`
        : error instanceof Error ? error.message : 'Container could not be verified. Try again.');
    } finally {
      if (request === verificationRequest.current) setIsVerifyingBarcode(false);
    }
  };

  const stagedOutboundCount = !serverSearch && containersQuery.isSuccess && containers.length === containerTotal
    ? containers.filter(item => item.status === 'STAGED_OUTBOUND').length
    : 0;
  const endpointLabel = (endpointId: string, fallbackCode?: string | null, status?: string) =>
    places.endpoints.find(ep => ep.id === endpointId)?.name ?? fallbackCode ?? (status === 'STAGED_OUTBOUND' ? t('Outbound Gate') : t('At Station'));
  const locationOptions = useMemo(() => containerLocationFilters(containers), [containers]);
  const locationLabel = (key: string) => {
    if (key === 'ALL') return t('All locations');
    if (key === 'UNLOCATED') return t('Not on a shelf');
    if (key.startsWith('endpoint:')) {
      const endpointId = key.slice('endpoint:'.length);
      return endpointLabel(endpointId, locationOptions.find(option => option.key === key)?.label);
    }
    return shelfName(locationOptions.find(option => option.key === key)?.label ?? key);
  };
  const uniqueLocationsCount = locationOptions.filter(location => location.key !== 'ALL' && location.key !== 'UNLOCATED').length;
  const activeLocationFilter = locationOptions.some(location => location.key === selectedLocation) ? selectedLocation : 'ALL';

  const filteredContainers = useMemo(() => {
    return containers.filter((c) => {
      if (activeLocationFilter !== 'ALL' && getContainerLocation(c).key !== activeLocationFilter) return false;

      if (selectedLevel !== 'ALL') {
        if (c.currentLevelNo !== selectedLevel) return false;
      }

      return true;
    });
  }, [containers, activeLocationFilter, selectedLevel]);

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label={activeWarehouseId
          ? (stockSummary
            ? t('{total} in stock · {locations} locations', { total: stockSummary.totalContainers, locations: uniqueLocationsCount })
            : `${containers.length} Containers Loaded · ${uniqueLocationsCount} Locations`)
          : 'Loading Inventory…'}
        title="Find Containers & Stock"
        onBack={goBack}
      />

      {/* Tầng 1: Single Compact Search & Barcode Scan Section */}
      <View style={styles.searchSection}>
        <Input
          accessibilityLabel="Search inventory"
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={() => handleVerifyBarcode()}
          placeholder={inventoryTab === 'containers' ? 'Search container or SKU...' : 'Search product, SKU, or location...'}
          maxLength={100}
          containerStyle={styles.inputContainer}
          leftIcon={<Search size={16} color={colors.textMuted} />}
          rightIcon={
            <View style={styles.searchRightIcons}>
              {searchTerm ? (
                <Pressable
                  onPress={() => setSearchTerm('')}
                  style={styles.clearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <X size={15} color={colors.textMuted} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  triggerHaptic('tap');
                  setScannerOpen(true);
                }}
                style={styles.scannerBtn}
                accessibilityRole="button"
                accessibilityLabel="Open barcode scanner"
              >
                <Barcode size={18} color={colors.primary} />
              </Pressable>
            </View>
          }
        />
      </View>

      {isVerifyingBarcode && <StatusText variant="caption" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>Verifying Container…</StatusText>}
      {verificationError && <StatusText variant="body" color="danger" accessibilityRole="alert" style={{ paddingHorizontal: 16, paddingVertical: 8 }}>{verificationError}</StatusText>}
      {loading && <ActivityIndicator color={colors.primary} style={{ padding: 16 }} />}
      {loadError && (
        <View style={{ padding: 16, gap: 8 }}>
          <StatusText color="danger" accessibilityRole="alert">{loadError.message}</StatusText>
          <Button label="Retry" variant="outline" onPress={() => { void operatingQuery.refetch(); if (activeWarehouseId) void activeQuery.refetch(); }} />
        </View>
      )}
      {Boolean(activeWarehouseId) && inventoryTab === 'containers' && containerTotal > containers.length && (
        <StatusText variant="caption" style={{ padding: 16 }}>Showing {containers.length} of {containerTotal} matching containers. Narrow the search to find other containers.</StatusText>
      )}
      {/* Prominent Verified Container Details Card (if verified) */}
      {verifiedContainer && (
        <View style={styles.verifiedCard}>
          <View style={styles.shelfCheckRow}>
            <Pressable onPress={() => { triggerHaptic('tap'); setShelfCheck(null); setShelfScan(true); }} style={({ pressed }) => [styles.shelfCheckBtn, pressed && styles.btnPressed]}
              accessibilityRole="button" accessibilityLabel="Scan the shelf to compare">
              <ScanLine size={14} color={colors.primaryText} />
              <Text style={styles.shelfCheckText}>{t('Check shelf')}</Text>
            </Pressable>
            {shelfCheck ? <Text style={[styles.shelfCheckResult, { color: shelfCheck.ok ? '#059669' : colors.danger }]} numberOfLines={2}>
              {shelfCheck.ok ? t('Matches {shelf}', { shelf: shelfName(shelfCheck.scanned) })
                : t('Scanned {scanned}, recorded {recorded}', { scanned: shelfName(shelfCheck.scanned), recorded: verifiedContainer.currentStorageLocationCode ? shelfName(verifiedContainer.currentStorageLocationCode) : t('Not on a shelf') })}
            </Text> : null}
          </View>
          <View style={styles.verifiedCardHeader}>
            <View style={styles.verifiedBadgeRow}>
              <CheckCircle2 size={18} color="#059669" />
              <Text style={styles.verifiedTitle}>Verified Container Details</Text>
            </View>
            <View style={styles.verifiedStatusBadge}>
              <Text style={styles.verifiedStatusText}>
                {verifiedContainer.status || 'Status Unavailable'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setVerifiedContainer(null);
              }}
              style={styles.verifiedCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Dismiss verified card"
            >
              <X size={15} color="#059669" />
            </Pressable>
          </View>

          <View style={styles.verifiedBody}>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Container Barcode:</Text>
              <Text style={styles.verifiedValueMono}>{verifiedContainer.barcode}</Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Product / SKU:</Text>
              <Text style={styles.verifiedValue} numberOfLines={1}>
                {verifiedContainer.productName} ({verifiedContainer.productSku})
              </Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Current Location:</Text>
              <Text style={styles.verifiedValue}>
                {verifiedContainer.currentStorageLocationCode
                  ? `${verifiedContainer.currentStorageLocationCode}${
                      verifiedContainer.currentLevelNo ? ` · Level ${verifiedContainer.currentLevelNo}` : ''
                    }`
                  : verifiedContainer.currentEndpointCode || 'Location Unavailable'}
              </Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Inventory Status:</Text>
              <Text style={styles.verifiedValue}>
                {verifiedContainer.status || 'Status Unavailable'} · 1 container
              </Text>
            </View>
          </View>

          {(verifiedContainer.status === 'IN_TRANSIT' || verifiedContainer.status === 'HOLD')
            && sessionCan(session, PERMISSIONS.containerRecover) ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              <Text style={styles.verifiedLabel}>This container lost its place. Which shelf is it on now? (level 1)</Text>
              {(recoverLocations.data?.items ?? []).filter(location => location.isActive).map(location => (
                <Button
                  key={location.id}
                  label={`${location.code} · ${location.name}`}
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    triggerHaptic('tap');
                    recoverContainer(verifiedContainer.id, { storageLocationId: location.id, levelNo: 1 })
                      .then(() => {
                        setVerifiedContainer(null);
                        void containersQuery.refetch();
                        void inventoryQuery.refetch();
                      })
                      .catch((error: Error) => setVerificationError(error.message));
                  }}
                />
              ))}
            </View>
          ) : null}

          {verifiedContainer.status === 'STORED' && verifiedContainer.currentStorageLocationId ? <Button
            label="↗ Move To Another Shelf"
            icon={<ArrowUpRight size={14} color="#ffffff" />}
            variant="primary"
            size="sm"
            onPress={() => {
              triggerHaptic('tap');
              navigate('transport_create', { workflow: 'INTERNAL_RELOCATION', containers: [verifiedContainer.barcode] });
            }}
            style={{ marginTop: 8 }}
          /> : null}
        </View>
      )}

      {Boolean(activeWarehouseId) && stockSummary && (
        <View style={styles.stockSummaryCard}>
          <View style={styles.stockSummaryBar}>
            <View style={styles.stockMetric}>
              <StatusText variant="headline" fontWeight="700" style={styles.tabularValue}>{stockSummary.totalContainers}</StatusText>
              <StatusText variant="caption" color="textSecondary">Total Stock</StatusText>
            </View>
            <View style={styles.stockMetricDivider} />
            <View style={styles.stockMetric}>
              <StatusText variant="headline" fontWeight="700" style={styles.tabularValue}>{stockSummary.allocatedContainers}</StatusText>
              <StatusText variant="caption" color="textSecondary">Shelved / Staged</StatusText>
            </View>
            <View style={styles.stockMetricDivider} />
            <View style={styles.stockMetric}>
              <StatusText variant="headline" fontWeight="700" color={stockSummary.unallocatedContainers > 0 ? 'primaryText' : 'textPrimary'} style={styles.tabularValue}>
                {stockSummary.unallocatedContainers}
              </StatusText>
              <StatusText variant="caption" color={stockSummary.unallocatedContainers > 0 ? 'primaryText' : 'textSecondary'}>Awaiting Putaway</StatusText>
            </View>
          </View>
          {stagedOutboundCount > 0 && (
            <StatusText variant="caption" color="primaryText" style={styles.stockSubNote}>
              {t('{count} staged at Outbound gate', { count: stagedOutboundCount })}
            </StatusText>
          )}
        </View>
      )}

      {/* Tầng 2: Segmented Control Tabs (directly below the search box) */}
      <View style={styles.tabsWrapper}>
        <SegmentedControl
          options={[
            { label: `Containers (${filteredContainers.length})`, value: 'containers' },
            { label: `By SKU (${catalogProducts.length})`, value: 'skus' },
          ]}
          value={inventoryTab}
          onChange={(val) => {
            triggerHaptic('tap');
            setInventoryTab(val as 'containers' | 'skus');
          }}
          size="md"
        />
      </View>

      {/* Tab 1: Containers List */}
      {inventoryTab === 'containers' && Boolean(activeWarehouseId) && (
        <>
          {/* One quiet filter bar: where (shelf) and which level, each a pill that opens its options. */}
          <View style={styles.filterBar}>
            <Pressable onPress={() => { triggerHaptic('tap'); setFilterSheet('location'); }}
              style={({ pressed }) => [styles.filterPill, activeLocationFilter !== 'ALL' && styles.filterPillActive, pressed && styles.btnPressed]}
              accessibilityRole="button" accessibilityLabel="Filter by location">
              <MapPin size={14} color={activeLocationFilter !== 'ALL' ? colors.primaryText : colors.textSecondary} />
              <Text style={[styles.filterPillText, activeLocationFilter !== 'ALL' && styles.filterPillTextActive]} numberOfLines={1}>
                {locationLabel(activeLocationFilter)}
              </Text>
              <ChevronDown size={14} color={colors.textMuted} />
            </Pressable>
            {levelOptions.length > 1 ? <Pressable onPress={() => { triggerHaptic('tap'); setFilterSheet('level'); }}
              style={({ pressed }) => [styles.filterPill, selectedLevel !== 'ALL' && styles.filterPillActive, pressed && styles.btnPressed]}
              accessibilityRole="button" accessibilityLabel="Filter by level">
              <Layers size={14} color={selectedLevel !== 'ALL' ? colors.primaryText : colors.textSecondary} />
              <Text style={[styles.filterPillText, selectedLevel !== 'ALL' && styles.filterPillTextActive]} numberOfLines={1}>
                {selectedLevel === 'ALL' ? t('All levels') : t('Level {level}', { level: selectedLevel })}
              </Text>
              <ChevronDown size={14} color={colors.textMuted} />
            </Pressable> : null}
            {activeLocationFilter !== 'ALL' || selectedLevel !== 'ALL' ? <Pressable onPress={() => { setSelectedLocation('ALL'); setSelectedLevel('ALL'); }}
              accessibilityRole="button" accessibilityLabel="Clear filters" style={styles.clearFilters}>
              <Text style={styles.clearFiltersText}>Clear</Text>
            </Pressable> : null}
          </View>
          {filterSheet ? <BottomSheet onClose={() => setFilterSheet(null)} accessibilityLabel={filterSheet === 'location' ? 'Choose a location' : 'Choose a level'}>
            <ScrollView contentContainerStyle={styles.filterSheet}>
              <StatusText variant="title">{filterSheet === 'location' ? 'Where' : 'Level'}</StatusText>
              {(filterSheet === 'location'
                ? locationOptions.map(opt => ({ key: opt.key, label: locationLabel(opt.key), count: opt.count }))
                : levelOptions.map(opt => ({ key: String(opt.value), label: opt.value === 'ALL' ? t('All levels') : t('Level {level}', { level: opt.value }), count: null as number | null }))
              ).map(option => {
                const chosen = filterSheet === 'location' ? activeLocationFilter === option.key : String(selectedLevel) === option.key;
                return <Pressable key={option.key} style={[styles.filterOption, chosen && styles.filterOptionActive]} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
                  onPress={() => {
                    triggerHaptic('tap');
                    if (filterSheet === 'location') setSelectedLocation(option.key);
                    else setSelectedLevel(option.key === 'ALL' ? 'ALL' : Number(option.key) as LevelFilterKey);
                    setFilterSheet(null);
                  }}>
                  <Text style={[styles.filterOptionText, chosen && styles.filterPillTextActive]} numberOfLines={1}>{option.label}</Text>
                  {option.count !== null ? <Text style={styles.filterOptionCount}>{option.count}</Text> : null}
                  {chosen ? <Check size={16} color={colors.primaryText} /> : null}
                </Pressable>;
              })}
            </ScrollView>
          </BottomSheet> : null}

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={containersQuery.isRefetching} onRefresh={() => { void containersQuery.refetch(); void inventoryQuery.refetch(); }} tintColor={colors.primary} />}
          >
          {filteredContainers.map((c) => {
            const statusText = String(c.status || 'Status Unavailable');
            const isStored = statusText === 'STORED';

            return (
              <View key={c.id || c.barcode} style={styles.containerCard}>
                {/* Card Header Row */}
                <View style={styles.containerCardHeader}>
                  <View style={styles.headerLeftGroup}>
                    <Text style={styles.containerBarcode}>{c.barcode}</Text>
                    <View
                      style={[
                        styles.statusPill,
                        isStored ? styles.statusPillStored : styles.statusPillOther,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          isStored ? styles.statusDotStored : styles.statusDotOther,
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusText,
                          isStored ? styles.statusTextStored : styles.statusTextOther,
                        ]}
                      >
                        {statusText}
                      </Text>
                    </View>
                  </View>

                  {isStored && c.currentStorageLocationId && !c.inActiveTransport ? <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      navigate('transport_create', { workflow: 'INTERNAL_RELOCATION', containers: [c.barcode] });
                    }}
                    style={({ pressed }) => [styles.relocateBtn, pressed && styles.btnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Move container ${c.barcode} to another shelf`}
                  >
                    <ArrowUpRight size={13} color={colors.primary} strokeWidth={2.4} />
                    <Text style={styles.relocateBtnText}>Move</Text>
                  </Pressable> : null}
                </View>

                {/* Location Row */}
                <View style={styles.locationRow}>
                  <MapPin size={13} color={colors.primaryText} style={{ marginRight: 6 }} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {c.currentStorageLocationCode
                      ? shelfName(c.currentStorageLocationCode)
                      : c.currentEndpointId
                        ? endpointLabel(c.currentEndpointId, c.currentEndpointCode, c.status)
                        : c.status === 'ISSUED'
                          ? t('Issued')
                          : t('Not on a shelf')}
                    {c.currentStorageLocationCode && c.currentLevelNo ? ` · ${t('Level {level}', { level: c.currentLevelNo })}` : ''}
                  </Text>
                </View>

                {/* Cargo Row (QUANTITY FIRST, NEVER TRUNCATE QUANTITY!) */}
                <View style={styles.cargoRow}>
                  <Box size={13} color={colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={styles.cargoQty}>1 container</Text>
                  <Text style={styles.cargoDot}>·</Text>
                  <Text style={styles.cargoProduct} numberOfLines={1}>
                    {c.productName || 'Product Unavailable'} ({c.productSku || 'SKU Unavailable'})
                  </Text>
                </View>
              </View>
            );
          })}

          {filteredContainers.length === 0 && !loading && !loadError && (
            <View style={styles.emptyState}>
              <PackagePlus size={44} color={colors.textMuted} style={{ opacity: 0.4 }} />
              <Text style={styles.emptyTitle}>No matching containers found</Text>
              <Text style={styles.emptySub}>
                Try searching with a different container barcode or SKU.
              </Text>
            </View>
          )}
        </ScrollView>
      </>
    )}

      {/* Tab 2: By SKU List */}
      {inventoryTab === 'skus' && Boolean(activeWarehouseId) && (
        <>
          <View style={styles.categoryBar}>
            <StatusText variant="caption">Recorded Inventory · {stockRows.length} of {stockTotal} Stock Rows</StatusText>
            {stockSummary && stockSummary.unallocatedContainers > 0 ? (
              <StatusText variant="caption" color="primaryText">
                {t('{count} confirmed containers awaiting putaway (not on shelves yet).', { count: stockSummary.unallocatedContainers })}
              </StatusText>
            ) : (
              <StatusText variant="caption">Counts Represent Containers. More Locations May Appear As Rows Load.</StatusText>
            )}
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={inventoryQuery.isRefetching && !inventoryQuery.isFetchingNextPage} onRefresh={() => { void inventoryQuery.refetch(); void containersQuery.refetch(); }} tintColor={colors.primary} />}
          >
            {catalogProducts.map((prod) => (
              <View key={prod.id} style={styles.productCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.productName}>{prod.name}</Text>
                    <Text style={styles.productMeta}>
                      SKU: <Text style={styles.boldText}>{prod.sku}</Text>
                    </Text>
                  </View>
                  <View style={styles.stockBadge}>
                    <Text style={styles.stockCount}>{prod.containerCount}</Text>
                    <Text style={styles.stockLabel}>Containers</Text>
                  </View>
                </View>

                {/* Startpoints Locations */}
                <View style={styles.startpointsList}>
                  {prod.locations.map((sp) => (
                    <View
                      key={sp.id}
                      style={styles.startpointRow}
                    >
                      <View style={styles.startpointLeft}>
                        <MapPin size={13} color={colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.startpointId} numberOfLines={1}>
                            {sp.storageLocationCode} · Level {sp.levelNo}
                          </Text>
                          <Text style={styles.startpointZone} numberOfLines={1}>
                            {sp.storageLocationName}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.startpointRightCol}>
                        <Text style={styles.startpointQty}>{sp.containerCount} containers</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            {catalogProducts.length === 0 && !loading && !loadError && (
              <View style={styles.emptyState}>
                <PackagePlus size={44} color={colors.textMuted} style={{ opacity: 0.4 }} />
                {!serverSearch && stockSummary && stockSummary.unallocatedContainers > 0 ? <>
                  <Text style={styles.emptyTitle}>{t('All Confirmed Stock Awaits Putaway')}</Text>
                  <Text style={styles.emptySub}>
                    {t('{count} containers are in warehouse stock and waiting to be put away onto shelves.', { count: stockSummary.unallocatedContainers })}
                  </Text>
                </> : <>
                  <Text style={styles.emptyTitle}>No matching products found</Text>
                  <Text style={styles.emptySub}>
                    Try searching with a different product name, SKU, or storage location.
                  </Text>
                </>}
              </View>
            )}
            {inventoryQuery.hasNextPage && <Button label={inventoryQuery.isFetchingNextPage ? 'Loading…' : 'Load More Stock'} variant="outline"
              disabled={inventoryQuery.isFetchingNextPage} onPress={() => { void inventoryQuery.fetchNextPage(); }} />}
          </ScrollView>
        </>
      )}
      <Scanner visible={shelfScan} expect={['LOCATION']} title="Scan the shelf label" manualLabel="Shelf code" placeholder="Scan or type the shelf code"
        onClose={() => setShelfScan(false)}
        onScanResult={(_raw, scanned) => {
          setShelfScan(false);
          const recorded = verifiedContainer?.currentStorageLocationCode?.toUpperCase() ?? '';
          const location = places.locations.find(item => item.code.toUpperCase() === scanned.code.toUpperCase() || item.endpointCode.toUpperCase() === scanned.code.toUpperCase());
          const ok = !!recorded && (scanned.code.toUpperCase() === recorded || location?.code.toUpperCase() === recorded);
          triggerHaptic(ok ? 'success' : 'error');
          setShelfCheck({ scanned: location?.code ?? scanned.code, ok });
        }} />
      <BarcodeScannerHUD visible={scannerOpen} onClose={() => setScannerOpen(false)}
        onScanResult={(barcode) => { setScannerOpen(false); setSearchTerm(barcode); void handleVerifyBarcode(barcode); }} />
    </View>
  );
}

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchSection: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  inputContainer: {
    marginBottom: 0,
  },
  searchRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: {
    padding: 4,
  },
  scannerBtn: {
    padding: 6,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(50, 121, 249, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsWrapper: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
  },
  stockSummaryCard: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  stockSummaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stockSubNote: {
    textAlign: 'center',
  },
  stockMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  stockMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  tabularValue: {
    fontVariant: ['tabular-nums'],
  },
  spatialFilterSection: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
    gap: 6,
    zIndex: 9,
  },
  filterRowScroll: {
    paddingHorizontal: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelFilterRow: {
    marginTop: 2,
  },
  shelfCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  shelfCheckBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primaryBorder },
  shelfCheckText: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  shelfCheckResult: { flex: 1, fontSize: 13, fontWeight: '700' },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, maxWidth: 200,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filterPillActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  filterPillText: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flexShrink: 1 },
  filterPillTextActive: { color: colors.primaryText },
  clearFilters: { paddingHorizontal: 6, height: 34, justifyContent: 'center' },
  clearFiltersText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterSheet: { paddingHorizontal: 20, paddingBottom: 28, gap: 6 },
  filterOption: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  filterOptionActive: { backgroundColor: colors.primaryLight },
  filterOptionText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  filterOptionCount: { fontSize: 13, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  filterChip: {
    paddingHorizontal: 12,
    minHeight: 30,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  filterChipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  filterChipCountActive: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '800',
    fontFamily: typography.fontMono,
  },
  levelChip: {
    paddingHorizontal: 10,
    minHeight: 28,
  },
  levelChipText: {
    fontSize: 11.5,
  },
  categoryBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
    zIndex: 9,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    minHeight: 34,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  containerCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    ...shadows.sm,
  },
  containerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  containerBarcode: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    letterSpacing: 0.3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusPillStored: {
    backgroundColor: colors.successBg,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  statusPillOther: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotStored: {
    backgroundColor: colors.success,
  },
  statusDotOther: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: typography.fontMono,
  },
  statusTextStored: {
    color: colors.successText,
  },
  statusTextOther: {
    color: colors.textSecondary,
  },
  relocateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(50, 121, 249, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(50, 121, 249, 0.25)',
  },
  btnPressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(50, 121, 249, 0.16)',
  },
  relocateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryText,
    fontFamily: typography.fontSans,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    flex: 1,
  },
  cargoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cargoQty: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    flexShrink: 0,
  },
  cargoDot: {
    fontSize: 12,
    color: colors.textMuted,
    marginHorizontal: 5,
  },
  cargoProduct: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
    flex: 1,
  },
  productCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  productMeta: {
    fontSize: 11.5,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  stockBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(50, 121, 249, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(50, 121, 249, 0.2)',
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 64,
  },
  stockCount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  stockLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.primaryText,
    fontFamily: typography.fontSans,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  startpointsList: {
    gap: 6,
  },
  startpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  startpointLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  startpointId: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  startpointZone: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  startpointRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  startpointQty: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
    textAlign: 'right',
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  containerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  containerPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primaryText,
    fontFamily: typography.fontMono,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 12,
    fontFamily: typography.fontSans,
  },
  emptySub: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
    fontFamily: typography.fontSans,
  },
  verifiedCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: colors.successBg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.successBorder,
    padding: 14,
    gap: 8,
    ...shadows.sm,
  },
  verifiedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.successBorder,
    paddingBottom: 8,
  },
  verifiedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  verifiedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.successText,
  },
  verifiedStatusBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.successBorder,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.successText,
    fontFamily: typography.fontMono,
  },
  verifiedCloseBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  verifiedBody: {
    gap: 5,
    paddingVertical: 4,
  },
  verifiedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  verifiedLabel: {
    fontSize: 11.5,
    color: colors.successText,
    fontWeight: '500',
  },
  verifiedValue: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  verifiedValueMono: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '800',
    fontFamily: typography.fontMono,
  },
});
