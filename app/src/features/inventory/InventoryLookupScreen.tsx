import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  MapPin,
  PackagePlus,
  Rocket,
  Search,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

export interface CatalogProductItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  totalStock: number;
  startpoints: {
    id: string;
    label: string;
    zone: string;
    qty: number;
    container: string;
    status: string;
  }[];
}

const DISPATCH_CATALOG: CatalogProductItem[] = [
  {
    id: 'PROD-01',
    name: 'Electronic Components',
    category: 'Electronics',
    sku: 'EC-9042',
    totalStock: 57,
    startpoints: [
      { id: 'DOCK-IN-01', label: 'Inbound Dock 01', zone: 'Dock', qty: 25, container: 'BOX-101', status: 'Staged' },
      { id: 'RACK-A-02', label: 'Rack A · Level 2', zone: 'Zone A', qty: 32, container: 'BOX-102', status: 'Stored' },
    ],
  },
  {
    id: 'PROD-02',
    name: 'Sensor Array (SA-8820)',
    category: 'Sensors',
    sku: 'SA-8820',
    totalStock: 48,
    startpoints: [
      { id: 'RACK-A-01', label: 'Rack A · Level 1', zone: 'Zone A', qty: 3, container: 'BOX-301', status: 'Shortage' },
      { id: 'RACK-D-01', label: 'Bulk Yard D', zone: 'Zone D', qty: 45, container: 'BOX-302', status: 'Bulk Reserve' },
    ],
  },
  {
    id: 'PROD-03',
    name: 'Control Module (CM-3100)',
    category: 'Electronics',
    sku: 'CM-3100',
    totalStock: 82,
    startpoints: [
      { id: 'RACK-B-04', label: 'Rack B · Level 3', zone: 'Zone B', qty: 7, container: 'BOX-204', status: 'Warning' },
      { id: 'DOCK-IN-01', label: 'Inbound Dock 01', zone: 'Dock', qty: 75, container: 'BOX-205', status: 'Staged' },
    ],
  },
  {
    id: 'PROD-04',
    name: 'Drive Assembly Kit',
    category: 'Mechanical',
    sku: 'MK-1120',
    totalStock: 35,
    startpoints: [
      { id: 'RACK-B-02', label: 'Rack B · Level 1', zone: 'Zone B', qty: 15, container: 'BOX-401', status: 'Stored' },
      { id: 'QA-02', label: 'QA Station 02', zone: 'QA Bay', qty: 20, container: 'BOX-402', status: 'Inspected' },
    ],
  },
  {
    id: 'PROD-05',
    name: 'Heavy-Duty Shipping Carton',
    category: 'Packaging',
    sku: 'PKG-7700',
    totalStock: 120,
    startpoints: [
      { id: 'PACKING-01', label: 'Packing Bench 01', zone: 'Pack Bay', qty: 60, container: 'TOTE-EXP-08', status: 'Active' },
      { id: 'DOCK-OUT-01', label: 'Outbound Dock 01', zone: 'Dock', qty: 60, container: 'EMPTY-TOTE-STACK', status: 'Ready' },
    ],
  },
];

export function InventoryLookupScreen() {
  const { goBack, navigate } = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Electronics', 'Sensors', 'Mechanical', 'Packaging'];

  const filteredProducts = DISPATCH_CATALOG.filter((p) => {
    const matchesCategory =
      selectedCategory === 'All' ||
      p.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.startpoints.some(
        (sp) =>
          sp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          sp.container.toLowerCase().includes(searchTerm.toLowerCase())
      );
    return matchesCategory && matchesSearch;
  });

  const handleQuickDispatch = (prod: CatalogProductItem) => {
    triggerHaptic('tap');
    navigate('transport_create', {
      workflow: 'Inbound Putaway',
      product: prod.name,
      container: prod.startpoints[0]?.container || 'BOX-101',
      source: prod.startpoints[0]?.id || 'DOCK-IN-01',
    });
  };

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Warehouse catalog"
        title="Inventory Lookup"
        onBack={goBack}
      />

      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.textMuted} style={styles.searchIcon} />
          <Input
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search product, SKU, bin..."
            containerStyle={styles.inputContainer}
            inputStyle={styles.searchInput}
          />
          {searchTerm ? (
            <Pressable
              onPress={() => setSearchTerm('')}
              style={styles.clearBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Category Filter Chips */}
      <View style={styles.categoryBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
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
                <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Catalog Product Cards */}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {filteredProducts.map((prod) => (
          <View key={prod.id} style={styles.productCard}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
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
                <View key={sp.id} style={styles.startpointRow}>
                  <View style={styles.startpointLeft}>
                    <MapPin size={14} color={colors.textSecondary} />
                    <Text style={styles.startpointId}>{sp.id}</Text>
                    <Text style={styles.startpointZone}>({sp.zone})</Text>
                  </View>
                  <View style={styles.startpointRight}>
                    <Text style={styles.startpointQty}>
                      Qty: <Text style={styles.boldText}>{sp.qty}</Text>
                    </Text>
                    <View style={styles.containerPill}>
                      <Text style={styles.containerPillText}>{sp.container}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Quick Dispatch Action with Warm Dark Gray */}
            <Button
              label="Dispatch Transport"
              icon={<Rocket size={16} color="#ffffff" />}
              onPress={() => handleQuickDispatch(prod)}
              variant="primary"
              size="md"
              style={{ marginTop: 4 }}
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
  },
  searchBox: {
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
  },
  inputContainer: {
    marginBottom: 0,
  },
  searchInput: {
    paddingLeft: 38,
    paddingRight: 32,
    height: 44,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.md,
    fontSize: 14,
    fontWeight: '500',
    borderWidth: 1,
    borderColor: colors.border,
    fontFamily: typography.fontSans,
  },
  clearBtn: {
    position: 'absolute',
    right: 12,
    zIndex: 10,
    padding: 4,
  },
  categoryBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 8,
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
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 14,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
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
    marginVertical: 12,
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
  },
  startpointId: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  startpointZone: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  startpointRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  startpointQty: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
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
});
