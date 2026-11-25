import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Box, Check, Plus, ScanLine, Search } from 'lucide-react-native';
import { getUserErrorMessage } from '../../shared/api/client';
import { listContainers, type ContainerListItem } from '../../shared/api/warehouseApi';
import { t } from '../../shared/i18n';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { Button, Card, EmptyState, Text, TextField } from '../../shared/ui';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { contentsQuantity, type VoucherPreparation } from './voucherPreparation';
import { createVoucherStyles } from './voucherStyles';

interface Props {
  accountId: string;
  warehouseId: string;
  value: VoucherPreparation;
  update: (apply: (value: VoucherPreparation) => VoucherPreparation) => void;
  editable?: boolean;
  /** Containers just created on the Create Containers screen: ticked once they are listed. */
  preselectIds?: string[];
  onCreateContainers: () => void;
  onReadinessChange?: (ready: boolean) => void;
}

/** The quantity a selected box will be received with: the one typed here, else what the box already says. */
export function inboundQuantityOf(value: VoucherPreparation, item: { id: string; contentsQuantity?: number | null }): string {
  return value.contents[item.id]?.quantity ?? (item.contentsQuantity != null ? String(item.contentsQuantity) : '');
}

/**
 * An inbound voucher is made of boxes that were already created (Create Containers): pick them here, grouped by product,
 * and correct how many goods each holds before the voucher is confirmed. No new box is made on this screen.
 */
