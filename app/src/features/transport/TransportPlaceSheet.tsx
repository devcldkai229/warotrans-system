import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Check, Search, X } from 'lucide-react-native';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Text, TextField } from '../../shared/ui';
import { colors } from '../../shared/theme/colors';
import type { TransportPlace } from './transportDraft';

export function TransportPlaceSheet({ title, options, selectedId, onSelect, onClose, emptyMessage }: {
  title: string; options: TransportPlace[]; selectedId?: string; onSelect: (place: TransportPlace) => void;
  onClose: () => void; emptyMessage: string;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => options.filter(option => `${option.label} ${option.code}`.toLowerCase().includes(search.trim().toLowerCase())), [options, search]);
  return <BottomSheet onClose={onClose} accessibilityLabel={title}>
    <View style={styles.header}>
      <Text variant="headline" style={{ flex: 1 }}>{title}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close location picker" style={styles.close}><X size={20} color={colors.textPrimary} /></Pressable>
    </View>
    <View style={styles.search}><TextField value={search} onChangeText={setSearch} accessibilityLabel="Search locations"
      placeholder="Location name or code" leftIcon={<Search size={18} color={colors.textMuted} />} showClearButton autoCorrect={false} /></View>
    <FlatList data={filtered} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}
      contentContainerStyle={styles.list} renderItem={({ item }) => <Pressable
        accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.code}`}
        accessibilityState={{ selected: item.id === selectedId }} onPress={() => onSelect(item)}
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSubtle }]}>
        <View style={{ flex: 1, gap: 3 }}><Text variant="bodyMedium">{item.label || item.code}</Text>
          {item.label !== item.code && <Text variant="caption">{item.code}</Text>}</View>
        {selectedId === item.id && <Check size={18} color={colors.primaryText} />}
      </Pressable>} ListEmptyComponent={<View style={styles.empty}><Text variant="body" textAlign="center">
        {search.trim() ? 'No matching locations. Try another name or clear the search.' : emptyMessage}
      </Text></View>} />
  </BottomSheet>;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  search: { paddingHorizontal: 20, paddingVertical: 12 },
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: { minHeight: 64, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  empty: { paddingVertical: 24, gap: 12 },
});
