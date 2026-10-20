import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
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
  RotateCw,
  Search,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  ContainerListItem,
  getContainerByBarcode,
  getSeedContainersSnapshot,
  listContainers,
  listWarehouses,
} from '../../shared/api';

export interface CatalogStartpoint {
  id: string;
  label: string;
  zone: string;
  qty: number;
  container: string;
  status: string;
  recommendedWorkflow: string;
}

export interface CatalogProductItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  totalStock: number;
  startpoints: CatalogStartpoint[];
}

function resolveRecommendedWorkflow(c: ContainerListItem): string {
  const loc = (c.currentStorageLocationCode || c.currentEndpointCode || 'DOCK-IN-01').toUpperCase();
  if (loc.startsWith('DOCK-IN')) return 'Inbound Putaway';
  if (loc.startsWith('RACK-D')) return 'Replenishment';
  if (loc.startsWith('QA-') || loc.startsWith('ASSEMBLY')) return 'Point-to-Point';
  if (loc === 'RACK-A-08') return 'Reallocation';
  return 'Outbound Retrieval';
}

function buildCatalogFromContainers(containers: ContainerListItem[]): CatalogProductItem[] {
  const bySku = new Map<string, CatalogProductItem>();

  containers.forEach((c) => {
    const sku = c.productSku || 'SKU-GEN';
    const qty = c.qty || 20;
    const locCode = c.currentStorageLocationCode
      ? `${c.currentStorageLocationCode}${c.currentLevelNo ? ` · L${c.currentLevelNo}` : ''}`
      : c.currentEndpointCode || 'DOCK-IN-01';
    const zone =
      c.zoneLabel ||
      (locCode.startsWith('RACK-A')
        ? 'Zone A'
        : locCode.startsWith('RACK-B')
        ? 'Zone B'
        : locCode.startsWith('RACK-D')
        ? 'Zone D'
        : locCode.startsWith('QA')
        ? 'QA Bay'
        : 'Inbound Dock');

    const startpoint: CatalogStartpoint = {
      id: locCode,
      label: zone,
      zone,
      qty,
      container: c.barcode,
      status: String(c.status || 'STORED'),
      recommendedWorkflow: resolveRecommendedWorkflow(c),
    };

    const existing = bySku.get(sku);
    if (existing) {
      existing.totalStock += qty;
      existing.startpoints.push(startpoint);
    } else {
      bySku.set(sku, {
        id: `${c.productId}-${sku}`,
        name: c.productName || 'Warehouse Item',
        category: c.category || 'Electronics',
        sku,
        totalStock: qty,
        startpoints: [startpoint],
      });
    }
  });

  return Array.from(bySku.values());
}

