import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, CheckCircle2, ChevronRight, MapPin, Package, ScanLine, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, EmptyState, SegmentedControl, Text, TextField } from '../../shared/ui';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import {
  getContainer, getContainerByBarcode, getMapVersionDetail, getOperatingContext, getTransportRequest,
  getWorkflowRequestInputSchema, listContainers, listPublishedWorkflows, listStorageLocations,
  listTransportRequests, queueTransportRequest,
  type ContainerListItem, type QueueTransportRequestResponse, type CreateTransportRequestResponse,
} from '../../shared/api';
import { parseStaffInputs, staffInputDefaults } from './dispatchData';
import { submitDispatch } from './dispatchSubmission';
import { TransportPlaceSheet } from './TransportPlaceSheet';
import { activeContainerIds, containerOrigin, containerReadiness, mappedLocations, movementDetail,
  stationPoints, transportDestinations, transportFlow, type TransportPlace } from './transportDraft';
import { DraftInputError, validateMovementFields } from './transportDraft';
import { getUserErrorMessage } from '../../shared/api/client';

const workflowNames: Record<string, string> = {
  INBOUND_PUTAWAY: 'Inbound Putaway', OUTBOUND_RETRIEVAL: 'Outbound Retrieval', INTERNAL_RELOCATION: 'Internal Relocation',
  POINT_TO_POINT_TRANSPORT: 'Point To Point', REPLENISHMENT: 'Replenishment',
};
type ViewFilter = 'ready' | 'all' | 'location';
type Picker = { kind: 'receiving' | 'origin' | 'destination' | 'bulk'; containerId?: string } | null;

async function loadContext(repeatId: string, barcodes: string[]) {
  const [workflows, previous] = await Promise.all([listPublishedWorkflows(), repeatId ? getTransportRequest(repeatId) : Promise.resolve(null)]);
  const operating = await getOperatingContext(previous?.warehouseId);
  const [containers, locations, map, requests] = await Promise.all([
    listContainers({ warehouseId: operating.warehouse.id, eligibleOnly: false, take: 500 }),
    listStorageLocations({ warehouseId: operating.warehouse.id, activeOnly: true }), getMapVersionDetail(operating.map.id),
    listTransportRequests({ take: 200 }),
  ]);
  const extraResults = await Promise.allSettled([
    ...barcodes.filter(code => !containers.items.some(item => item.barcode === code)).map(getContainerByBarcode),
    ...(previous?.details ?? []).filter(line => !containers.items.some(item => item.id === line.containerId)).map(line => getContainer(line.containerId)),
  ]);
  const extras = extraResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const prefillWarning = extraResults.some(result => result.status === 'rejected') ? 'Some containers from the previous selection are no longer available. Review the current list.' : null;
  return { prefillWarning, ...operating, map, workflows: workflows.items, previous, locations: locations.items,
    containers: [...new Map([...containers.items, ...extras].map(item => [item.id, item])).values()],
    containerTotal: containers.total, requests: requests.items, requestsIncomplete: requests.total > requests.items.length };
}

