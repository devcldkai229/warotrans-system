import React, { useState } from 'react';
import { Modal, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
import { useTopInset } from '../theme/layout';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return <View accessibilityRole="alert" style={styles.error}><Text color="dangerText">{message}</Text></View>;
}
export function ChoiceField({ label, value, options, onChange, disabled = false }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find(option => option.value === value);
  return <View style={styles.field}>
    <Text variant="label">{label}</Text>
    <Button title={selected?.label ?? 'Select…'} variant="outline" disabled={disabled} onPress={() => setOpen(v => !v)} fullWidth />
    {open && !disabled && <View style={styles.options}>
      {options.length > 7 && <TextField accessibilityLabel={`Search ${label}`} placeholder="Search…" value={search} onChangeText={setSearch} />}
      <ScrollView style={styles.optionScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).map(option => <Pressable key={option.value}
          accessibilityRole="radio" accessibilityState={{ selected: value === option.value }}
          onPress={() => { onChange(option.value); setOpen(false); setSearch(''); }} style={styles.option}>
          <Text color={value === option.value ? 'primaryText' : 'textPrimary'}>{option.label}</Text>
        </Pressable>)}
        {!options.length && <Text>No Options Available</Text>}
      </ScrollView>
    </View>}
  </View>;
}
export function ActionModal({ visible, title, onClose, children, busy = false }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode; busy?: boolean;
}) {
  const topInset = useTopInset();
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, { paddingTop: topInset }]}>
      <View style={styles.modal}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
        <Text variant="title">{title}</Text>{children}
        <Button title="Close" variant="ghost" disabled={busy} onPress={onClose} />
      </ScrollView></View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  error: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderWidth: 1, padding: 12, borderRadius: 12 },
  field: { gap: 6 }, options: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 12, padding: 8, gap: 8, backgroundColor: colors.surface },
  optionScroll: { maxHeight: 220 }, option: { minHeight: 48, justifyContent: 'center', padding: 10 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, padding: 16, justifyContent: 'center', alignItems: 'center' },
  modal: { width: '100%', maxWidth: 480, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: 16 },
  modalContent: { padding: 20, gap: 16 },
});