export function InventoryLookupScreen() {
  const { goBack, navigate } = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [inventoryTab, setInventoryTab] = useState<'containers' | 'skus'>('containers');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [containers, setContainers] = useState<ContainerListItem[]>(() =>
    getSeedContainersSnapshot()
  );
  const [verifiedContainer, setVerifiedContainer] = useState<ContainerListItem | null>(null);
  const [isVerifyingBarcode, setIsVerifyingBarcode] = useState(false);
  const [, setActiveWarehouseId] = useState('11111111-1111-1111-1111-111111111111');

  useEffect(() => {
    let isMounted = true;
    async function loadInventory() {
      let whId = '11111111-1111-1111-1111-111111111111';
      try {
        const whRes = await listWarehouses({ isActive: true });
        if (whRes?.items?.length) {
          const match =
            whRes.items.find((w) => w.id === '11111111-1111-1111-1111-111111111111') ||
            whRes.items[0];
          whId = match.id;
          if (isMounted) setActiveWarehouseId(whId);
        }
      } catch {}

      try {
        const res = await listContainers({
          warehouseId: whId,
          take: 100,
        });
        if (isMounted && res?.items?.length) {
          setContainers(res.items);
        }
      } catch {}
    }

    loadInventory();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleVerifyBarcode = async (codeToVerify?: string) => {
    const raw = (codeToVerify ?? searchTerm).trim();
    if (!raw) {
      toast.warning('Enter a container code (e.g. C1, CTN-DEMO-000001, BOX-101) to verify.');
      return;
    }

    triggerHaptic('tap');
    setIsVerifyingBarcode(true);
    try {
      const res = await getContainerByBarcode(raw);
      if (res && res.barcode) {
        setVerifiedContainer(res);
        triggerHaptic('success');
        toast.success(`Container ${res.barcode} verified with backend!`);
        return;
      }
      throw new Error('Not found in by-barcode');
    } catch {
      // Fallback: look up in containers list
      const clean = raw.toUpperCase();
      const localMatch = containers.find(
        (c) =>
          c.barcode.toUpperCase() === clean ||
          c.barcode.toUpperCase().includes(clean)
      );
      if (localMatch) {
        setVerifiedContainer(localMatch);
        triggerHaptic('success');
        toast.success(`Container ${localMatch.barcode} found in inventory!`);
      } else {
        toast.warning(`Container "${raw}" not found in warehouse registry.`);
      }
    } finally {
      setIsVerifyingBarcode(false);
    }
  };

  const catalogProducts = useMemo(
    () => buildCatalogFromContainers(containers),
    [containers]
  );

  const uniqueLocationsCount = useMemo(() => {
    const locs = new Set<string>();
    containers.forEach((c) => {
      const code = c.currentStorageLocationCode || c.currentEndpointCode;
      if (code) locs.add(code);
    });
    return locs.size || 1;
  }, [containers]);

  const categories = ['All', 'Electronics', 'Sensors', 'Mechanical', 'Packaging'];

  const filteredContainers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return containers;
    return containers.filter((c) => {
      const barcode = (c.barcode || '').toLowerCase();
      const sku = (c.productSku || '').toLowerCase();
      const name = (c.productName || '').toLowerCase();
      const loc = (c.currentStorageLocationCode || c.currentEndpointCode || '').toLowerCase();
      return (
        barcode.includes(q) ||
        sku.includes(q) ||
        name.includes(q) ||
        loc.includes(q)
      );
    });
  }, [containers, searchTerm]);

  const filteredProducts = useMemo(() => {
    return catalogProducts.filter((p) => {
      const matchesCategory =
        selectedCategory === 'All' ||
        p.category.toLowerCase() === selectedCategory.toLowerCase();
      const q = searchTerm.toLowerCase().trim();
      if (!q) return matchesCategory;
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.startpoints.some(
          (sp) =>
            sp.id.toLowerCase().includes(q) ||
            sp.container.toLowerCase().includes(q) ||
            sp.zone.toLowerCase().includes(q)
        );
      return matchesCategory && matchesSearch;
    });
  }, [catalogProducts, selectedCategory, searchTerm]);

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Warehouse catalog"
        title="Inventory Lookup"
        onBack={goBack}
      />

      {/* Tầng 1: Search & Barcode Scan Section */}
      <View style={styles.searchSection}>
        <Input
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={() => handleVerifyBarcode()}
          placeholder="Search container, SKU, or location..."
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
                  navigate('scanner');
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

        <Button
          label={isVerifyingBarcode ? 'Verifying Barcode...' : 'Verify Container Barcode'}
          icon={<RotateCw size={14} color={colors.primary} />}
          variant="outline"
          size="sm"
          loading={isVerifyingBarcode}
          onPress={() => handleVerifyBarcode()}
          style={styles.verifyBtn}
        />
      </View>

      {/* Prominent Verified Container Details Card */}
      {verifiedContainer && (
        <View style={styles.verifiedCard}>
          <View style={styles.verifiedCardHeader}>
            <View style={styles.verifiedBadgeRow}>
              <CheckCircle2 size={18} color="#059669" />
              <Text style={styles.verifiedTitle}>Verified Container Details</Text>
            </View>
            <View style={styles.verifiedStatusBadge}>
              <Text style={styles.verifiedStatusText}>
                {verifiedContainer.status || 'STORED'}
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
                  : verifiedContainer.currentEndpointCode || 'Origin Bay (EP-A)'}
              </Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Inventory Status:</Text>
              <Text style={styles.verifiedValue}>
                {verifiedContainer.status || 'STORED'} · {verifiedContainer.qty || 24} pcs
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
              });
            }}
            style={{ marginTop: 8 }}
          />
        </View>
      )}

      {/* Tầng 2: Inventory Glance Metrics Bar */}
      <View style={styles.metricsBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricEmoji}>📦</Text>
          <Text style={styles.metricLabel}>{containers.length} Containers</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricEmoji}>🏷️</Text>
          <Text style={styles.metricLabel}>{catalogProducts.length} SKUs</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricEmoji}>📍</Text>
          <Text style={styles.metricLabel}>{uniqueLocationsCount} Locations</Text>
        </View>
      </View>

      {/* Tầng 3: Segmented Control Tabs (By Containers vs By SKU) */}
      <View style={styles.tabsWrapper}>
        <SegmentedControl
          options={[
            { label: `📦 Containers (${containers.length})`, value: 'containers' },
            { label: `🏷️ By SKU (${catalogProducts.length})`, value: 'skus' },
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
      {inventoryTab === 'containers' && (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {filteredContainers.map((c) => {
            const locText = c.currentStorageLocationCode || c.currentEndpointCode || 'EP-A';
            const statusText = String(c.status || 'STORED');
            const isStored = statusText === 'STORED';

            return (
              <View key={c.id || c.barcode} style={styles.containerCard}>
                {/* Card Header: Barcode in bold mono & Status badge */}
                <View style={styles.containerCardHeader}>
                  <Text style={styles.containerBarcodeMono}>{c.barcode}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      isStored ? styles.statusBadgeStored : styles.statusBadgeOther,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        isStored ? styles.statusBadgeTextStored : styles.statusBadgeTextOther,
                      ]}
                    >
                      {statusText}
                    </Text>
                  </View>
                </View>

                {/* Location row */}
                <View style={styles.infoRow}>
                  <MapPin size={13} color={colors.textSecondary} style={styles.rowIcon} />
                  <Text style={styles.infoLabel}>Location: </Text>
                  <Text style={styles.boldMono}>{locText}</Text>
                  {c.currentLevelNo ? (
                    <Text style={styles.infoSecondary}> · Level {c.currentLevelNo}</Text>
                  ) : null}
                </View>

                {/* Cargo row */}
                <View style={styles.infoRow}>
                  <Box size={13} color={colors.textSecondary} style={styles.rowIcon} />
                  <Text style={styles.infoText} numberOfLines={1}>
                    {c.productName || 'Warehouse Item'} ({c.productSku || 'SKU-GEN'}) ·{' '}
                    <Text style={{ fontWeight: '700', color: colors.textPrimary }}>
                      {c.qty || 20} pcs
                    </Text>
                  </Text>
                </View>

                {/* Action button: Relocate Container */}
                <Button
                  label="↗ Relocate Container (INTERNAL_RELOCATION)"
                  icon={<ArrowUpRight size={14} color="#ffffff" />}
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    triggerHaptic('tap');
                    navigate('transport_create', {
                      workflow: 'INTERNAL_RELOCATION',
                      container: c.barcode,
                    });
                  }}
                  style={styles.relocateBtn}
                />
              </View>
            );
          })}

          {filteredContainers.length === 0 && (
            <View style={styles.emptyState}>
              <PackagePlus size={44} color={colors.textMuted} style={{ opacity: 0.4 }} />
              <Text style={styles.emptyTitle}>No matching containers found</Text>
              <Text style={styles.emptySub}>
                Try searching with a different container barcode, SKU, or location code.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Tab 2: By SKU List */}
      {inventoryTab === 'skus' && (
        <>
          {/* Category Filter Chips */}
          <View style={styles.categoryBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedCategory(cat);
                    }}
                    style={[styles.categoryChip, isSelected && styles.categoryChipActive]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat}
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
          >
            {filteredProducts.map((prod) => (
              <View key={prod.id} style={styles.productCard}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={styles.productName}>{prod.name}</Text>
                    <Text style={styles.productMeta}>
                      {prod.category} · SKU: <Text style={styles.boldText}>{prod.sku}</Text>
                    </Text>
                  </View>
                  <View style={styles.stockBox}>
                    <Text style={styles.stockCount}>{prod.totalStock}</Text>
                    <Text style={styles.stockLabel}>Available</Text>
                  </View>
                </View>

                {/* Startpoints Locations */}
                <View style={styles.startpointsList}>
                  {prod.startpoints.map((sp) => (
                    <View
                      key={`${sp.container}-${sp.id}`}
                      style={styles.startpointRow}
                    >
                      <View style={styles.startpointLeft}>
                        <MapPin size={13} color={colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.startpointId} numberOfLines={1}>
                            {sp.id}
                          </Text>
                          <Text style={styles.startpointZone} numberOfLines={1}>
                            {sp.zone} · {sp.recommendedWorkflow}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.startpointRightCol}>
                        <View style={styles.containerPill}>
                          <Text style={styles.containerPillText} numberOfLines={1}>
                            {sp.container}
                          </Text>
                        </View>
                        <Text style={styles.startpointQty}>{sp.qty} pcs</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <Button
                  label={`↗ Relocate (${prod.startpoints[0]?.container || 'Container'})`}
                  icon={<ArrowUpRight size={14} color={colors.primary} />}
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    const firstC = prod.startpoints[0]?.container;
                    if (firstC) {
                      triggerHaptic('tap');
                      navigate('transport_create', {
                        workflow: 'INTERNAL_RELOCATION',
                        container: firstC,
                      });
                    }
                  }}
                  style={{ marginTop: 2 }}
                />
              </View>
            ))}

            {filteredProducts.length === 0 && (
              <View style={styles.emptyState}>
                <PackagePlus size={44} color={colors.textMuted} style={{ opacity: 0.4 }} />
                <Text style={styles.emptyTitle}>No matching products found</Text>
                <Text style={styles.emptySub}>
                  Try searching with a different product name, SKU, or category filter.
                </Text>
              </View>
            )}
          </ScrollView>
        </>
      )}
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
  verifyBtn: {
    marginTop: 8,
    width: '100%',
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  metricItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  metricEmoji: {
    fontSize: 14,
  },
  metricLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  metricDivider: {
    width: 1,
    height: 18,
    backgroundColor: colors.border,
  },
  tabsWrapper: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
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
    gap: 12,
  },
  containerCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
    ...shadows.panel,
  },
  containerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  containerBarcodeMono: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
    letterSpacing: 0.3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  statusBadgeStored: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  statusBadgeOther: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    fontFamily: typography.fontMono,
  },
  statusBadgeTextStored: {
    color: '#047857',
  },
  statusBadgeTextOther: {
    color: colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    marginRight: 6,
    flexShrink: 0,
  },
  infoLabel: {
    fontSize: 12.5,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  boldMono: {
    fontSize: 12.5,
    fontWeight: '700',
    fontFamily: typography.fontMono,
    color: colors.textPrimary,
  },
  infoSecondary: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoText: {
    fontSize: 12.5,
    color: colors.textSecondary,
    flex: 1,
  },
  relocateBtn: {
    marginTop: 4,
    width: '100%',
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
    ...shadows.panel,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  productMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 3,
    fontFamily: typography.fontSans,
  },
  stockBox: {
    alignItems: 'flex-end',
  },
  stockCount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  stockLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
    marginTop: 1,
  },
  startpointsList: {
    marginVertical: 4,
    gap: 8,
  },
  startpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    gap: 3,
  },
  startpointQty: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
    textAlign: 'right',
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  containerPill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  containerPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  verifiedStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#166534',
    fontFamily: typography.fontMono,
  },
  verifiedCloseBtn: {
    padding: 4,
    borderRadius: radii.full,
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
