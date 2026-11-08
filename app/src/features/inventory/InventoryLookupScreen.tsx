import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowUpRight,
  Barcode,
  Box,
  CheckCircle2,
  MapPin,
  PackagePlus,
  Search,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { Text as StatusText } from '../../shared/ui/Text';
import { containerLocationFilters, getContainerLocation, groupInventoryByProduct } from './inventoryData';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  ContainerListItem,
  getContainerByBarcode,
  listContainers,
  listInventory,
  ApiError,
  getOperatingContext,
} from '../../shared/api';

export type LevelFilterKey = 'ALL' | number;

export function InventoryLookupScreen() {
  const { goBack, navigate } = useNavigation();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [inventoryTab, setInventoryTab] = useState<'containers' | 'skus'>('containers');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedLevel, setSelectedLevel] = useState<LevelFilterKey>('ALL');
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
    enabled: Boolean(activeWarehouseId) && inventoryTab === 'skus',
  });
  const containers = containersQuery.data?.items || [];
  const containerTotal = containersQuery.data?.total || 0;
  const stockRows = inventoryQuery.data?.pages.flatMap(page => page.items) || [];
  const stockTotal = inventoryQuery.data?.pages[0]?.total || 0;
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
    setSelectedLocation('ALL');
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

  const locationOptions = useMemo(() => containerLocationFilters(containers), [containers]);
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
        label={activeWarehouseId ? `${containers.length} Containers Loaded · ${uniqueLocationsCount} Locations` : 'Loading Inventory…'}
        title="Inventory Catalog"
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

          <Button
            label="↗ Relocate Container (INTERNAL_RELOCATION)"
            icon={<ArrowUpRight size={14} color="#ffffff" />}
            variant="primary"
            size="sm"
            onPress={() => {
              triggerHaptic('tap');
              navigate('transport_create', {
                workflow: 'INTERNAL_RELOCATION',
                container: verifiedContainer.barcode,
                warehouseId: activeWarehouseId || undefined,
              });
            }}
            style={{ marginTop: 8 }}
          />
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
          {/* Storage Location & Level Filters */}
          <View style={styles.spatialFilterSection}>
            {/* Actual locations from the container response */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRowScroll}
            >
              {locationOptions.map((opt) => {
                const isSelected = activeLocationFilter === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedLocation(opt.key);
                    }}
                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by location ${opt.label}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                      {opt.label}
                    </Text>
                    <Text style={[styles.filterChipCount, isSelected && styles.filterChipCountActive]}>
                      ({opt.count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Rack Level Filter Row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRowScroll}
              style={styles.levelFilterRow}
            >
              {levelOptions.map((lvl) => {
                const isSelected = selectedLevel === lvl.value;
                return (
                  <Pressable
                    key={String(lvl.value)}
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedLevel(lvl.value);
                    }}
                    style={[
                      styles.filterChip,
                      styles.levelChip,
                      isSelected && styles.filterChipActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by level ${lvl.label}`}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        styles.levelChipText,
                        isSelected && styles.filterChipTextActive,
                      ]}
                    >
                      {lvl.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={containersQuery.isRefetching} onRefresh={() => { void containersQuery.refetch(); }} tintColor={colors.primary} />}
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

                  <Pressable
                    onPress={() => {
                      triggerHaptic('tap');
                      navigate('transport_create', {
                        workflow: 'INTERNAL_RELOCATION',
                        container: c.barcode,
                        warehouseId: activeWarehouseId,
                      });
                    }}
                    style={({ pressed }) => [styles.relocateBtn, pressed && styles.btnPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Relocate container ${c.barcode}`}
                  >
                    <ArrowUpRight size={13} color={colors.primary} strokeWidth={2.4} />
                    <Text style={styles.relocateBtnText}>Move</Text>
                  </Pressable>
                </View>

                {/* Location Row */}
                <View style={styles.locationRow}>
                  <MapPin size={13} color={colors.primaryText} style={{ marginRight: 6 }} />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {c.currentStorageLocationCode || c.currentEndpointCode || 'Location Unavailable'}
                    {c.currentLevelNo ? ' · Level ' + c.currentLevelNo : ''}
                    {c.zoneLabel ? ' (' + c.zoneLabel + ')' : ''}
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
            <StatusText variant="caption">Counts Represent Containers. More Locations May Appear As Rows Load.</StatusText>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={inventoryQuery.isRefetching && !inventoryQuery.isFetchingNextPage} onRefresh={() => { void inventoryQuery.refetch(); }} tintColor={colors.primary} />}
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
                <Text style={styles.emptyTitle}>No matching products found</Text>
                <Text style={styles.emptySub}>
                  Try searching with a different product name, SKU, or storage location.
                </Text>
              </View>
            )}
            {inventoryQuery.hasNextPage && <Button label={inventoryQuery.isFetchingNextPage ? 'Loading…' : 'Load More Stock'} variant="outline"
              disabled={inventoryQuery.isFetchingNextPage} onPress={() => { void inventoryQuery.fetchNextPage(); }} />}
          </ScrollView>
        </>
      )}
      <BarcodeScannerHUD visible={scannerOpen} onClose={() => setScannerOpen(false)}
        onScanResult={(barcode) => { setScannerOpen(false); setSearchTerm(barcode); void handleVerifyBarcode(barcode); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchSection: {
    backgroundColor: '#ffffff',
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
  spatialFilterSection: {
    backgroundColor: '#ffffff',
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
  filterChip: {
    paddingHorizontal: 12,
    minHeight: 30,
    borderRadius: 6,
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#ffffff',
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
    backgroundColor: '#F0FDF4',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 14,
    gap: 8,
    ...shadows.sm,
  },
  verifiedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
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
    color: '#065F46',
  },
  verifiedStatusBadge: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  verifiedStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    fontFamily: typography.fontMono,
  },
  verifiedCloseBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#DCFCE7',
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
    color: '#047857',
    fontWeight: '500',
  },
  verifiedValue: {
    fontSize: 12,
    color: '#064E3B',
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  verifiedValueMono: {
    fontSize: 12,
    color: '#064E3B',
    fontWeight: '800',
    fontFamily: typography.fontMono,
  },
});