export function InboundContainerSelection({ accountId, warehouseId, value, update, editable = true, preselectIds, onCreateContainers, onReadinessChange }: Props) {
  const { styles, colors } = useThemedStyles(createVoucherStyles);
  const [search, setSearch] = useState('');
  const [scanner, setScanner] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const preselected = useRef(false);
  const query = useQuery({
    queryKey: ['inbound-awaiting-containers', accountId, warehouseId],
    queryFn: ({ signal }) => listContainers({ warehouseId, awaitingInbound: true, take: 200 }, signal),
    staleTime: 0,
    retry: false,
  });
  const usable = !query.isError && !!query.data;
  const candidates = useMemo(() => (usable ? query.data!.items : []), [usable, query.data]);
  const byId = useMemo(() => new Map(candidates.map(item => [item.id, item])), [candidates]);
  const selected = Object.values(value.selected);
  const missing = usable ? selected.filter(item => !byId.has(item.id)) : [];
  const badQuantity = selected.filter(item => contentsQuantity(inboundQuantityOf(value, byId.get(item.id) ?? item)) === null);
  const ready = usable && !query.isFetching && selected.length > 0 && !missing.length && !badQuantity.length;
  useEffect(() => { onReadinessChange?.(ready); }, [ready, onReadinessChange]);

  const toggle = (item: ContainerListItem, on?: boolean) => update(previous => {
    const next = { ...previous.selected };
    const isOn = on ?? !next[item.id];
    if (!isOn) delete next[item.id];
    else next[item.id] = { id: item.id, barcode: item.barcode, productName: item.productName, productSku: item.productSku, endpointId: item.currentEndpointId ?? '' };
    return { ...previous, selected: next };
  });
  const setQuantity = (ids: string[], quantity: string) => update(previous => {
    const contents = { ...previous.contents };
    for (const id of ids) contents[id] = { product: null, quantity };
    return { ...previous, contents };
  });

  // Boxes made on the Create Containers screen come ticked.
  useEffect(() => {
    if (preselected.current || !usable || !preselectIds?.length) return;
    preselected.current = true;
    const found = preselectIds.map(id => byId.get(id)).filter((item): item is ContainerListItem => !!item);
    if (found.length) update(previous => {
      const next = { ...previous.selected };
      for (const item of found) next[item.id] = { id: item.id, barcode: item.barcode, productName: item.productName, productSku: item.productSku, endpointId: item.currentEndpointId ?? '' };
      return { ...previous, selected: next };
    });
  }, [usable, preselectIds, byId, update]);

  const term = search.trim().toLocaleLowerCase();
  const visible = candidates.filter(item => !term || [item.barcode, item.productSku, item.productName].some(field => field.toLocaleLowerCase().includes(term)));
  const groups = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; productSku: string; items: ContainerListItem[] }>();
    for (const item of visible) {
      const group = map.get(item.productId) ?? { productId: item.productId, productName: item.productName, productSku: item.productSku, items: [] };
      group.items.push(item);
      map.set(item.productId, group);
    }
    return [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  }, [visible]);

  const onScanned = (code: string) => {
    setScanner(false);
    const match = candidates.find(item => item.barcode.toLocaleLowerCase() === code.trim().toLocaleLowerCase());
    if (match) { toggle(match, true); setNotFound(null); }
    else setNotFound(t('{code} is not a received container waiting for a voucher.', { code: code.trim() }));
  };

  return <Card gap={14} style={styles.reviewCard}>
    <View style={styles.between}>
      <Text variant="headline">Select Containers</Text>
      <Button title="Refresh" variant="ghost" size="sm" style={styles.editButton} loading={query.isFetching} disabled={!editable || query.isFetching} onPress={() => { void query.refetch(); }} />
    </View>
    <View style={styles.row}>
      <TextField containerStyle={{ flex: 1 }} accessibilityLabel="Search received containers" placeholder="Barcode, Product Or SKU" value={search} onChangeText={setSearch} editable={editable} showClearButton autoCapitalize="none" autoCorrect={false} leftIcon={<Search size={18} color={colors.textMuted} />} />
      <Pressable disabled={!editable} style={({ pressed }) => [styles.iconButton, pressed && editable && styles.pressed]} accessibilityRole="button" accessibilityState={{ disabled: !editable }} accessibilityLabel={t('Scan container barcode')} onPress={() => setScanner(true)}><ScanLine size={20} color={colors.primaryText} /></Pressable>
    </View>
    {notFound && <Text variant="caption" color="dangerText" accessibilityRole="alert">{notFound}</Text>}
    {query.isPending ? <Text variant="body" color="textSecondary">Loading Containers…</Text> : query.isError ? <EmptyState compact title="Containers Unavailable" message={getUserErrorMessage(query.error, 'Refresh to try again.')} /> : <>
      <View style={styles.between}>
        <Text variant="caption" color="textSecondary" style={styles.tabular}>{t('{count} containers waiting for a voucher', { count: candidates.length })}</Text>
        <View style={[styles.statusPill, !!selected.length && styles.statusPillActive]}>
          <Text variant="caption" color={selected.length ? 'primaryText' : 'textSecondary'} style={[styles.tabular, { fontWeight: '600' }]}>{t('{count} selected', { count: selected.length })}</Text>
        </View>
      </View>
      {!groups.length && <EmptyState compact title={term ? 'No Matching Containers' : 'No Containers Waiting'} message={term ? undefined : 'Create the containers first, then add them to a voucher.'} />}
      {groups.map(group => {
        const ids = group.items.map(item => item.id);
        const chosen = group.items.filter(item => !!value.selected[item.id]);
        const all = chosen.length === group.items.length;
        const chosenQuantities = new Set(chosen.map(item => inboundQuantityOf(value, item)));
        const shared = chosenQuantities.size === 1 ? [...chosenQuantities][0] : '';
        return <View key={group.productId} style={{ gap: 8 }}>
          <View style={styles.between}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" fontWeight="700" numberOfLines={1}>{group.productName}</Text>
              <Text variant="code" color="textSecondary" numberOfLines={1}>{group.productSku}</Text>
            </View>
            <Button title={all ? 'Clear' : 'Select All'} variant="ghost" size="sm" disabled={!editable} onPress={() => { for (const item of group.items) toggle(item, !all); }} />
          </View>
          {chosen.length > 1 && <TextField label="Goods Per Container (Selected)" value={shared} placeholder={t('Different quantities')} keyboardType="decimal-pad" maxLength={16} editable={editable}
            onChangeText={quantity => setQuantity(chosen.map(item => item.id), quantity)} />}
          {group.items.map((item, index) => {
            const checked = !!value.selected[item.id];
            const quantity = inboundQuantityOf(value, item);
            const invalid = checked && contentsQuantity(quantity) === null;
            return <View key={item.id}>
              <Pressable disabled={!editable}
                style={({ pressed }) => [styles.selectableRow, checked && styles.selectableRowActive, index === ids.length - 1 && !checked && { borderBottomWidth: 0 }, pressed && editable && styles.pressed]}
                accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${item.barcode}, ${item.productName}`}
                onPress={() => toggle(item)}>
                <View style={styles.summaryIcon}><Box size={18} strokeWidth={1.8} color={colors.primaryText} /></View>
                <View style={styles.summaryInfo}>
                  <Text variant="code">{item.barcode}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>{quantity ? t('Qty {quantity}', { quantity }) : t('Quantity not set')}</Text>
                </View>
                <View style={[styles.checkCircle, checked && styles.checkCircleActive]}>
                  {checked && <Check size={14} strokeWidth={2.6} color={colors.textInverse} />}
                </View>
              </Pressable>
              {checked && chosen.length === 1 && <TextField label="Goods Per Container" value={quantity} keyboardType="decimal-pad" maxLength={16} editable={editable}
                onChangeText={next => setQuantity([item.id], next)} />}
              {invalid && <Text variant="caption" color="dangerText">Enter a quantity greater than zero.</Text>}
            </View>;
          })}
        </View>;
      })}
    </>}
    {usable && !!missing.length && <Text variant="caption" color="dangerText" accessibilityRole="alert">{t('{count} selected container(s) are no longer waiting for a voucher. Remove them or refresh.', { count: missing.length })}</Text>}
    <Button title="Create New Containers" icon={Plus} variant="outline" disabled={!editable} onPress={onCreateContainers} />
    {scanner && <BarcodeScannerHUD visible onClose={() => setScanner(false)} onScanResult={onScanned} />}
  </Card>;
}
