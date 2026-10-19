import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { listWarehouses, listContainers, listStorageLocations } from '../../shared/api/warehouseApi';
import { getActiveMapVersion, getMapVersionDetail } from '../../shared/api/navigationApi';
import { listPublishedWorkflows, getWorkflowRequestInputSchema } from '../../shared/api/workflowApi';
import { getTransportRequest, CreateTransportRequestResponse, QueueTransportRequestResponse } from '../../shared/api/transportApi';
import { listRobots } from '../../shared/api/fleetApi';
import { executeTransportLifecycle } from './transportLifecycle';
import { useRemoteData } from '../../shared/hooks/useRemoteData';
import { useRealtime } from '../../shared/realtime';
import type { JobDetailResponse } from '../../shared/types/contracts';
import { Button, Card, ChoiceField, ErrorBanner, StatusPill, Text, TextField } from '../../shared/ui';
import { coerceWorkflowInputs } from './workflowInputs';

import { buildTransportMovements, MovementDraft } from './transportMovements';
const emptyMovement = (): MovementDraft => ({ sourceEndpointId: '', destinationEndpointId: '', destinationStorageLocationId: '', destinationLevel: '' });
export function TransportCreationScreen() {
  const { params, navigate } = useNavigation();
  const repeatId = typeof params.repeatRequestId === 'string' ? params.repeatRequestId : '';
  const catalog = useRemoteData(async () => {
    const [warehouses, workflows, repeat] = await Promise.all([listWarehouses({ isActive: true }), listPublishedWorkflows(), repeatId ? getTransportRequest(repeatId) : Promise.resolve(null)]);
    return { warehouses: warehouses.items, workflows: workflows.items, repeat };
  }, [repeatId]);
  const [warehouseId, setWarehouseId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [movements, setMovements] = useState<Record<string, MovementDraft>>({});
  const [note, setNote] = useState('');
  const [robotId, setRobotId] = useState('');
  const [request, setRequest] = useState<CreateTransportRequestResponse | null>(null);
  const [queued, setQueued] = useState<QueueTransportRequestResponse | null>(null);
  const [started, setStarted] = useState<Record<string, JobDetailResponse>>({});
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  useEffect(() => {
    if (!catalog.data) return;
    const { repeat, warehouses, workflows } = catalog.data;
    setWarehouseId(repeat?.warehouseId ?? params.warehouseId ?? warehouses[0]?.id ?? '');
    const requestedWorkflow = workflows.find(w => w.id === params.workflowId || w.code === params.workflow);
    setWorkflowId(repeat?.workflowId ?? requestedWorkflow?.id ?? workflows[0]?.id ?? '');
    setNote(repeat?.note ?? '');
    setInputs(Object.fromEntries(Object.entries(repeat?.workflowInputs ?? {}).map(([k,v]) => [k, String(v ?? '')])));
    setMovements(Object.fromEntries(repeat?.details.map(d => [d.containerId, { sourceEndpointId: '', destinationEndpointId: d.destinationEndpointId, destinationStorageLocationId: d.destinationStorageLocationId ?? '', destinationLevel: d.destinationLevelNo == null ? '' : String(d.destinationLevelNo) }]) ?? []));
    if (typeof params.containerId === 'string') setMovements(previous => ({ ...previous, [params.containerId]: emptyMovement() }));
  }, [catalog.data, params.workflowId, params.workflow, params.containerId]);
  const resources = useRemoteData(async () => {
    if (!warehouseId) return null;
    const [activeMap, containers, locations] = await Promise.all([
      getActiveMapVersion(warehouseId), listContainers({ warehouseId, eligibleOnly: true, take: 100 }),
      listStorageLocations({ warehouseId, activeOnly: true }),
    ]);
    const map = activeMap ? await getMapVersionDetail(activeMap.id) : null;
    return { map, containers: containers.items.filter(c => ['CREATED', 'PACKED', 'STORED'].includes(c.status)), locations: locations.items };
  }, [warehouseId]);
  const schema = useRemoteData(() => workflowId ? getWorkflowRequestInputSchema(workflowId) : Promise.resolve(null), [workflowId]);
  const { robotConnectivity, resyncVersion, lastJobUpdate } = useRealtime();
  const fleet = useRemoteData(() => warehouseId ? listRobots({ warehouseId, isEnabled: true }) : Promise.resolve({ items: [], total: 0 }), [warehouseId, robotConnectivity, resyncVersion, lastJobUpdate]);
  const map = resources.data?.map;
  const endpoints = map?.endpoints.filter(e => e.isEnabled) ?? [];
  const locations = resources.data?.locations ?? [];
  const containers = resources.data?.containers ?? [];
  const robots = fleet.data?.items.filter(r => r.currentMapVersionId === map?.id && r.isEnabled && r.isOnline && r.status === 'AVAILABLE') ?? [];
  const selectedIds = Object.keys(movements);
  const readonly = busy || !!request;
  const patchMovement = (id: string, patch: Partial<MovementDraft>) => setMovements(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const execute = async (run: boolean, queueOnly = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      if (!request && (!map || !schema.data || !catalog.data?.workflows.some(w => w.id === workflowId) || !catalog.data.warehouses.some(w => w.id === warehouseId))) throw new Error('Select An Active Warehouse, Published Workflow And Active Map.');
      const result = await executeTransportLifecycle({
        mode: run ? 'run' : queueOnly ? 'queue' : 'submit',
        progress: { request, queued, started }, robotId,
        createBody: () => {
          if (!map || !schema.data) throw new Error('Active Map And Workflow Input Schema Are Required.');
          const details = buildTransportMovements(movements, containers, locations, endpoints, schema.data.movementInputs);
          if (!details.length) throw new Error('Select At Least One Eligible Container.');
          return { warehouseId, mapVersionId: map.id, workflowId,
            workflowInputs: coerceWorkflowInputs(schema.data.workflowInputs, inputs), note: note.trim() || null, details };
        },
        onProgress: progress => { setRequest(progress.request); setQueued(progress.queued); setStarted(progress.started); },
        onPhase: setPhase,
      });
      setPhase(result);
      if (run) { setRobotId(''); void fleet.reload(); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Request Failed'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <OperationalScreen title="Create Transport Request" loading={catalog.loading || resources.loading || schema.loading} error={catalog.error ?? resources.error ?? schema.error ?? fleet.error}>
    <Text>Create A Request, Queue Its Jobs, Then Start A Job On A Robot.</Text>
    <ChoiceField label="Active Warehouse" value={warehouseId} disabled={readonly} options={catalog.data?.warehouses.map(w => ({ value: w.id, label: `${w.code} · ${w.name}` })) ?? []}
      onChange={id => { setWarehouseId(id); setMovements({}); setRobotId(''); }} />
    <ChoiceField label="Published Workflow" value={workflowId} disabled={readonly} options={catalog.data?.workflows.map(w => ({ value: w.id, label: `${w.name} · v${w.versionNo}` })) ?? []}
      onChange={id => { setWorkflowId(id); setInputs({}); }} />
    <Text variant="caption">Active Map: {map?.name ?? 'No Active Map Available'}</Text>
    {catalog.data?.repeat && map && catalog.data.repeat.mapVersionId !== map.id && <Text color="warningText">The Previous Request Used A Different Map. Review Every Movement Before Submitting.</Text>}
    {schema.data?.workflowInputs.map(field => field.dataType === 'BOOLEAN'
      ? <ChoiceField key={field.key} label={`${field.label}${field.required ? ' (Required)' : ''}`} value={inputs[field.key] ?? ''} options={[{ value: '', label: 'Unspecified' }, { value: 'true', label: 'True' }, { value: 'false', label: 'False' }]}
        disabled={readonly} onChange={value => setInputs(prev => ({ ...prev, [field.key]: value }))} />
      : <TextField key={field.key} label={`${field.label}${field.required ? ' (Required)' : ''}`} hint={field.description ?? field.dataType} value={inputs[field.key] ?? ''}
        keyboardType={field.dataType === 'INTEGER' || field.dataType === 'DECIMAL' ? 'numeric' : 'default'} editable={!readonly}
        onChangeText={value => setInputs(prev => ({ ...prev, [field.key]: value }))} />)}
    <Card gap={12}>
      <Text variant="headline">Eligible Containers</Text>
      {!containers.length && <Text>No Eligible Containers Reported</Text>}
      {containers.map(c => <Button key={c.id} title={`${selectedIds.includes(c.id) ? '✓ ' : ''}${c.barcode} · ${c.productSku}`} variant="outline" disabled={readonly} onPress={() => setMovements(prev => {
        const next = { ...prev }; if (next[c.id]) delete next[c.id]; else next[c.id] = emptyMovement(); return next;
      })} />)}
    </Card>
    {selectedIds.map(id => {
      const c = containers.find(c => c.id === id); const draft = movements[id];
      const sourceEndpointId = c?.currentEndpointId ?? locations.find(l => l.id === c?.currentStorageLocationId)?.endpointId;
      return <Card key={id} gap={12}>
        <Text variant="headline">{c?.barcode ?? params.barcode ?? id}</Text>
        <Text>Current Location: {c?.currentStorageLocationCode ?? endpoints.find(e => e.id === sourceEndpointId)?.name ?? 'Unspecified'}{c?.currentLevelNo != null ? ` · Level ${c.currentLevelNo}` : ''}</Text>
        {!sourceEndpointId && <ChoiceField label="Source Endpoint (Required)" disabled={readonly || !!c?.currentStorageLocationId} value={draft.sourceEndpointId} options={endpoints.map(e => ({ value: e.id, label: `${e.code} · ${e.name}` }))} onChange={value => patchMovement(id, { sourceEndpointId: value })} />}
        <ChoiceField label="Destination Endpoint" disabled={readonly} value={draft.destinationEndpointId} options={endpoints.map(e => ({ value: e.id, label: `${e.code} · ${e.name}` }))}
          onChange={value => patchMovement(id, { destinationEndpointId: value, destinationStorageLocationId: '', destinationLevel: '' })} />
        <ChoiceField label="Destination Storage Location (Optional)" disabled={readonly} value={draft.destinationStorageLocationId}
          options={[{ value: '', label: 'Endpoint Only' }, ...locations.filter(l => l.endpointId === draft.destinationEndpointId).map(l => ({ value: l.id, label: `${l.code} · ${l.name}` }))]}
          onChange={value => patchMovement(id, { destinationStorageLocationId: value })} />
        <TextField label="Destination Level (Optional)" value={draft.destinationLevel} editable={!readonly} keyboardType="number-pad" onChangeText={value => patchMovement(id, { destinationLevel: value })} />
        {!request && <Button title="Remove Container" variant="ghost" disabled={busy} onPress={() => setMovements(prev => { const next = { ...prev }; delete next[id]; return next; })} />}
      </Card>;
    })}
    <TextField label="Request Note (Optional)" value={note} onChangeText={setNote} editable={!readonly} multiline />
    <ChoiceField label="Robot For Start" value={robotId} disabled={busy} options={robots.map(r => ({ value: r.id, label: `${r.code} · ${r.batteryPercent == null ? 'No sensor' : `${r.batteryPercent}%`}` }))} onChange={setRobotId} />
    <ErrorBanner message={error} />
    {!!phase && <Text>{phase}</Text>}
    {request && <Card gap={10}><Text variant="headline">{request.requestCode}</Text><StatusPill status={queued?.status ?? request.status} />
      <Button title="View Request & Jobs" variant="outline" onPress={() => navigate('transport_history', { requestId: request.id })} />
      {queued?.jobs.map(j => <Button key={j.jobId} title={`${j.jobNo}${started[j.jobId] ? ' · Started' : ' · View Job'}`} variant="outline" onPress={() => navigate('job_detail', { jobId: j.jobId })} />)}
    </Card>}
    {!request && <Button title="Submit Request" loading={busy} disabled={!map || !schema.data || !!resources.error || !!schema.error} onPress={() => execute(false)} />}
    {!queued && request && <Button title="Queue Request" loading={busy} onPress={() => execute(false, true)} />}
    <Button title={request ? 'Queue & Start Next Job' : 'Submit & Run on Robot'} loading={busy} disabled={!map || !schema.data || !robotId || !!resources.error || !!schema.error || !!fleet.error || !robots.some(r => r.id === robotId) || (!!queued && queued.jobs.every(j => !!started[j.jobId]))} onPress={() => execute(true)} />
    <Text variant="caption">Starting Sends A Real Robot Command. Additional Jobs Stay Created Until A Robot Is Available.</Text>
  </OperationalScreen>;
}
