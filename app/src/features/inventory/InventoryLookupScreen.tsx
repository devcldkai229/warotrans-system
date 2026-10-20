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
        label={`${containers.length} Containers · ${uniqueLocationsCount} Locations`}
        title="Inventory Catalog"
        onBack={goBack}
      />

      {/* Tầng 1: Single Compact Search & Barcode Scan Section */}
      <View style={styles.searchSection}>
        <Input
          value={searchTerm}
          onChangeText={setSearchTerm}
          onSubmitEditing={() => handleVerifyBarcode()}
          placeholder="Search container, SKU, or rack..."
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
      </View>

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

      {/* Tầng 2: Segmented Control Tabs (directly below the search box) */}
      <View style={styles.tabsWrapper}>
        <SegmentedControl
          options={[
            { label: `📦 Containers (${filteredContainers.length})`, value: 'containers' },
            { label: `🏷️ By SKU (${filteredProducts.length})`, value: 'skus' },
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
            const statusText = String(c.status || 'STORED');
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
                    {c.currentStorageLocationCode || c.currentEndpointCode || 'EP-A'}
                    {c.currentLevelNo ? ' · Level ' + c.currentLevelNo : ''}
                    {c.zoneLabel ? ' (' + c.zoneLabel + ')' : ''}
                  </Text>
                </View>

                {/* Cargo Row (QUANTITY FIRST, NEVER TRUNCATE QUANTITY!) */}
                <View style={styles.cargoRow}>
                  <Box size={13} color={colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={styles.cargoQty}>{c.qty || 20} pcs</Text>
                  <Text style={styles.cargoDot}>·</Text>
                  <Text style={styles.cargoProduct} numberOfLines={1}>
                    {c.productName || 'Warehouse Item'} ({c.productSku || 'SKU-GEN'})
                  </Text>
                </View>
              </View>
            );
          })}

          {filteredContainers.length === 0 && (
            <View style={styles.emptyState}>
              <PackagePlus size={44} color={colors.textMuted} style={{ opacity: 0.4 }} />
              <Text style={styles.emptyTitle}>No matching containers found</Text>
              <Text style={styles.emptySub}>
                Try searching with a different container barcode, SKU, or rack.
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
                  <View style={styles.stockBadge}>
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
                        <Pressable
                          onPress={() => {
                            triggerHaptic('tap');
                            navigate('transport_create', {
                              workflow: 'INTERNAL_RELOCATION',
                              container: sp.container,
                            });
                          }}
                          style={({ pressed }) => [
                            styles.containerPill,
                            pressed && styles.btnPressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Relocate container ${sp.container}`}
                        >
                          <Text style={styles.containerPillText} numberOfLines={1}>
                            {sp.container}
                          </Text>
                          <ArrowUpRight size={10} color={colors.primary} style={{ marginLeft: 2 }} />
                        </Pressable>
                        <Text style={styles.startpointQty}>{sp.qty} pcs</Text>
                      </View>
                    </View>
                  ))}
                </View>
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
    borderRadius: radii.full,
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
    color: colors.primary,
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