export function TransportCreationScreen() {
  const { navigate, goBack, params } = useNavigation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const repeatId = typeof params?.repeatRequestId === 'string' ? params.repeatRequestId : '';
  const barcodesKey = JSON.stringify(Array.isArray(params?.containers) ? params.containers.filter((code: unknown) => typeof code === 'string') : typeof params?.container === 'string' ? [params.container] : []);
  const context = useQuery({ queryKey: ['dispatch-context', session?.id, repeatId, barcodesKey],
    queryFn: () => loadContext(repeatId, JSON.parse(barcodesKey) as string[]), retry: false, staleTime: 0 });
  const data = context.data;
  const [workflowId, setWorkflowId] = useState('');
  const [pickingWorkflow, setPickingWorkflow] = useState(!params?.workflow && !repeatId);
  const [selected, setSelected] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [staffInputs, setStaffInputs] = useState<Record<string, string>>({});
  const [receivingId, setReceivingId] = useState('');
  const [originFilter, setOriginFilter] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('ready');
  const [query, setQuery] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [extraContainers, setExtraContainers] = useState<ContainerListItem[]>([]);
  const [picker, setPicker] = useState<Picker>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [receipt, setReceipt] = useState<{ created: CreateTransportRequestResponse; queued: QueueTransportRequestResponse | null; queueError: string | null } | null>(null);
  const commandLock = useRef(false);
  const listRef = useRef<FlatList<ContainerListItem>>(null);
  const routeKey = `${repeatId}:${barcodesKey}:${params?.workflow || ''}`;
  const liveScope = useRef('');
  liveScope.current = `${routeKey}:${workflowId}:${data?.map.id || ''}:${receivingId}`;
  const initialized = useRef('');
  const restoredInputs = useRef('');
  const workflows = data?.workflows ?? [];
  const workflow = workflows.find(item => item.id === workflowId);
  const flow = transportFlow(workflow?.code || '');
  const mapId = data?.map.id || '';
  const endpoints = data?.map.endpoints ?? [];
  const locations = useMemo(() => mappedLocations(data?.locations ?? [], endpoints, data?.warehouse.id || '', mapId), [data, endpoints, mapId]);
  const receivingPoints = useMemo(() => stationPoints(endpoints, mapId, 'INBOUND'), [endpoints, mapId]);
  const receivingPoint = receivingPoints.find(item => item.endpointId === receivingId) ?? (receivingPoints.length === 1 ? receivingPoints[0] : undefined);
  const places = useMemo(() => transportDestinations(flow, locations, endpoints, mapId), [flow, locations, endpoints, mapId]);
  useEffect(() => { const timer = setTimeout(() => setServerSearch(query.trim()), 250); return () => clearTimeout(timer); }, [query]);
  const searchResults = useQuery({ queryKey: ['dispatch-container-search', session?.id, data?.warehouse.id, mapId, serverSearch],
    queryFn: () => listContainers({ warehouseId: data!.warehouse.id, search: serverSearch, eligibleOnly: false, take: 100 }),
    enabled: !!data && serverSearch.length >= 2 && !pickingWorkflow, retry: false });
  const containers = useMemo(() => {
    const base = data?.containers ?? [];
    const found = serverSearch === query.trim() ? searchResults.data?.items ?? [] : [];
    // A cached search must not restore a stale source after the main list refreshes.
    const snapshots = searchResults.dataUpdatedAt >= context.dataUpdatedAt ? [...base, ...found] : [...found, ...base];
    return [...new Map([...snapshots, ...extraContainers].map(item => [item.id, item])).values()];
  }, [data, extraContainers, searchResults.data, searchResults.dataUpdatedAt, context.dataUpdatedAt, serverSearch, query]);
  useEffect(() => {
    if (data) setExtraContainers(previous => previous.filter(item => !data.containers.some(current => current.id === item.id)));
  }, [data]);
  useEffect(() => { if (error) listRef.current?.scrollToOffset({ offset: 0, animated: false }); }, [error]);
  const held = useMemo(() => activeContainerIds(data?.requests ?? []), [data]);
  const sourceOf = (container: ContainerListItem) => containerOrigin(container, locations, endpoints, mapId);
  const reasonFor = (container: ContainerListItem) => containerReadiness(container, flow, sourceOf(container), held,
    receivingPoint ? [receivingPoint.endpointId] : []);
  const schema = useQuery({ queryKey: ['dispatch-schema', workflowId], queryFn: () => getWorkflowRequestInputSchema(workflowId), enabled: !!workflowId, retry: false });

  useEffect(() => {
    setReceipt(null); setError(null); setSelected([]); setDestinations({}); setStaffInputs({});
    setReceivingId(''); setOriginFilter(''); setViewFilter('ready'); setQuery(''); setExtraContainers([]);
    setPicker(null); setFiltersOpen(false); setScannerOpen(false); restoredInputs.current = '';
  }, [routeKey]);

  useEffect(() => {
    if (!data || initialized.current === routeKey) return;
    initialized.current = routeKey;
    const wanted = String(data.previous?.workflowId || params?.workflow || '').toLowerCase();
    const matched = data.workflows.find(item => [item.id, item.code, item.name].some(value => value.toLowerCase() === wanted));
    setWorkflowId(matched?.id || '');
    setPickingWorkflow(!matched);
    if (wanted && !matched) setError('This workflow is not published. Choose an available workflow.');
    const initial = data.previous ? data.previous.details.filter(line => data.containers.some(item => item.id === line.containerId)).map(line => line.containerId)
      : data.containers.filter(item => (JSON.parse(barcodesKey) as string[]).includes(item.barcode)).map(item => item.id);
    setSelected(initial);
    if (matched?.code === 'INBOUND_PUTAWAY' && data.previous) {
      const sources = [...new Set(data.previous.details.map(line => line.sourceEndpointId))];
      if (sources.length === 1 && stationPoints(data.map.endpoints, data.map.id, 'INBOUND').some(point => point.endpointId === sources[0])) setReceivingId(sources[0]);
    }
  }, [data, routeKey, params?.workflow, barcodesKey]);

  useEffect(() => {
    if (!schema.data || !data?.previous || schema.data.workflowId !== data.previous.workflowId) return;
    const restoreKey = `${routeKey}:${schema.data.workflowId}`;
    if (restoredInputs.current === restoreKey) return;
    restoredInputs.current = restoreKey;
    setStaffInputs(staffInputDefaults(schema.data.workflowInputs, data.previous.workflowInputs));
    const restored: Record<string, string> = {};
    for (const line of data.previous.details) {
      const place = places.find(item => item.endpointId === line.destinationEndpointId && item.locationId === line.destinationStorageLocationId);
      if (place) restored[line.containerId] = place.id;
    }
    setDestinations(previous => ({ ...restored, ...previous }));
  }, [schema.data, data?.previous, places, routeKey]);

  const selectedItems = containers.filter(item => selected.includes(item.id));
  const destinationFor = (container: ContainerListItem) => places.find(place => place.id === destinations[container.id])
    ?? (flow === 'outbound' && places.length === 1 ? places[0] : undefined);
  const needsLocationCount = containers.filter(item => !sourceOf(item)).length;
  const origins = [...new Map(containers.flatMap(item => { const origin = sourceOf(item); return origin ? [[origin.id, origin] as const] : []; })).values()];
  const visible = containers.filter(item => {
    if (selected.includes(item.id)) return true;
    const reason = reasonFor(item);
    if (viewFilter === 'ready' && reason) return false;
    if (viewFilter === 'location' && sourceOf(item)) return false;
    if (originFilter && sourceOf(item)?.id !== originFilter) return false;
    return `${item.barcode} ${item.productSku} ${item.productName} ${sourceOf(item)?.code || ''}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)) || Number(!!reasonFor(a)) - Number(!!reasonFor(b)) || a.barcode.localeCompare(b.barcode));

  const chooseWorkflow = (id: string) => {
    setWorkflowId(id); setPickingWorkflow(false); setSelected([]); setDestinations({}); setStaffInputs({});
    setReceivingId(''); setOriginFilter(''); setViewFilter('ready'); setQuery(''); setError(null);
  };
  const toggle = (container: ContainerListItem) => {
    if (pending || scanning) return;
    const reason = reasonFor(container);
    if (reason) { setError(`${container.barcode}: ${reason}. Check its receiving location and request status.`); return; }
    setError(null);
    setExtraContainers(previous => [...previous.filter(item => item.id !== container.id), container]);
    setSelected(previous => previous.includes(container.id) ? previous.filter(id => id !== container.id) : [...previous, container.id]);
  };
  const lookupBarcode = async (barcode: string) => {
    const scope = liveScope.current;
    setScannerOpen(false); setScanning(true); setError(null);
    try {
      const container = await getContainerByBarcode(barcode);
      if (liveScope.current !== scope) return;
      setExtraContainers(previous => [...previous.filter(item => item.id !== container.id), container]);
      const reason = reasonFor(container);
      if (reason) { setViewFilter('all'); setQuery(container.barcode); throw new DraftInputError(`${container.barcode}: ${reason}. Check its location and request status before dispatch.`); }
      setSelected(previous => [...new Set([...previous, container.id])]); setQuery('');
    } catch (failure) { if (liveScope.current === scope) setError(failure instanceof DraftInputError ? failure.message : getUserErrorMessage(failure, 'Container could not be loaded. Try again.')); }
    finally { setScanning(false); }
  };
  const submit = async () => {
    if (commandLock.current || !data || !workflow || !schema.data) return;
    commandLock.current = true; setPending(true); setError(null);
    const scope = liveScope.current;
    try {
      if (!selectedItems.length || selectedItems.length !== selected.length) throw new DraftInputError('Select at least one current container.');
      if (schema.data.workflowId !== workflow.id) throw new DraftInputError('Wait for the workflow inputs to load.');
      let workflowInputs: Record<string, unknown>;
      try { workflowInputs = parseStaffInputs(schema.data.workflowInputs, staffInputs); }
      catch (failure) { throw new DraftInputError(failure instanceof Error ? failure.message : 'Review the workflow fields.'); }
      for (const item of selectedItems) {
        const reason = reasonFor(item);
        if (reason) throw new DraftInputError(`${item.barcode}: ${reason}. Review this container before creating a request.`);
      }
      const details = selectedItems.map((item, index) => movementDetail(item, sourceOf(item), destinationFor(item), index + 1));
      validateMovementFields(schema.data.movementInputs, details);
      const result = await submitDispatch({ warehouseId: data.warehouse.id, mapVersionId: mapId, workflowId: workflow.id, workflowInputs, details }, true);
      if (liveScope.current === scope) setReceipt(result);
    } catch (failure) { if (liveScope.current === scope) setError(failure instanceof DraftInputError ? failure.message : getUserErrorMessage(failure, 'Request could not be created. Your selections are kept.')); }
    finally { commandLock.current = false; setPending(false); }
  };
  const retryQueue = async () => {
    if (!receipt || commandLock.current) return;
    commandLock.current = true; setPending(true);
    const id = receipt.created.id;
    try {
      const queued = await queueTransportRequest(id);
      setReceipt(previous => previous?.created.id === id ? { ...previous, queued, queueError: null } : previous);
    } catch (failure) { setReceipt(previous => previous?.created.id === id ? { ...previous, queueError: getUserErrorMessage(failure, 'Queueing failed. Try again.') } : previous); }
    finally { commandLock.current = false; setPending(false); }
  };

  if (!data) return <View style={styles.root}>
    <SubScreenHeader title="New Request" onBack={goBack} />
    <EmptyState title={context.error || context.isPaused ? 'Request Setup Unavailable' : 'Loading Request Setup…'}
      message={context.error?.message || (context.isPaused ? 'Reconnect to load the warehouse and published workflows.' : 'Loading the warehouse and published workflows.')} actionTitle={context.error || context.isPaused ? 'Retry' : undefined}
      onAction={() => { void context.refetch(); }} />
  </View>;

  if (receipt) return <View style={styles.root}>
    <SubScreenHeader title={receipt.queued ? 'Request Queued' : 'Queueing Incomplete'} onBack={goBack} />
    <ScrollView contentContainerStyle={[styles.receipt, { paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View style={styles.receiptIcon}><CheckCircle2 size={28} color={receipt.queued ? colors.successText : colors.warningText} /></View>
      <Text variant="title" selectable>{receipt.created.requestCode}</Text>
      <Text variant="body">{receipt.created.details.length} {receipt.created.details.length === 1 ? 'Container' : 'Containers'} · {receipt.queued ? 'Queued' : 'Created, Not Yet Queued'}</Text>
      {receipt.queueError && <View style={styles.notice}><Text variant="body" color={colors.dangerText}>{receipt.queueError}</Text>
        <Text variant="caption">Your request is saved. Retry queueing this request to avoid creating a duplicate.</Text>
        <Button title="Retry Queue" onPress={retryQueue} loading={pending} /></View>}
      {receipt.queued && <Text variant="body" color={colors.textSecondary}>{receipt.queued.jobs.length} {receipt.queued.jobs.length === 1 ? 'Job' : 'Jobs'} created. The server assigns a robot when a Job is started.</Text>}
      <Button title="View Request" onPress={() => navigate('transport_detail', { requestId: receipt.created.id })} disabled={pending} fullWidth />
      <Button title="Back To Transport" variant="outline" onPress={() => navigate('transport')} disabled={pending} fullWidth />
    </ScrollView>
  </View>;

  const pickerContainer = containers.find(item => item.id === picker?.containerId);
  const pickerSource = pickerContainer ? sourceOf(pickerContainer) : null;
  const pickerOptions = picker?.kind === 'receiving' ? receivingPoints : picker?.kind === 'origin' ? origins
    : places.filter(place => picker?.kind === 'bulk' ? selectedItems.every(item => sourceOf(item)?.endpointId !== place.endpointId) : place.endpointId !== pickerSource?.endpointId);
  const onPick = (place: TransportPlace) => {
    if (picker?.kind === 'receiving') { setReceivingId(place.endpointId); setSelected([]); setDestinations({}); }
    else if (picker?.kind === 'origin') setOriginFilter(place.id);
    else if (picker?.kind === 'bulk') setDestinations(previous => ({ ...previous, ...Object.fromEntries(selected.map(id => [id, place.id])) }));
    else if (picker?.containerId) setDestinations(previous => ({ ...previous, [picker.containerId!]: place.id }));
    setPicker(null); setError(null);
  };
  const title = pickingWorkflow ? 'New Request' : workflowNames[workflow?.code || ''] || workflow?.name || 'Choose Workflow';
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <SubScreenHeader title={title} label={pickingWorkflow ? 'Transport' : 'Select Containers'} onBack={() => {
      if (pending) return;
      if (!pickingWorkflow && !params?.workflow && !repeatId) setPickingWorkflow(true); else goBack();
    }} rightAction={!pickingWorkflow ? <Pressable style={styles.iconButton} disabled={pending} onPress={() => setPickingWorkflow(true)}
      accessibilityRole="button" accessibilityLabel="Change workflow"><Package size={19} color={colors.textSecondary} /></Pressable> : undefined} />
    {pickingWorkflow ? <ScrollView contentContainerStyle={styles.content}>
      <Text variant="caption">{data.warehouse.name}</Text>
      {error && <Text variant="body" color={colors.dangerText}>{error}</Text>}
      {workflows.length === 0 && <EmptyState title="No Published Workflows" message="Ask the supervisor to publish a workflow for this warehouse." />}
      {workflows.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Select workflow ${item.name}`}
        onPress={() => chooseWorkflow(item.id)} style={({ pressed }) => [styles.workflowRow, pressed && styles.pressed]}>
        <View style={styles.workflowIcon}><Package size={20} color={colors.primaryText} /></View>
        <View style={styles.flex}><Text variant="headline">{workflowNames[item.code] || item.name}</Text>
          <Text variant="caption">{item.code === 'INBOUND_PUTAWAY' ? 'Receiving → Storage' : item.code === 'OUTBOUND_RETRIEVAL' ? 'Storage → Shipping' : item.code === 'INTERNAL_RELOCATION' ? 'Move Between Storage Locations' : 'Use Published Workflow'}</Text></View>
        <ChevronRight size={18} color={colors.textMuted} />
      </Pressable>)}
    </ScrollView> : <>
      <View style={styles.contextRow}><MapPin size={14} color={colors.textMuted} />
        <Text variant="caption" style={styles.flex}>{data.warehouse.name}</Text>
        {flow === 'inbound' && <Pressable onPress={() => setPicker({ kind: 'receiving' })} style={styles.contextControl} accessibilityRole="button"
          accessibilityLabel="Change receiving point" disabled={pending}>
          <Text variant="caption" color={colors.primaryText}>{receivingPoint?.label || 'Choose Receiving Point'}</Text><ChevronRight size={14} color={colors.primaryText} />
        </Pressable>}
      </View>
      <FlatList ref={listRef} data={flow === 'unsupported' ? [] : visible} keyExtractor={item => item.id} style={styles.flex} keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={context.isRefetching} onRefresh={() => { void context.refetch(); }} tintColor={colors.primary} />}
        ListHeaderComponent={<View style={styles.listHeader}>
          <View style={styles.searchRow}><TextField value={query} onChangeText={setQuery} accessibilityLabel="Search containers"
            placeholder="Barcode or product" autoCorrect={false} autoCapitalize="none" showClearButton containerStyle={styles.flex}
            leftIcon={<Search size={18} color={colors.textMuted} />} />
            <Pressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Scan container barcode" onPress={() => setScannerOpen(true)} disabled={pending || scanning}><ScanLine size={20} color={colors.textPrimary} /></Pressable>
            <Pressable style={[styles.iconButton, (viewFilter !== 'ready' || !!originFilter) && styles.activeFilter]} accessibilityRole="button" accessibilityLabel="Filter containers" onPress={() => setFiltersOpen(true)}><SlidersHorizontal size={19} color={colors.textPrimary} /></Pressable>
          </View>
          {(context.error || schema.error || error) && <View style={styles.notice} accessibilityRole="alert">
            <Text variant="body" color={colors.dangerText}>{error || schema.error?.message || context.error?.message}</Text>
            {(context.error || schema.error) && <Button title="Retry" variant="outline" size="sm" onPress={() => { void context.refetch(); void schema.refetch(); }} />}
          </View>}
          {serverSearch.length >= 2 && searchResults.isFetching && <Text variant="caption">Searching Catalog…</Text>}
          {searchResults.error && serverSearch === query.trim() && <View style={styles.notice}><Text variant="caption">Search could not be refreshed. Showing loaded containers.</Text><Button title="Retry Search" size="sm" variant="outline" onPress={() => { void searchResults.refetch(); }} /></View>}
          {schema.isLoading && <Text variant="caption">Loading Workflow Fields…</Text>}
          {data.prefillWarning && <Text variant="caption" color={colors.warningText}>{data.prefillWarning}</Text>}
          {flow === 'unsupported' && <View style={styles.notice}><Text variant="body">Routing for this workflow needs server configuration. Select another published workflow.</Text></View>}
          {flow === 'inbound' && !receivingPoint && <Text variant="caption" color={colors.warningText}>A receiving point must be configured or selected before choosing containers.</Text>}
          {data.requestsIncomplete && <Text variant="caption" color={colors.warningText}>Some request allocations were not returned. The server will check availability when you create.</Text>}
          {data.containerTotal > data.containers.length && <Text variant="caption">Showing {data.containers.length} of {data.containerTotal} containers. Scan an exact barcode to look up another.</Text>}
          {schema.data?.workflowInputs.map(field => field.dataType === 'BOOLEAN' ? <View key={field.key} style={{ gap: 6 }}>
            <Text variant="label">{field.label}{field.required ? ' *' : ''}</Text><SegmentedControl options={[{ label: 'Yes', value: 'true' }, { label: 'No', value: 'false' }]}
              value={staffInputs[field.key] || ''} onChange={value => { if (!pending) setStaffInputs(previous => ({ ...previous, [field.key]: value })); }} accessibilityLabel={field.label} />
          </View> : <TextField key={field.key} label={`${field.label || field.key}${field.required ? ' *' : ''}`} hint={field.description || undefined}
            value={staffInputs[field.key] || ''} onChangeText={value => setStaffInputs(previous => ({ ...previous, [field.key]: value }))} editable={!pending}
            keyboardType={field.dataType === 'INTEGER' || field.dataType === 'DECIMAL' ? 'numeric' : 'default'} />)}
          {!places.length && flow !== 'unsupported' && <View style={styles.setupNote}><Text variant="caption" color={colors.warningText}>
            {flow === 'outbound' ? 'No outbound point is configured on this map.' : 'No valid storage destinations are configured on this map.'}
          </Text></View>}
          <View style={styles.sectionRow}><Text variant="label">{viewFilter === 'location' ? 'Needs Receiving' : viewFilter === 'all' ? 'All Containers' : flow === 'inbound' ? 'At Receiving Point' : 'Containers'} · {visible.length}</Text>
            {selected.length > 0 && <Pressable style={styles.smallAction} onPress={() => setPicker({ kind: 'bulk' })} accessibilityRole="button" disabled={pending}>
              <Text variant="caption" color={colors.primaryText}>Set Destination</Text></Pressable>}
          </View>
        </View>}
        renderItem={({ item }) => {
          const reason = reasonFor(item); const isSelected = selected.includes(item.id); const origin = sourceOf(item); const destination = destinationFor(item);
          return <View style={[styles.containerCard, isSelected && styles.selectedCard]}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={`${item.barcode}, ${item.productName}${reason ? `, ${reason}` : ''}`}
              accessibilityState={{ checked: isSelected, disabled: !!reason || pending }} disabled={!!reason || pending} onPress={() => toggle(item)}
              style={({ pressed }) => [styles.containerRow, pressed && styles.pressed]}>
              <View style={[styles.checkbox, isSelected && styles.checked, !!reason && { backgroundColor: colors.surfaceMuted }]}>{isSelected && <Check size={14} color={colors.textInverse} />}</View>
              <View style={styles.flex}><Text variant="bodyMedium" style={styles.barcode} selectable>{item.barcode}</Text>
                <Text variant="caption" numberOfLines={1}>{item.productName || item.productSku || 'Product Unavailable'}</Text>
              </View>
              {!!reason && <Text variant="caption" color={colors.warningText} style={styles.reason}>{reason === 'Already In A Request' ? 'In Request' : reason.includes('Location') ? 'Needs Location' : reason}</Text>}
            </Pressable>
            {isSelected && <View style={styles.expanded}>
              <Text variant="caption">From {origin?.code || 'Location Unavailable'}{item.currentLevelNo ? ` · Level ${item.currentLevelNo}` : ''}</Text>
              {!!reason && <Text variant="caption" color={colors.dangerText}>{reason}. Remove this container before submitting.</Text>}
              <Pressable onPress={() => setPicker({ kind: 'destination', containerId: item.id })} disabled={pending}
                accessibilityRole="button" accessibilityLabel={`Choose destination for ${item.barcode}`} style={styles.destinationRow}>
                <MapPin size={15} color={colors.primaryText} /><View style={styles.flex}><Text variant="caption">Deliver To</Text>
                  <Text variant="bodyMedium" color={destination ? colors.textPrimary : colors.primaryText}>{destination?.label || 'Choose Location'}</Text></View>
                <ChevronRight size={17} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => setSelected(previous => previous.filter(id => id !== item.id))} style={styles.smallAction} accessibilityRole="button" accessibilityLabel={`Remove ${item.barcode}`} disabled={pending}><Text variant="caption" color={colors.textSecondary}>Remove</Text></Pressable>
            </View>}
          </View>;
        }} ListEmptyComponent={<EmptyState compact icon={Package} title={query ? 'No Matching Containers' : flow === 'unsupported' ? 'Routing Setup Required' : viewFilter === 'ready' ? 'No Containers At This Location' : 'No Containers'}
          message={query ? 'Try another search or scan the exact barcode.' : needsLocationCount ? `${needsLocationCount} containers need a known receiving location before transport.` : 'Refresh to check for newly received containers.'}
          actionTitle={query ? 'Clear Search' : needsLocationCount && viewFilter === 'ready' ? 'View Containers Needing Receiving' : undefined}
          onAction={() => { if (query) setQuery(''); else setViewFilter('location'); }} />}
        ListFooterComponent={viewFilter === 'location' && needsLocationCount ? <View style={styles.setupNote}>
          <Text variant="caption">These existing containers need a recorded location before dispatch. Check Inventory or ask the supervisor to complete their receiving records.</Text>
          <Button title="View Inventory" variant="outline" size="sm" onPress={() => navigate('inventory_lookup')} />
        </View> : null} />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sectionRow}><Text variant="bodyMedium">{selected.length} Selected</Text>
          {selectedItems.some(item => !destinationFor(item)) && <Text variant="caption" color={colors.warningText}>{selectedItems.filter(item => !destinationFor(item)).length} Need Destination</Text>}
        </View>
        <Button title="Create Request" onPress={submit} fullWidth loading={pending}
          disabled={!workflow || !schema.data || schema.data.workflowId !== workflowId || !!schema.error || !selected.length || !places.length || flow === 'unsupported' || scanning || context.isFetching || context.isError || selectedItems.some(item => !!reasonFor(item))} />
      </View>
    </>}
    {picker && <TransportPlaceSheet title={picker.kind === 'receiving' ? 'Receiving Point' : picker.kind === 'origin' ? 'Pickup Location' : 'Deliver To'}
      options={pickerOptions} onSelect={onPick} onClose={() => setPicker(null)}
      selectedId={pickerContainer ? destinationFor(pickerContainer)?.id : picker.kind === 'receiving' ? receivingPoint?.id : originFilter}
      emptyMessage="No matching locations are configured on this map. Ask the supervisor to check the location mapping." />}
    {filtersOpen && <BottomSheet onClose={() => setFiltersOpen(false)} accessibilityLabel="Container Filters" autoHeight>
      <View style={styles.content}><View style={styles.sectionRow}><Text variant="headline">Filters</Text><Pressable onPress={() => setFiltersOpen(false)} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Close filters"><X size={20} color={colors.textPrimary} /></Pressable></View>
        {([['ready', 'At Valid Sources'], ['location', `Needs Receiving (${needsLocationCount})`], ['all', 'All Containers']] as const).map(([value, label]) => <Pressable key={value} style={styles.filterRow} accessibilityRole="radio" accessibilityState={{ checked: viewFilter === value }} onPress={() => setViewFilter(value)}>
          <Text variant="bodyMedium">{label}</Text>{viewFilter === value && <Check size={18} color={colors.primaryText} />}</Pressable>)}
        {flow !== 'inbound' && <Button title={originFilter ? `Pickup: ${origins.find(item => item.id === originFilter)?.code || 'Selected'}` : 'Filter Pickup Location'} variant="outline" onPress={() => { setFiltersOpen(false); setPicker({ kind: 'origin' }); }} />}
        <View style={styles.sectionRow}><Button title="Reset" variant="ghost" onPress={() => { setViewFilter('ready'); setOriginFilter(''); }} /><Button title="Done" onPress={() => setFiltersOpen(false)} /></View>
      </View>
    </BottomSheet>}
    {scannerOpen && <BarcodeScannerHUD visible onClose={() => setScannerOpen(false)} onScanResult={barcode => { void lookupBarcode(barcode); }} />}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1, minWidth: 0 },
  content: { padding: 20, gap: 16 }, list: { paddingHorizontal: 16, paddingBottom: 20 }, listHeader: { gap: 14, paddingBottom: 10 },
  contextRow: { paddingHorizontal: 18, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  contextControl: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, flexShrink: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, iconButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, backgroundColor: colors.surface },
  activeFilter: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primaryBorder },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  containerCard: { borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8, overflow: 'hidden' },
  selectedCard: { borderColor: colors.primaryBorder }, containerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, minHeight: 70 },
  checkbox: { height: 20, width: 20, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: colors.primaryText, borderColor: colors.primaryText }, barcode: { fontVariant: ['tabular-nums'] },
  reason: { flexShrink: 0, maxWidth: 92, textAlign: 'right', fontSize: 12 },
  expanded: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 }, destinationRow: { minHeight: 58, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  smallAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  footer: { backgroundColor: colors.surface, paddingHorizontal: 20, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  notice: { padding: 12, borderRadius: radii.md, backgroundColor: colors.dangerBg, gap: 10 }, setupNote: { padding: 12, borderRadius: radii.md, backgroundColor: colors.warningBg, gap: 10 },
  workflowRow: { padding: 16, minHeight: 84, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14 },
  workflowIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSubtle },
  filterRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, pressed: { backgroundColor: colors.surfaceSubtle },
  receipt: { padding: 24, alignItems: 'center', gap: 20 }, receiptIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' },
});
