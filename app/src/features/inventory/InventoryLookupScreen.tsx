import React, { useState } from 'react';
import {
  Platform,
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
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

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
    navigate('transport_create', {
      workflow: 'Inbound Putaway',
      product: prod.name,
      container: prod.startpoints[0]?.container || 'BOX-101',
      source: prod.startpoints[0]?.id || 'DOCK-IN-01',
    });
  };

  return (
    <View style={styles.container}>
      {/* Header with Search */}
      <View style={styles.header}>
        <Pressable
          onPress={goBack}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && styles.backBtnPressed,
          ]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
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
            >
              <X size={14} color={colors.textMuted} />
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
                onPress={() => setSelectedCategory(cat)}
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {filteredProducts.map((prod) => (
          <View key={prod.id} style={styles.productCard}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{prod.name}</Text>
                <Text style={styles.productMeta}>
                  {prod.category} · SKU: {prod.sku}
                </Text>
              </View>
              <View style={styles.stockBox}>
                <Text style={styles.stockCount}>{prod.totalStock}</Text>
                <Text style={styles.stockLabel}>IN STOCK</Text>
              </View>
            </View>

            {/* Startpoints Locations */}
            <View style={styles.startpointsList}>
              {prod.startpoints.map((sp) => (
                <View key={sp.id} style={styles.startpointRow}>
                  <View style={styles.startpointLeft}>
                    <MapPin size={14} color={colors.primary} />
                    <Text style={styles.startpointId}>{sp.id}</Text>
                    <Text style={styles.startpointZone}>({sp.zone})</Text>
                  </View>
                  <View style={styles.startpointRight}>
                    <Text style={styles.startpointQty}>Qty: {sp.qty}</Text>
                    <View style={styles.containerPill}>
                      <Text style={styles.containerPillText}>{sp.container}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Quick Dispatch Action */}
            <Button
              label="Dispatch Transport for this SKU"
              icon={<Rocket size={14} color={colors.primary} />}
              onPress={() => handleQuickDispatch(prod)}
              variant="outline"
              size="sm"
              style={styles.dispatchBtn}
              textStyle={styles.dispatchBtnText}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 48 : 10,
    paddingBottom: 10,
    minHeight: Platform.OS === 'ios' ? 100 : 58,
    gap: 8,
    ...shadows.panel,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: {
    backgroundColor: colors.border,
  },
  searchBox: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    zIndex: 10,
  },
  inputContainer: {
    marginBottom: 0,
  },
  searchInput: {
    paddingLeft: 34,
    paddingRight: 30,
    height: 40,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 0,
  },
  clearBtn: {
    position: 'absolute',
    right: 10,
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
    paddingHorizontal: 14,
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.panel,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  productName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  productMeta: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  stockBox: {
    alignItems: 'flex-end',
  },
  stockCount: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  stockLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  startpointsList: {
    marginVertical: 10,
    gap: 6,
  },
  startpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  startpointLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  startpointId: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  startpointZone: {
    fontSize: 10,
    color: colors.textMuted,
  },
  startpointRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startpointQty: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  containerPill: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  containerPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  dispatchBtn: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryLight,
    borderRadius: 10,
    marginTop: 2,
  },
  dispatchBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
});
