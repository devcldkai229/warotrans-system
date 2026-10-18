import React, { useEffect, useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { listWarehouses, listContainers } from '../../shared/api/warehouseApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { Button, Card, ChoiceField, StatusPill, Text, TextField } from '../../shared/ui';
export function InventoryLookupScreen() {
  const { navigate } = useNavigation();
  const warehouses = useRemoteData(() => listWarehouses({ isActive: true }));
  const [warehouseId, setWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { if (warehouses.data) setWarehouseId(warehouses.data.items[0]?.id ?? ''); }, [warehouses.data]);
  const inventory = useRemoteData(() => warehouseId ? listContainers({ warehouseId, search, take: 100 }) : Promise.resolve({ items: [], total: 0 }), [warehouseId, search]);
  return <OperationalScreen title="Inventory Lookup" loading={warehouses.loading || inventory.loading} error={warehouses.error ?? inventory.error} onRefresh={inventory.reload}>
    <ChoiceField label="Warehouse" value={warehouseId} options={warehouses.data?.items.map(w => ({ value: w.id, label: w.name })) ?? []} onChange={setWarehouseId} />
    <TextField label="Barcode, SKU Or Product Name" value={search} onChangeText={setSearch} autoCorrect={false} />
    <Button title="Receive A Container" variant="outline" onPress={() => navigate('create_container')} />
    <Text variant="caption">{inventory.data ? `${inventory.data.total} Containers Reported By Server` : 'Awaiting Server Data'}</Text>
    {inventory.data?.items.map(c => <Card key={c.id} gap={10}>
      <Text variant="headline">{c.barcode}</Text><StatusPill status={c.status} />
      <Text>{c.productSku} · {c.productName}</Text>
      <Text>Location: {c.currentStorageLocationCode ?? 'No Storage Location'}{c.currentLevelNo != null ? ` · Level ${c.currentLevelNo}` : ''}</Text>
      <Button title="Relocate Container" variant="outline" disabled={!['CREATED', 'PACKED', 'STORED'].includes(c.status)}
        onPress={() => navigate('transport_create', { containerId: c.id, barcode: c.barcode, workflow: 'INTERNAL_RELOCATION', warehouseId })} />
    </Card>)}
    {!inventory.loading && !inventory.error && !inventory.data?.items.length && <Text>No Containers Found</Text>}
  </OperationalScreen>;
}
