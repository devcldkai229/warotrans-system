import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';

export interface CatalogProductItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  totalStock: number;
  locations: { endpointCode: string; qty: number; containerBarcode: string }[];
}

const CATALOG_ITEMS: CatalogProductItem[] = [
  {
    id: 'prod-01',
    name: 'Optical Proximity Sensor X4',
    category: 'Sensors',
    sku: 'SKU-SNS-9921',
    totalStock: 90,
    locations: [
      { endpointCode: 'RACK-A02', qty: 45, containerBarcode: 'BOX-101' },
      { endpointCode: 'RACK-A09', qty: 45, containerBarcode: 'BOX-102' },
    ],
  },
  {
    id: 'prod-02',
    name: 'Pneumatic Actuator Valve',
    category: 'Pneumatics',
    sku: 'SKU-PNM-4410',
    totalStock: 120,
    locations: [
      { endpointCode: 'RACK-B04', qty: 50, containerBarcode: 'BOX-204' },
      { endpointCode: 'RACK-B01', qty: 70, containerBarcode: 'BOX-205' },
    ],
  },
  {
    id: 'prod-03',
    name: 'Relay Modules 24V DC',
    category: 'Electronics',
    sku: 'SKU-ELC-1088',
    totalStock: 60,
    locations: [
      { endpointCode: 'RACK-A01', qty: 20, containerBarcode: 'TOTE-088' },
      { endpointCode: 'RACK-A12', qty: 40, containerBarcode: 'TOTE-089' },
    ],
  },
  {
    id: 'prod-04',
    name: 'Micro Controller Unit ESP32',
    category: 'Electronics',
    sku: 'SKU-MCU-3050',
    totalStock: 200,
    locations: [
      { endpointCode: 'RACK-A02', qty: 100, containerBarcode: 'BOX-305' },
      { endpointCode: 'DOCK-01', qty: 100, containerBarcode: 'BOX-306' },
    ],
  },
  {
    id: 'prod-05',
    name: 'Heavy Duty Coupler 20mm',
    category: 'Hardware',
    sku: 'SKU-HDW-7712',
    totalStock: 40,
    locations: [
      { endpointCode: 'RACK-B04', qty: 40, containerBarcode: 'BOX-205' },
    ],
  },
];

export function InventoryLookupScreen() {
  const { navigate } = useNavigation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Sensors', 'Pneumatics', 'Electronics', 'Hardware'];

  const filtered = CATALOG_ITEMS.filter((item) => {
    const matchCat =
      selectedCategory === 'All' ||
      item.category.toLowerCase() === selectedCategory.toLowerCase();
    if (!matchCat) return false;

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.locations.some(
        (loc) =>
          loc.endpointCode.toLowerCase().includes(q) ||
          loc.containerBarcode.toLowerCase().includes(q)
      )
    );
  });

  const handleQuickDispatch = (item: CatalogProductItem) => {
    navigate('transport_create', {
      workflowCode: 'INTERNAL_RELOCATION',
      prefilledProduct: item.name,
      prefilledContainer: item.locations[0]?.containerBarcode,
    });
  };

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchSection}>
        <Input
          placeholder="Search by SKU, product name, rack location..."
          value={searchTerm}
          onChangeText={setSearchTerm}
          containerStyle={{ marginBottom: 0 }}
          rightIcon={
            searchTerm ? (
              <Pressable onPress={() => setSearchTerm('')}>
                <Text style={styles.clearBtn}>✕</Text>
              </Pressable>
            ) : undefined
          }
        />
      </View>

      {/* Category Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(cat)}
              style={[styles.catChip, isSelected && styles.catChipSelected]}
            >
              <Text
                style={[
                  styles.catChipText,
                  isSelected && styles.catChipTextSelected,
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Results List */}
      <ScrollView style={styles.listArea} contentContainerStyle={styles.listContent}>
        {filtered.length > 0 ? (
          filtered.map((prod) => (
            <View key={prod.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.infoCol}>
                  <Text style={styles.prodName}>{prod.name}</Text>
                  <Text style={styles.prodMeta}>
                    {prod.category} · SKU: {prod.sku}
                  </Text>
                </View>
                <View style={styles.stockCol}>
                  <Text style={styles.stockNum}>{prod.totalStock}</Text>
                  <Text style={styles.stockLabel}>IN STOCK</Text>
                </View>
              </View>

              {/* Locations Breakdown */}
              <View style={styles.locationsList}>
                {prod.locations.map((loc, idx) => (
                  <View key={idx} style={styles.locationRow}>
                    <Text style={styles.locEndpoint}>📍 {loc.endpointCode}</Text>
                    <View style={styles.locMetaGroup}>
                      <Text style={styles.locQty}>{loc.qty} units</Text>
                      <View style={styles.locToteBadge}>
                        <Text style={styles.locToteText}>{loc.containerBarcode}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>

              {/* Quick Dispatch Action */}
              <Pressable
                onPress={() => handleQuickDispatch(prod)}
                style={({ pressed }) => [
                  styles.dispatchBtn,
                  pressed && styles.dispatchBtnPressed,
                ]}
              >
                <Text style={styles.dispatchIcon}>🚀</Text>
                <Text style={styles.dispatchText}>Dispatch Transport for this SKU</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No matching products</Text>
            <Text style={styles.emptySub}>
              Try searching with another keyword or selecting "All" category.
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
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  clearBtn: {
    fontSize: 14,
    color: colors.textMuted,
    padding: 4,
  },
  categoryScroll: {
    maxHeight: 46,
    marginTop: 8,
  },
  categoryContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  catChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  catChipTextSelected: {
    color: colors.textInverse,
  },
  listArea: {
    flex: 1,
    marginTop: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
    marginBottom: 8,
  },
  infoCol: {
    flex: 1,
  },
  prodName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  prodMeta: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  stockCol: {
    alignItems: 'flex-end',
  },
  stockNum: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.primary,
  },
  stockLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  locationsList: {
    gap: 4,
    marginBottom: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  locEndpoint: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  locMetaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locQty: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  locToteBadge: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  locToteText: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '800',
    color: colors.primary,
  },
  dispatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 8,
    paddingVertical: 8,
    gap: 6,
  },
  dispatchBtnPressed: {
    backgroundColor: '#bae6fd',
  },
  dispatchIcon: {
    fontSize: 12,
  },
  dispatchText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySub: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});
