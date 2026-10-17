import React, { useEffect, useRef, useState } from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { ApiError } from '../../shared/api/client';
import { resolveProduct, getProductInventoryContext, createContainer, listWarehouses, listStorageLocations, ProductDto, ProductInventoryContext, CreateContainerResponse } from '../../shared/api/warehouseApi';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { Button, Card, ChoiceField, ErrorBanner, StatusPill, Text, TextField } from '../../shared/ui';
import { optionalLevel } from '../transport/workflowInputs';
function receivingError(error: unknown): string {
  if (error instanceof ApiError && (error.status === 405 || (error.status === 404 && (!error.code || error.code === 'not_found')))) {
    return 'The Warehouse Receiving Endpoint Is Not Mapped On The Server. The Server Must Register Product Resolution, Inventory Context And Container Receiving Routes In WarehouseModule.cs. No Container Was Created. ' + error.message;
  }
  return error instanceof Error ? error.message : 'Warehouse Receiving Failed';
}
export function CreateContainerScreen() {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('barcode');
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [product, setProduct] = useState<ProductDto | null>(null);
  const [context, setContext] = useState<ProductInventoryContext | null>(null);
  const [supplierBarcode, setSupplierBarcode] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [level, setLevel] = useState('');
  const [receipt, setReceipt] = useState<CreateContainerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const warehouses = useRemoteData(() => listWarehouses({ isActive: true }));
  useEffect(() => { if (warehouses.data) setWarehouseId(warehouses.data.items[0]?.id ?? ''); }, [warehouses.data]);
  const locations = useRemoteData(() => warehouseId ? listStorageLocations({ warehouseId, activeOnly: true }) : Promise.resolve({ items: [], total: 0 }), [warehouseId]);
  const choose = async (p: ProductDto) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setProduct(p); setContext(null);
    try { setContext(await getProductInventoryContext(p.id)); }
    catch (error) { setError(receivingError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  const resolve = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setProducts([]); setProduct(null); setContext(null);
    let exact: ProductDto | null = null;
    try {
      const result = await resolveProduct(mode === 'barcode' ? { barcode: search.trim() } : { query: search.trim(), limit: 20 });
      setProducts(result.items); exact = result.exactMatch;
      if (!result.items.length && !exact) setError('No Active Product Matches This Search.');
    } catch (error) { setError(receivingError(error)); }
    finally { lock.current = false; setBusy(false); }
    if (exact) await choose(exact);
  };
  const receive = async () => {
    if (lock.current || !product || !context) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const initialLevelNo = optionalLevel(level);
      if (initialLevelNo && !locationId) throw new Error('Select An Initial Storage Location Before Setting A Level.');
      const created = await createContainer({ productId: product.id, supplierPackageBarcode: supplierBarcode.trim() || null,
        initialStorageLocationId: locationId || null, initialLevelNo });
      setReceipt(created);
    } catch (error) { setError(receivingError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <OperationalScreen title="Receive A Container" error={warehouses.error ?? locations.error}>
    <ErrorBanner message={error} />
    {receipt ? <Card gap={12}>
      <Text variant="headline">Container Received</Text><Text variant="code">{receipt.barcode}</Text><StatusPill status={receipt.status} />
      <Text variant="caption">Container ID: {receipt.id}</Text>
      <Button title="Receive Another Container" onPress={() => { setReceipt(null); setSupplierBarcode(''); setProduct(null); setContext(null); setProducts([]); setSearch(''); setError(null); }} />
    </Card> : <>
      <Card gap={12}>
        <Text variant="headline">1. Resolve Product</Text>
        <ChoiceField label="Lookup Mode" value={mode} disabled={busy} onChange={setMode} options={[{ value: 'barcode', label: 'Supplier Barcode Or SKU' }, { value: 'query', label: 'Product Search' }]} />
        <TextField label="Product Barcode Or Query" value={search} onChangeText={setSearch} editable={!busy} autoCorrect={false} onSubmitEditing={resolve} />
        <Button title="Resolve Product" loading={busy} disabled={!search.trim()} onPress={resolve} />
        {products.map(p => <Button key={p.id} title={`${p.sku} · ${p.name}`} disabled={busy} variant="outline" onPress={() => choose(p)} />)}
      </Card>
      {product && <Card gap={12}>
        <Text variant="headline">2. Review Inventory Context</Text><Text>{product.sku} · {product.name}</Text>
        {context ? <>
          <Text>{context.totalContainers} Containers Reported</Text>
          {Object.entries(context.containersByStatus).map(([status, count]) => <Text key={status}>{status}: {count}</Text>)}
          {context.storageLocations.map(l => <Text key={`${l.storageLocationId}-${l.levelNo}`}>{l.storageLocationCode} · Level {l.levelNo} · {l.containerCount} Containers</Text>)}
          {context.recentContainers.map(c => <Text key={c.id}>{c.barcode} · {c.status}</Text>)}
        </> : <Button title="Retry Inventory Context" loading={busy} onPress={() => choose(product)} />}
      </Card>}
      {context && <Card gap={12}>
        <Text variant="headline">3. Create Container</Text>
        <TextField label="Supplier Package Barcode (Optional)" value={supplierBarcode} onChangeText={setSupplierBarcode} editable={!busy} />
        <ChoiceField label="Warehouse For Initial Storage (Optional)" value={warehouseId} disabled={busy} onChange={id => { setWarehouseId(id); setLocationId(''); setLevel(''); }} options={warehouses.data?.items.map(w => ({ value: w.id, label: w.name })) ?? []} />
        <ChoiceField label="Initial Storage Location (Optional)" value={locationId} disabled={busy} onChange={id => { setLocationId(id); setLevel(''); }} options={[{ value: '', label: 'No Initial Storage Location' }, ...locations.data?.items.map(l => ({ value: l.id, label: `${l.code} · ${l.name}` })) ?? []]} />
        <TextField label="Initial Level (Optional)" keyboardType="number-pad" value={level} onChangeText={setLevel} editable={!busy && !!locationId} />
        <Button title="Create Container" loading={busy} onPress={receive} />
      </Card>}
    </>}
  </OperationalScreen>;
}
