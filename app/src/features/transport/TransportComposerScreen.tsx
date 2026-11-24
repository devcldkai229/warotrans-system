import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, ArrowRight, Box, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, List, Map as MapIcon, MapPin, Minus, Package, Plus, ScanLine, Search, Warehouse } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ReceivingProductPicker } from '../inventory/ReceivingProductPicker';
import { voucherDate } from '../inventory/stockVoucherData';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, EmptyState, SegmentedControl, Text, TextField } from '../../shared/ui';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import {
  getContainerByBarcode, getMapVersionDetail, getOperatingContext, getTransportRequest, getWorkflowRequestInputSchema,
  listContainers, listPublishedWorkflows, listStorageLocations, listTransportRequests, previewOutboundPick,
  type ContainerListItem, type CreateTransportRequestResponse, type OutboundPickResponse, type ProductItem, type QueueTransportRequestResponse,
} from '../../shared/api';
import { ApiError, getUserErrorMessage } from '../../shared/api/client';
import { MapViewport } from '../../shared/maps/MapViewport';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { t } from '../../shared/i18n';
import { triggerHaptic } from '../../shared/utils/haptics';
import { parseStaffInputs } from './dispatchData';
import { submitDispatch } from './dispatchSubmission';
import { startQueuedJobs, type JobStartResult } from './startQueuedJobs';
import { activeContainerIds, outboundFifoScopeKey, parseOutboundFifoCount } from './transportDraft';
import {
  allowedPlaces, buildDetails, composerPlaces, defaultDestination, defaultSource, groupContainers, ineligibleReason, movementProblem,
  outboundGates, outboundMovementProblem, placeForEndpoint, searchPlaces, suggestedPlaces, workflowKindOf,
  type ComposerPlace, type Movement, type WorkflowKind,
} from './composerData';

type Step = 'containers' | 'places' | 'review';
type PickTarget = { end: 'source' | 'destination'; containerId: string | null } | null;

const KIND_TITLE: Record<WorkflowKind, string> = {
  INBOUND: 'Put away received containers', OUTBOUND: 'Bring containers to shipping', INTERNAL: 'Move containers between shelves', OTHER: 'Move containers',
};
const KIND_HINT: Record<WorkflowKind, string> = {
  INBOUND: 'Containers on a confirmed receiving voucher that are not on a shelf yet.',
  OUTBOUND: 'Containers currently stored on a shelf.',
  INTERNAL: 'Containers that are on a shelf now.',
  OTHER: 'Containers ready for transport.',
};

async function loadComposer(repeatId: string, barcodes: string[]) {
  const [workflows, previous] = await Promise.all([listPublishedWorkflows(), repeatId ? getTransportRequest(repeatId) : Promise.resolve(null)]);
  const operating = await getOperatingContext(previous?.warehouseId);
  const [containers, locations, map, requests] = await Promise.all([
    listContainers({ warehouseId: operating.warehouse.id, eligibleOnly: false, take: 500 }),
    listStorageLocations({ warehouseId: operating.warehouse.id, activeOnly: true }),
    getMapVersionDetail(operating.map.id),
    listTransportRequests({ take: 200 }),
  ]);
  const missing = barcodes.filter(code => !containers.items.some(item => item.barcode === code));
  const extra = (await Promise.allSettled(missing.map(code => getContainerByBarcode(code)))).flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  return { ...operating, map, previous, workflows: workflows.items, containers: [...containers.items, ...extra], locations: locations.items, held: activeContainerIds(requests.items) };
}

export function TransportComposerScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { navigate, goBack, params } = useNavigation();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const repeatId = typeof params?.repeatRequestId === 'string' ? params.repeatRequestId : '';
  // "Move" on a shelved container or "Dispatch" on a voucher: the containers come with the route and are preselected.
  const routeBarcodes = useMemo(() => (Array.isArray(params?.containers) ? params.containers : typeof params?.container === 'string' ? [params.container] : [])
    .filter((code: unknown): code is string => typeof code === 'string' && !!code.trim()), [params?.containers, params?.container]);
  const routeKey = routeBarcodes.join('|');
  const context = useQuery({ queryKey: ['composer-context', session?.id, repeatId, routeKey], queryFn: () => loadComposer(repeatId, routeBarcodes), retry: false, staleTime: 0 });
  const prefilled = useRef('');
  const data = context.data;
  const [workflowId, setWorkflowId] = useState('');
  const [workflowSheet, setWorkflowSheet] = useState(false);
  const [step, setStep] = useState<Step>('containers');
  const [selected, setSelected] = useState<string[]>([]);
  const [movements, setMovements] = useState<Record<string, Movement>>({});
  const [query, setQuery] = useState('');
  const [scanner, setScanner] = useState(false);
  const [pick, setPick] = useState<PickTarget>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [startNow, setStartNow] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ created: CreateTransportRequestResponse; queued: QueueTransportRequestResponse | null; queueError: string | null; started: JobStartResult[] } | null>(null);
  const [extra, setExtra] = useState<ContainerListItem[]>([]);
  const [outboundMode, setOutboundMode] = useState<'fifo' | 'manual'>(() => (repeatId || routeBarcodes.length ? 'manual' : 'fifo'));
  const [outboundGate, setOutboundGate] = useState<ComposerPlace | null>(null);
  const [gatePickerOpen, setGatePickerOpen] = useState(false);
  const [fifoProduct, setFifoProduct] = useState<ProductItem | null>(null);
  const [fifoCountText, setFifoCountText] = useState('1');
  const [fifoProductPicker, setFifoProductPicker] = useState<{ barcode: string | null } | null>(null);
  const [fifoScannerOpen, setFifoScannerOpen] = useState(false);
  const [fifoPreview, setFifoPreview] = useState<OutboundPickResponse | null>(null);
  const [fifoPreviewScope, setFifoPreviewScope] = useState('');
  const [fifoLoading, setFifoLoading] = useState(false);
  const [fifoError, setFifoError] = useState<string | null>(null);
  const [fifoNotice, setFifoNotice] = useState<string | null>(null);
  const fifoAbort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const canStartJobs = sessionCan(session, PERMISSIONS.jobOperate);

  useEffect(() => () => { fifoAbort.current?.abort(); }, []);

  const workflow = data?.workflows.find(item => item.id === workflowId);
  const kind = workflowKindOf(workflow?.code);
  const schema = useQuery({ queryKey: ['workflow-input-schema', workflowId], queryFn: () => getWorkflowRequestInputSchema(workflowId), enabled: !!workflowId });
  const staffFields = schema.data?.workflowInputs ?? [];
  const places = useMemo(() => data ? composerPlaces({ endpoints: data.map.endpoints, locations: data.locations, mapId: data.map.id }) : [], [data]);
  const gates = useMemo(() => outboundGates(places), [places]);
  const effectiveOutboundGate = useMemo(
    () => (outboundGate && gates.some(gate => gate.endpointId === outboundGate.endpointId) ? outboundGate : gates.length === 1 ? gates[0] : null),
    [outboundGate, gates],
  );
  const isFifoMode = kind === 'OUTBOUND' && outboundMode === 'fifo';
  const fifoCount = parseOutboundFifoCount(fifoCountText);
  const fifoCountInvalid = fifoCountText.trim().length > 0 && fifoCount === null;
  const currentFifoScope = data && fifoProduct && fifoCount && effectiveOutboundGate
    ? outboundFifoScopeKey({
        warehouseId: data.warehouse.id,
        mapId: data.map.id,
        productId: fifoProduct.id,
        containerCount: fifoCount,
        destinationEndpointId: effectiveOutboundGate.endpointId,
      })
    : '';
  const currentFifoPreview = fifoPreview && currentFifoScope && fifoPreviewScope === currentFifoScope ? fifoPreview : null;
  const fifoReady = Boolean(workflow && currentFifoPreview && currentFifoPreview.isComplete && currentFifoPreview.items.length > 0 && !fifoLoading && effectiveOutboundGate);
  const locationName = (id: string | null) => places.find(place => place.storageLocationId === id)?.name ?? t('Unknown shelf');
  const allContainers = useMemo(() => [...new Map([...(data?.containers ?? []), ...extra].map(item => [item.id, item])).values()], [data, extra]);
  const byId = useMemo(() => new Map(allContainers.map(item => [item.id, item])), [allContainers]);
  const held = data?.held ?? new Set<string>();
  const eligible = useMemo(() => allContainers.filter(item => !ineligibleReason(item, kind, held)), [allContainers, kind, held]);
  const hiddenCount = allContainers.length - eligible.length;
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? eligible.filter(item => [item.barcode, item.productName, item.productSku, item.voucher?.code ?? ''].some(v => v?.toLowerCase().includes(needle))) : eligible;
  }, [eligible, query]);
  const groups = useMemo(() => groupContainers(visible, kind, locationName), [visible, kind, places]);
  const selectedItems = selected.map(id => byId.get(id)).filter((item): item is ContainerListItem => !!item);

  // Workflow from the route ("workflow" param: code or kind), the repeated request, or the only one published.
  useEffect(() => {
    if (!data || workflowId) return;
    const wanted = String(data.previous?.workflowId || params?.workflow || '').toLowerCase();
    const match = data.workflows.find(item => item.id.toLowerCase() === wanted || item.code.toLowerCase() === wanted)
      ?? data.workflows.find(item => wanted && workflowKindOf(item.code) === workflowKindOf(wanted))
      ?? (wanted === 'inbound' || wanted === 'outbound' || wanted === 'reallocation' || wanted === 'internal'
        ? data.workflows.find(item => workflowKindOf(item.code) === (wanted === 'reallocation' ? 'INTERNAL' : wanted.toUpperCase())) : undefined);
    if (match) setWorkflowId(match.id); else setWorkflowSheet(true);
    if (data.previous) {
      const initialPlaces = composerPlaces({ endpoints: data.map.endpoints, locations: data.locations, mapId: data.map.id });
      const initialKind = match ? workflowKindOf(match.code) : 'OTHER';
      if (initialKind === 'OUTBOUND') {
        setOutboundMode('manual');
        const previousGateId = data.previous.details[0]?.destinationEndpointId;
        const previousGate = previousGateId ? outboundGates(initialPlaces).find(gate => gate.endpointId === previousGateId) ?? null : null;
        if (previousGate) setOutboundGate(previousGate);
      }
      setSelected(data.previous.details.map(line => line.containerId));
      setMovements(Object.fromEntries(data.previous.details.map(line => [line.containerId, {
        source: placeForEndpoint(initialPlaces, line.sourceEndpointId),
        destination: placeForEndpoint(initialPlaces, line.destinationEndpointId),
      }])));
    }
  }, [data, workflowId, params?.workflow]);

  useEffect(() => {
    if (!data || !workflow || !routeBarcodes.length || prefilled.current === `${routeKey}:${workflow.id}`) return;
    prefilled.current = `${routeKey}:${workflow.id}`;
    if (kind === 'OUTBOUND') setOutboundMode('manual');
    const wanted = routeBarcodes.map(code => allContainers.find(item => item.barcode === code)).filter((item): item is ContainerListItem => !!item);
    const usable = wanted.filter(item => !ineligibleReason(item, kind, held));
    const refused = wanted.filter(item => ineligibleReason(item, kind, held));
    const unknown = routeBarcodes.length - wanted.length;
    if (refused.length || unknown) {
      setNotice([...refused.map(item => t('{code}: {reason}.', { code: item.barcode, reason: t(ineligibleReason(item, kind, held) ?? '') })),
        ...(unknown ? [t('{count} containers were not found.', { count: unknown })] : [])].join(' '));
    }
    if (!usable.length) return;
    setSelected(usable.map(item => item.id));
    setMovements(Object.fromEntries(usable.map(item => [item.id, { source: defaultSource(item, kind, places), destination: defaultDestination(kind, places) }])));
    setStep('places');
  }, [data, workflow, routeKey, kind, allContainers, places]);

  const resetFifoState = () => {
    fifoAbort.current?.abort();
    fifoAbort.current = null;
    setFifoLoading(false);
    setFifoProduct(null);
    setFifoCountText('1');
    setFifoPreview(null);
    setFifoPreviewScope('');
    setFifoError(null);
    setFifoNotice(null);
  };

  const requestFifoPreview = async (overrideCount?: number, preserveNotice?: string) => {
    const count = overrideCount ?? fifoCount;
    if (!data || !fifoProduct || !count || !effectiveOutboundGate) return;
    fifoAbort.current?.abort();
    const controller = new AbortController();
    fifoAbort.current = controller;
    const scope = outboundFifoScopeKey({
      warehouseId: data.warehouse.id,
      mapId: data.map.id,
      productId: fifoProduct.id,
      containerCount: count,
      destinationEndpointId: effectiveOutboundGate.endpointId,
    });
    setFifoLoading(true);
    setFifoError(null);
    setFifoNotice(preserveNotice ?? null);
    try {
      const result = await previewOutboundPick({
        warehouseId: data.warehouse.id,
        mapVersionId: data.map.id,
        productId: fifoProduct.id,
        containerCount: count,
        destinationEndpointId: effectiveOutboundGate.endpointId,
      }, controller.signal);
      if (controller.signal.aborted || fifoAbort.current !== controller) return;
      setFifoPreview(result);
      setFifoPreviewScope(scope);
    } catch (failure) {
      const aborted = controller.signal.aborted || (typeof failure === 'object' && failure !== null && 'name' in failure && failure.name === 'AbortError');
      if (aborted || fifoAbort.current !== controller) return;
      setFifoPreview(null);
      setFifoPreviewScope('');
      setFifoError(getUserErrorMessage(failure, 'Could not load FIFO outbound preview. Try again.'));
    } finally {
      if (fifoAbort.current === controller) setFifoLoading(false);
    }
  };

  const chooseWorkflow = (id: string) => {
    triggerHaptic('tap');
    if (id !== workflowId) {
      setSelected([]); setMovements({}); setInputs({}); setError(null); setNotice(null);
      resetFifoState();
      setOutboundGate(null);
      setOutboundMode('fifo');
      setStep('containers');
    }
    setWorkflowId(id); setWorkflowSheet(false);
  };
  const switchOutboundMode = (mode: 'fifo' | 'manual') => {
    if (mode === outboundMode) return;
    triggerHaptic('tap');
    fifoAbort.current?.abort();
    setFifoLoading(false);
    setError(null);
    setNotice(null);
    setFifoError(null);
    setFifoNotice(null);
    setOutboundMode(mode);
  };
  const toggle = (item: ContainerListItem) => {
    triggerHaptic('tap');
    setSelected(previous => previous.includes(item.id) ? previous.filter(id => id !== item.id) : [...previous, item.id]);
  };
  const toggleGroup = (items: ContainerListItem[]) => {
    triggerHaptic('tap');
    const all = items.every(item => selected.includes(item.id));
    setSelected(previous => all ? previous.filter(id => !items.some(item => item.id === id)) : [...previous, ...items.map(item => item.id).filter(id => !previous.includes(id))]);
  };
  const onScan = async (code: string) => {
    setScanner(false);
    const value = code.trim();
    let item = allContainers.find(entry => entry.barcode === value);
    if (!item) {
      try { item = await getContainerByBarcode(value); setExtra(previous => [...previous, item!]); }
      catch { setNotice(t('{code} was not found.', { code: value })); return; }
    }
    const reason = ineligibleReason(item, kind, held);
    if (reason) { setNotice(t('{code}: {reason}.', { code: item.barcode, reason: t(reason) })); return; }
    if (!selected.includes(item.id)) setSelected(previous => [...previous, item!.id]);
    setNotice(t('{code} selected.', { code: item.barcode }));
  };
  const goPlaces = () => {
    if (!selectedItems.length) return;
    triggerHaptic('tap');
    // Fill what is known: the container's current place, the single receiving / shipping point.
    setMovements(previous => Object.fromEntries(selectedItems.map(item => {
      const current = previous[item.id];
      return [item.id, { source: current?.source ?? defaultSource(item, kind, places), destination: current?.destination ?? defaultDestination(kind, places) }];
    })));
    setError(null); setStep('places');
  };
  const applyPlace = (place: ComposerPlace) => {
    if (!pick) return;
    triggerHaptic('success');
    setMovements(previous => {
      const next = { ...previous };
      for (const item of selectedItems) {
        if (pick.containerId && pick.containerId !== item.id) continue;
        next[item.id] = { ...(next[item.id] ?? { source: null, destination: null }), [pick.end]: place };
      }
      return next;
    });
    setPick(null);
  };
  const effectiveMovements = useMemo(() => {
    if (kind !== 'OUTBOUND') return movements;
    return Object.fromEntries(selectedItems.map(item => [
      item.id,
      { source: defaultSource(item, 'OUTBOUND', places), destination: effectiveOutboundGate },
    ]));
  }, [kind, movements, selectedItems, places, effectiveOutboundGate]);
  const problems = selectedItems.map(item =>
    kind === 'OUTBOUND'
      ? outboundMovementProblem(effectiveMovements[item.id], gates.length > 0)
      : movementProblem(movements[item.id]));
  const placesReady = selectedItems.length > 0 && problems.every(problem => !problem);
  const back = () => {
    if (receipt) { goBack(); return; }
    if (step === 'review') setStep(isFifoMode ? 'containers' : 'places'); else if (step === 'places') setStep('containers'); else goBack();
  };
  const submit = async () => {
    if (lock.current || !data || !workflow) return;
    if (isFifoMode && (!currentFifoPreview || !currentFifoPreview.isComplete || !fifoProduct || !fifoCount || !effectiveOutboundGate)) return;
    lock.current = true; setPending(true); setError(null);
    try {
      const details = isFifoMode
        ? currentFifoPreview!.items.map(item => item.detail)
        : buildDetails(selectedItems, effectiveMovements);
      const workflowInputs = parseStaffInputs(staffFields, inputs);
      const result = await submitDispatch({
        warehouseId: data.warehouse.id,
        mapVersionId: data.map.id,
        workflowId: workflow.id,
        workflowInputs,
        note: null,
        details,
        ...(isFifoMode ? { outboundFifo: { productId: fifoProduct!.id, containerCount: fifoCount! } } : {}),
      }, true);
      const started = startNow && canStartJobs && result.queued ? await startQueuedJobs(result.queued.jobs) : [];
      triggerHaptic('success');
      setReceipt({ ...result, started });
    } catch (failure) {
      if (isFifoMode && failure instanceof ApiError && failure.status === 409 && failure.code === 'outbound_fifo_selection_changed') {
        const changedNotice = t('The FIFO selection changed. Review the updated containers before submitting.');
        setFifoPreview(null);
        setFifoPreviewScope('');
        setError(null);
        setStep('containers');
        void requestFifoPreview(undefined, changedNotice);
        return;
      }
      setError(getUserErrorMessage(failure, failure instanceof Error ? failure.message : 'The request could not be created.'));
    } finally { lock.current = false; setPending(false); }
  };

  const title = receipt ? 'Request Created' : step === 'containers' ? 'Choose Containers' : step === 'places' ? 'Pick-up & Delivery' : 'Review Request';
  const stepLabels = isFifoMode ? ['Containers', 'Review'] : ['Containers', 'Places', 'Review'];
  const stepIndex = isFifoMode ? (step === 'containers' ? 0 : 1) : (step === 'containers' ? 0 : step === 'places' ? 1 : 2);

  if (!data) {
    return <View style={styles.screen}>
      <SubScreenHeader title="New Transport Request" onBack={goBack} />
      <EmptyState title={context.isError ? 'Could Not Load' : 'Loading…'} message={context.isError ? getUserErrorMessage(context.error, 'The warehouse could not be loaded.') : undefined}
        actionTitle={context.isError ? 'Retry' : undefined} onAction={() => { void context.refetch(); }} />
    </View>;
  }

  return <View style={styles.screen}>
    <SubScreenHeader label={workflow?.name ?? 'New Transport Request'} title={title} onBack={back} />
    {receipt ? <ReceiptView receipt={receipt} onOpenJob={jobId => navigate('job_detail', { jobId })} onOpenRequest={() => navigate('transport_detail', { requestId: receipt.created.id })} onDone={goBack} /> : <>
      <View style={styles.stepper}>
        {stepLabels.map((label, index) => <View key={label} style={styles.stepItem}>
          <View style={[styles.stepDot, index <= stepIndex && styles.stepDotActive]}>
            {index < stepIndex ? <Check size={12} color="#fff" strokeWidth={3} /> : <Text variant="caption" fontWeight="700" color={index === stepIndex ? '#fff' : colors.textMuted}>{index + 1}</Text>}
          </View>
          <Text variant="caption" fontWeight={index === stepIndex ? '700' : '500'} color={index === stepIndex ? colors.textPrimary : colors.textMuted}>{label}</Text>
          {index < stepLabels.length - 1 ? <View style={[styles.stepLine, index < stepIndex && styles.stepLineActive]} /> : null}
        </View>)}
      </View>

      {step === 'containers' ? <>
        <View style={styles.toolbar}>
          <Pressable style={({ pressed }) => [styles.workflowChip, pressed && styles.pressed]} onPress={() => setWorkflowSheet(true)} accessibilityRole="button" accessibilityLabel="Change workflow">
            <Warehouse size={16} color={colors.primaryText} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" fontWeight="700" numberOfLines={1}>{workflow ? t(KIND_TITLE[kind]) : t('Choose what to do')}</Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>{workflow ? workflow.name : t('Workflow')}</Text>
            </View>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
          {kind === 'OUTBOUND' ? (
            <SegmentedControl
              value={outboundMode}
              onChange={switchOutboundMode}
              accessibilityLabel="Outbound selection mode"
              options={[{ label: 'By Product (FIFO)', value: 'fifo' }, { label: 'Manual Containers', value: 'manual' }]}
            />
          ) : null}
          {!isFifoMode ? <>
            <View style={styles.searchRow}>
              <TextField value={query} onChangeText={setQuery} placeholder="Barcode, product or voucher" leftIcon={<Search size={16} color={colors.textMuted} />}
                showClearButton autoCorrect={false} autoCapitalize="none" containerStyle={{ flex: 1 }} accessibilityLabel="Search containers" />
              <Pressable style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]} onPress={() => setScanner(true)} accessibilityRole="button" accessibilityLabel="Scan a container">
                <ScanLine size={20} color={colors.primaryText} />
              </Pressable>
            </View>
            {workflow ? <Text variant="caption" color="textSecondary">{t(KIND_HINT[kind])}{hiddenCount ? ` ${t('{count} other containers are hidden.', { count: hiddenCount })}` : ''}</Text> : null}
            {notice ? <Text variant="caption" color="primaryText">{notice}</Text> : null}
          </> : null}
        </View>
        {isFifoMode ? <>
          <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 140 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <View style={styles.fifoCard}>
              <Text variant="caption" color="textSecondary">Product</Text>
              <View style={styles.searchRow}>
                <Pressable style={({ pressed }) => [styles.placeButton, { flex: 1 }, !fifoProduct && styles.placeButtonEmpty, pressed && styles.pressed]}
                  onPress={() => setFifoProductPicker({ barcode: null })} accessibilityRole="button" accessibilityLabel="Choose Product">
                  <Package size={18} color={fifoProduct ? colors.primaryText : colors.textSecondary} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyMedium" fontWeight="700" color={fifoProduct ? colors.textPrimary : colors.primaryText} numberOfLines={1}>
                      {fifoProduct ? fifoProduct.name : t('Tap to choose or scan a product')}
                    </Text>
                    {fifoProduct ? <Text variant="code" color="textSecondary" numberOfLines={1}>{fifoProduct.sku}</Text> : null}
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </Pressable>
                <Pressable style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
                  onPress={() => setFifoScannerOpen(true)} accessibilityRole="button" accessibilityLabel="Scan product barcode">
                  <ScanLine size={20} color={colors.primaryText} />
                </Pressable>
              </View>

              <Text variant="caption" color="textSecondary">Container Count (1–200)</Text>
              <View style={styles.fifoStepper}>
                <Pressable
                  style={({ pressed }) => [styles.fifoStepBtn, (!fifoCount || fifoCount <= 1) && styles.disabledControl, pressed && styles.pressed]}
                  disabled={!fifoCount || fifoCount <= 1}
                  onPress={() => setFifoCountText(String(Math.max(1, (fifoCount ?? 1) - 1)))}
                  accessibilityRole="button" accessibilityLabel="Decrease Container Count">
                  <Minus size={18} color={(!fifoCount || fifoCount <= 1) ? colors.textMuted : colors.textPrimary} />
                </Pressable>
                <TextInput
                  style={styles.fifoStepInput}
                  value={fifoCountText}
                  onChangeText={text => setFifoCountText(text.replace(/[^0-9]/g, '').slice(0, 3))}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                  accessibilityLabel={t('FIFO Container Count')}
                />
                <Pressable
                  style={({ pressed }) => [styles.fifoStepBtn, (fifoCount ?? 0) >= 200 && styles.disabledControl, pressed && styles.pressed]}
                  disabled={(fifoCount ?? 0) >= 200}
                  onPress={() => setFifoCountText(String(Math.min(200, (fifoCount ?? 0) + 1)))}
                  accessibilityRole="button" accessibilityLabel="Increase Container Count">
                  <Plus size={18} color={(fifoCount ?? 0) >= 200 ? colors.textMuted : colors.textPrimary} />
                </Pressable>
              </View>
              {fifoCountInvalid ? <Text variant="caption" color="dangerText">Enter between 1 and 200 containers.</Text> : null}

              <Text variant="caption" color="textSecondary">Outbound Gate</Text>
              {gates.length === 0 ? (
                <View style={styles.warningBox}>
                  <Text variant="caption" color="warningText">No outbound point is configured on this map.</Text>
                </View>
              ) : gates.length === 1 && effectiveOutboundGate ? (
                <View style={styles.staticPlaceRow}>
                  <MapPin size={16} color={colors.primaryText} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" fontWeight="700">{effectiveOutboundGate.name}</Text>
                    <Text variant="caption" color="textMuted">{t('Station')} · {effectiveOutboundGate.code}</Text>
                  </View>
                </View>
              ) : (
                <PlaceButton label="Outbound Gate" place={effectiveOutboundGate} onPress={() => setGatePickerOpen(true)} />
              )}

              <Button
                title={currentFifoPreview ? 'Refresh FIFO Preview' : 'Preview FIFO Containers'}
                loading={fifoLoading}
                disabled={!fifoProduct || !fifoCount || !effectiveOutboundGate || fifoLoading}
                onPress={() => { void requestFifoPreview(); }}
              />
            </View>

            {fifoNotice ? <View style={styles.warningBox}><Text variant="caption" color="warningText" accessibilityRole="alert">{fifoNotice}</Text></View> : null}
            {fifoError ? <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{fifoError}</Text></View> : null}

            {currentFifoPreview ? <View style={styles.fifoCard}>
              <View style={styles.groupHeader}>
                <Text variant="bodyMedium" fontWeight="700" style={{ flex: 1 }}>
                  {t('Reviewed FIFO Selection · {count}', { count: currentFifoPreview.items.length })}
                </Text>
                {currentFifoPreview.isComplete
                  ? <CheckCircle2 size={18} color={colors.success} />
                  : <CircleAlert size={18} color={colors.warning} />}
              </View>
              {!currentFifoPreview.isComplete ? (
                <View style={styles.warningBox}>
                  <Text variant="caption" color="warningText">
                    {t('Only {available} of {requested} containers are available for FIFO pickup. Adjust the count or product and preview again.', {
                      available: currentFifoPreview.items.length,
                      requested: currentFifoPreview.requestedCount,
                    })}
                  </Text>
                  {currentFifoPreview.items.length > 0 ? (
                    <Button
                      title={t('Use Available ({count})', { count: currentFifoPreview.items.length })}
                      variant="outline"
                      size="sm"
                      onPress={() => {
                        const available = currentFifoPreview.items.length;
                        setFifoCountText(String(available));
                        void requestFifoPreview(available);
                      }}
                    />
                  ) : null}
                </View>
              ) : null}
              {currentFifoPreview.items.map(item => {
                const shelf = locationName(item.detail.sourceStorageLocationId);
                const levelText = item.detail.sourceLevelNo != null ? ` · ${t('Level {level}', { level: item.detail.sourceLevelNo })}` : '';
                return <View key={item.detail.containerId} style={styles.containerRow}>
                  <View style={styles.moveIndex}><Text variant="caption" fontWeight="700" color={colors.primaryText}>{item.detail.sequenceNo}</Text></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="code" fontWeight="700">{item.barcode}</Text>
                    <View style={styles.routeLine}>
                      <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>{shelf}{levelText}</Text>
                      <ArrowRight size={12} color={colors.textMuted} />
                      <Text variant="caption" fontWeight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{effectiveOutboundGate?.name ?? item.detail.destinationEndpointId}</Text>
                    </View>
                    <Text variant="caption" color="textMuted">{t('Admitted {date}', { date: voucherDate(item.admittedAt) })}</Text>
                  </View>
                </View>;
              })}
            </View> : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Text variant="bodyMedium" fontWeight="700">
              {currentFifoPreview?.isComplete
                ? t('{count} FIFO Selected', { count: currentFifoPreview.items.length })
                : currentFifoPreview ? t('Shortfall') : t('{count} selected', { count: 0 })}
            </Text>
            <Button title="Review" icon={ArrowRight} disabled={!fifoReady} onPress={() => { triggerHaptic('tap'); setError(null); setStep('review'); }} />
          </View>
        </> : <>
          <FlatList
            data={workflow ? groups : []}
            keyExtractor={group => group.key}
            contentContainerStyle={[styles.listContent, { paddingBottom: 140 + insets.bottom }]}
            ListEmptyComponent={workflow ? <EmptyState compact title="No Containers To Move" message={query ? 'Nothing matches this search.' : t(KIND_HINT[kind])} /> : undefined}
            renderItem={({ item: group }) => {
              const all = group.items.every(item => selected.includes(item.id));
              return <View style={styles.group}>
                <View style={styles.groupHeader}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" fontWeight="700">{group.title}</Text>
                    <Text variant="caption" color="textSecondary">{group.subtitle ? `${t(group.subtitle)} · ` : ''}{t('{count} containers', { count: group.items.length })}</Text>
                  </View>
                  <Button title={all ? 'Clear' : 'Select All'} size="sm" variant={all ? 'ghost' : 'outline'} onPress={() => toggleGroup(group.items)} />
                </View>
                {group.items.map(item => {
                  const on = selected.includes(item.id);
                  return <Pressable key={item.id} onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    style={({ pressed }) => [styles.containerRow, on && styles.containerRowOn, pressed && styles.pressed]}>
                    <View style={[styles.check, on && styles.checkOn]}>{on ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="code" fontWeight="700">{item.barcode}</Text>
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>{item.productName} · {item.productSku}</Text>
                    </View>
                    <View style={styles.placeTag}>
                      <MapPin size={12} color={colors.textSecondary} />
                      <Text variant="caption" color="textSecondary" numberOfLines={1}>{defaultSource(item, kind, places)?.name ?? t('Not placed')}</Text>
                    </View>
                  </Pressable>;
                })}
              </View>;
            }}
          />
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Text variant="bodyMedium" fontWeight="700">{t('{count} selected', { count: selectedItems.length })}</Text>
            <Button title="Next" icon={ArrowRight} disabled={!selectedItems.length || !workflow} onPress={goPlaces} />
          </View>
        </>}
      </> : null}

      {step === 'places' ? <>
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 140 + insets.bottom }]}>
          {kind === 'OUTBOUND' ? (
            <View style={styles.fifoCard}>
              <Text variant="caption" color="textSecondary">Outbound Gate</Text>
              {gates.length === 0 ? (
                <View style={styles.warningBox}>
                  <Text variant="caption" color="warningText">No outbound point is configured on this map.</Text>
                </View>
              ) : gates.length === 1 && effectiveOutboundGate ? (
                <View style={styles.staticPlaceRow}>
                  <MapPin size={16} color={colors.primaryText} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" fontWeight="700">{effectiveOutboundGate.name}</Text>
                    <Text variant="caption" color="textMuted">{t('Station')} · {effectiveOutboundGate.code}</Text>
                  </View>
                </View>
              ) : (
                <PlaceButton label="Outbound Gate" place={effectiveOutboundGate} onPress={() => setGatePickerOpen(true)} />
              )}
            </View>
          ) : (
            <View style={styles.bulkRow}>
              <Button title="Same Pick-up For All" variant="outline" size="sm" icon={MapPin} onPress={() => setPick({ end: 'source', containerId: null })} />
              <Button title="Same Delivery For All" variant="outline" size="sm" icon={MapPin} onPress={() => setPick({ end: 'destination', containerId: null })} />
            </View>
          )}
          {selectedItems.map((item, index) => {
            const movement = effectiveMovements[item.id];
            const problem = problems[index];
            return <View key={item.id} style={[styles.moveCard, problem && styles.moveCardProblem]}>
              <View style={styles.moveHeader}>
                <View style={styles.moveIndex}><Text variant="caption" fontWeight="700" color={colors.primaryText}>{index + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text variant="code" fontWeight="700">{item.barcode}</Text>
                  <Text variant="caption" color="textSecondary" numberOfLines={1}>{item.productName}</Text>
                </View>
                {problem ? <CircleAlert size={18} color={colors.warning} /> : <CheckCircle2 size={18} color={colors.success} />}
              </View>
              {kind === 'OUTBOUND' ? <>
                <View style={[styles.placeButton, !movement?.source && styles.placeButtonEmpty]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" color="textSecondary">Pick up at</Text>
                    <Text variant="bodyMedium" fontWeight="700" color={movement?.source ? colors.textPrimary : colors.warningText}>
                      {movement?.source ? movement.source.name : t('Location Unavailable On This Map')}
                    </Text>
                    {movement?.source ? (
                      <Text variant="caption" color="textMuted">
                        {t('Shelf')} · {movement.source.code}{item.currentLevelNo != null ? ` · ${t('Level {level}', { level: item.currentLevelNo })}` : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: 'center' }}><ArrowDown size={16} color={colors.textMuted} /></View>
                {gates.length > 1 ? (
                  <PlaceButton label="Deliver to" place={movement?.destination ?? null} onPress={() => setGatePickerOpen(true)} />
                ) : (
                  <View style={[styles.placeButton, !movement?.destination && styles.placeButtonEmpty]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="caption" color="textSecondary">Deliver to</Text>
                      <Text variant="bodyMedium" fontWeight="700" color={movement?.destination ? colors.textPrimary : colors.warningText}>
                        {movement?.destination ? movement.destination.name : t('No outbound point is configured on this map.')}
                      </Text>
                      {movement?.destination ? <Text variant="caption" color="textMuted">{t('Station')} · {movement.destination.code}</Text> : null}
                    </View>
                  </View>
                )}
              </> : <>
                <PlaceButton label="Pick up at" place={movement?.source ?? null} onPress={() => setPick({ end: 'source', containerId: item.id })} />
                <View style={{ alignItems: 'center' }}><ArrowDown size={16} color={colors.textMuted} /></View>
                <PlaceButton label="Deliver to" place={movement?.destination ?? null} onPress={() => setPick({ end: 'destination', containerId: item.id })} />
              </>}
              {problem ? <Text variant="caption" color="warningText">{t(problem)}</Text> : null}
            </View>;
          })}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Text variant="caption" color="textSecondary" style={{ flex: 1 }}>{placesReady ? t('All trips are set.') : t('{count} trips need a place.', { count: problems.filter(Boolean).length })}</Text>
          <Button title="Review" icon={ArrowRight} disabled={!placesReady} onPress={() => { triggerHaptic('tap'); setStep('review'); }} />
        </View>
      </> : null}

      {step === 'review' ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 160 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <View style={styles.reviewHero}>
            <Text variant="caption" color="textSecondary">{workflow?.name}{isFifoMode && fifoProduct ? ` · ${fifoProduct.name}` : ''}</Text>
            <Text variant="title">{t(KIND_TITLE[kind])}{isFifoMode ? ` · ${t('By Product (FIFO)')}` : ''}</Text>
            <Text variant="bodyMedium" color="textSecondary">
              {t('{count} containers · {trips} trips', {
                count: isFifoMode ? (currentFifoPreview?.items.length ?? 0) : selectedItems.length,
                trips: isFifoMode ? (currentFifoPreview?.items.length ?? 0) : selectedItems.length,
              })}
            </Text>
          </View>
          {isFifoMode && currentFifoPreview ? currentFifoPreview.items.map(item => {
            const shelf = locationName(item.detail.sourceStorageLocationId);
            const levelText = item.detail.sourceLevelNo != null ? ` (${t('Level {level}', { level: item.detail.sourceLevelNo })})` : '';
            return <View key={item.detail.containerId} style={styles.reviewRow}>
              <View style={styles.moveIndex}><Text variant="caption" fontWeight="700" color={colors.primaryText}>{item.detail.sequenceNo}</Text></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="code" fontWeight="700">{item.barcode}</Text>
                <View style={styles.routeLine}>
                  <Text variant="bodyMedium" numberOfLines={1} style={{ flexShrink: 1 }}>{shelf}{levelText}</Text>
                  <ArrowRight size={14} color={colors.textMuted} />
                  <Text variant="bodyMedium" fontWeight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{effectiveOutboundGate?.name}</Text>
                </View>
                <Text variant="caption" color="textMuted">{t('Admitted {date}', { date: voucherDate(item.admittedAt) })}</Text>
              </View>
            </View>;
          }) : selectedItems.map((item, index) => {
            const movement = effectiveMovements[item.id];
            return <View key={item.id} style={styles.reviewRow}>
              <View style={styles.moveIndex}><Text variant="caption" fontWeight="700" color={colors.primaryText}>{index + 1}</Text></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text variant="code" fontWeight="700">{item.barcode}</Text>
                <View style={styles.routeLine}>
                  <Text variant="bodyMedium" numberOfLines={1} style={{ flexShrink: 1 }}>{movement?.source?.name}</Text>
                  <ArrowRight size={14} color={colors.textMuted} />
                  <Text variant="bodyMedium" fontWeight="700" numberOfLines={1} style={{ flexShrink: 1 }}>{movement?.destination?.name}</Text>
                </View>
              </View>
            </View>;
          })}
          {staffFields.map(field => {
            const setValue = (value: string) => setInputs(previous => ({ ...previous, [field.key]: value }));
            // A yes / no question is answered by choosing, never by typing "true".
            if (field.dataType === 'BOOLEAN') {
              return <View key={field.key} style={{ gap: 6 }}>
                <Text variant="bodyMedium" fontWeight="600">{field.label || field.key}{field.required ? ' *' : ''}</Text>
                {field.description ? <Text variant="caption" color="textSecondary">{field.description}</Text> : null}
                <SegmentedControl
                  value={inputs[field.key] ?? ''}
                  onChange={setValue}
                  accessibilityLabel={field.label || field.key}
                  options={[{ label: t('Yes'), value: 'true' }, { label: t('No'), value: 'false' }]}
                />
              </View>;
            }
            return <TextField key={field.key} label={field.label || field.key} value={inputs[field.key] ?? ''} onChangeText={setValue}
              keyboardType={field.dataType === 'INTEGER' ? 'number-pad' : field.dataType === 'DECIMAL' ? 'decimal-pad' : 'default'}
              placeholder={field.description ?? undefined} />;
          })}
          {canStartJobs ? <Pressable style={styles.startToggle} accessibilityRole="checkbox" accessibilityState={{ checked: startNow }} onPress={() => setStartNow(value => !value)}>
            <View style={[styles.check, startNow && styles.checkOn]}>{startNow ? <Check size={14} color="#fff" strokeWidth={3} /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" fontWeight="700">Start on a robot right away</Text>
              <Text variant="caption" color="textSecondary">The system picks a free robot for each job.</Text>
            </View>
          </Pressable> : null}
          {error ? <View style={styles.error}><Text variant="body" color="dangerText" accessibilityRole="alert">{error}</Text></View> : null}
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Button title={startNow && canStartJobs ? 'Create And Start' : 'Create Request'} fullWidth loading={pending} disabled={pending || (isFifoMode && !fifoReady)} onPress={() => { void submit(); }} />
        </View>
      </KeyboardAvoidingView> : null}
    </>}

    {workflowSheet ? <BottomSheet onClose={() => setWorkflowSheet(false)} accessibilityLabel="Choose workflow">
      <View style={styles.sheet}>
        <Text variant="title">What do you want to do?</Text>
        {data.workflows.map(item => {
          const itemKind = workflowKindOf(item.code);
          const on = item.id === workflowId;
          return <Pressable key={item.id} style={[styles.workflowOption, on && styles.workflowOptionOn]} onPress={() => chooseWorkflow(item.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
            <Package size={20} color={on ? colors.primaryText : colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" fontWeight="700">{t(KIND_TITLE[itemKind])}</Text>
              <Text variant="caption" color="textSecondary">{item.name}</Text>
            </View>
            {on ? <Check size={18} color={colors.primaryText} /> : <ChevronRight size={18} color={colors.textMuted} />}
          </Pressable>;
        })}
      </View>
    </BottomSheet> : null}

    {pick ? <PlacePickerSheet places={allowedPlaces(kind, pick.end, places)} suggested={suggestedPlaces(kind, pick.end, places)} end={pick.end} bulk={!pick.containerId}
      map={data.map} onPick={applyPlace} onClose={() => setPick(null)} /> : null}

    {gatePickerOpen ? <PlacePickerSheet places={gates} suggested={gates} end="destination" bulk={true}
      map={data.map} onPick={place => { triggerHaptic('success'); setOutboundGate(place); setGatePickerOpen(false); }} onClose={() => setGatePickerOpen(false)} /> : null}

    {fifoProductPicker ? <ReceivingProductPicker selectedProduct={fifoProduct} initialBarcode={fifoProductPicker.barcode}
      onSelect={chosen => { setFifoProduct(chosen); setFifoProductPicker(null); setFifoError(null); setFifoNotice(null); }}
      onClose={() => setFifoProductPicker(null)} /> : null}

    <BarcodeScannerHUD visible={fifoScannerOpen} title="Scan product barcode" manualLabel="Product or supplier barcode"
      placeholder="Enter Or Scan Product Barcode" onClose={() => setFifoScannerOpen(false)}
      onScanResult={barcode => { setFifoScannerOpen(false); setFifoProductPicker({ barcode }); }} />

    <BarcodeScannerHUD visible={scanner} onClose={() => setScanner(false)} onScanResult={code => { void onScan(code); }} />
  </View>;
}

function PlaceButton({ label, place, onPress }: { label: string; place: ComposerPlace | null; onPress: () => void }) {
  const { styles, colors } = useThemedStyles(createStyles);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${t(label)}: ${place?.name ?? t('not chosen')}`}
    style={({ pressed }) => [styles.placeButton, !place && styles.placeButtonEmpty, pressed && styles.pressed]}>
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="caption" color="textSecondary">{label}</Text>
      <Text variant="bodyMedium" fontWeight="700" color={place ? colors.textPrimary : colors.primaryText}>{place?.name ?? t('Choose a place')}</Text>
      {place ? <Text variant="caption" color="textMuted">{place.kind === 'location' ? t('Shelf') : t('Station')} · {place.code}</Text> : null}
    </View>
    <ChevronRight size={18} color={colors.textMuted} />
  </Pressable>;
}

function PlacePickerSheet({ places, suggested, end, bulk, map, onPick, onClose }: {
  places: ComposerPlace[]; suggested: ComposerPlace[]; end: 'source' | 'destination'; bulk: boolean;
  map: Parameters<typeof MapViewport>[0]['map']; onPick: (place: ComposerPlace) => void; onClose: () => void;
}) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(suggested.length === 0);
  const list = searchPlaces(all || query ? places : suggested, query);
  const title = end === 'source' ? (bulk ? 'Pick-up place for all' : 'Pick-up place') : (bulk ? 'Delivery place for all' : 'Delivery place');
  return <BottomSheet onClose={onClose} accessibilityLabel={title}>
    <View style={[styles.sheet, { flex: 1 }]}>
      <Text variant="title">{title}</Text>
      <SegmentedControl value={mode} onChange={setMode} accessibilityLabel="Place picker mode"
        options={[{ label: 'List', value: 'list' }, { label: 'Map', value: 'map' }]} />
      {mode === 'list' ? <>
        <TextField value={query} onChangeText={setQuery} placeholder="Search shelf or station" leftIcon={<Search size={16} color={colors.textMuted} />} showClearButton autoCorrect={false} />
        {!query && suggested.length && places.length > suggested.length ? <View style={styles.bulkRow}>
          <Button title="Suggested" size="sm" variant={all ? 'ghost' : 'secondary'} icon={List} onPress={() => setAll(false)} />
          <Button title="All Places" size="sm" variant={all ? 'secondary' : 'ghost'} onPress={() => setAll(true)} />
        </View> : null}
        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          {list.length ? list.map(place => <Pressable key={place.key} onPress={() => onPick(place)} style={({ pressed }) => [styles.placeOption, pressed && styles.pressed]} accessibilityRole="button">
            <View style={[styles.placeIcon, place.kind === 'location' && styles.placeIconShelf]}>
              {place.kind === 'location' ? <Box size={16} color={colors.primaryText} /> : <MapPin size={16} color={colors.textSecondary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" fontWeight="700">{place.name}</Text>
              <Text variant="caption" color="textSecondary">{place.kind === 'location' ? t('Shelf') : t('Station')} · {place.code}</Text>
            </View>
          </Pressable>) : <EmptyState compact title="No Place Found" />}
        </ScrollView>
      </> : <View style={styles.mapPick}>
        <Text variant="caption" color="textSecondary">Tap a station on the map to choose it.</Text>
        <View style={{ flex: 1, minHeight: 380 }}>
          <MapViewport map={map} robots={[]} selectedRobot="" onSelectRobot={() => {}} showHeader={false} fullBleed={true} compact={true}
            onPickEndpoint={endpoint => { const place = placeForEndpoint(places, endpoint.id); if (place) onPick(place); }} />
        </View>
        <View style={styles.bulkRow}><MapIcon size={14} color={colors.textMuted} /><Text variant="caption" color="textMuted">Chargers and parking spots cannot be chosen.</Text></View>
      </View>}
    </View>
  </BottomSheet>;
}

function ReceiptView({ receipt, onOpenJob, onOpenRequest, onDone }: {
  receipt: { created: CreateTransportRequestResponse; queued: QueueTransportRequestResponse | null; queueError: string | null; started: JobStartResult[] };
  onOpenJob: (jobId: string) => void; onOpenRequest: () => void; onDone: () => void;
}) {
  const { styles, colors } = useThemedStyles(createStyles);
  const jobs = receipt.queued?.jobs ?? [];
  return <ScrollView contentContainerStyle={styles.listContent}>
    <View style={styles.reviewHero}>
      <CheckCircle2 size={32} color={colors.success} />
      <Text variant="title">{receipt.created.requestCode}</Text>
      <Text variant="bodyMedium" color="textSecondary">{receipt.queued ? t('{count} jobs created', { count: jobs.length }) : t('Submitted. It could not be queued yet.')}</Text>
      {receipt.queueError ? <Text variant="caption" color="warningText">{receipt.queueError}</Text> : null}
    </View>
    {jobs.map(job => {
      const start = receipt.started.find(item => item.jobId === job.jobId);
      return <Pressable key={job.jobId} style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]} onPress={() => onOpenJob(job.jobId)} accessibilityRole="button">
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="code" fontWeight="700">{job.jobNo}</Text>
          <Text variant="caption" color={start?.error ? 'warningText' : 'textSecondary'}>
            {start ? start.error ?? t('Running on {robot}', { robot: start.robot ?? t('a robot') }) : t('Queued')}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </Pressable>;
    })}
    <Button title="View Request" variant="outline" fullWidth onPress={onOpenRequest} />
    <Button title="Done" fullWidth onPress={onDone} />
  </ScrollView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.85 },
  stepper: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 4, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  stepDotActive: { backgroundColor: colors.primary },
  stepLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.border },
  stepLineActive: { backgroundColor: colors.primary },
  toolbar: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  workflowChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.lg, backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primaryBorder },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanButton: { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  listContent: { padding: 16, gap: 12 },
  group: { gap: 8, padding: 12, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  containerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: 'transparent' },
  containerRowOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  placeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 120 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  bulkRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  moveCard: { gap: 8, padding: 12, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  moveCardProblem: { borderColor: colors.warningBorder },
  moveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  moveIndex: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  placeButton: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border },
  placeButtonEmpty: { borderStyle: 'dashed', borderColor: colors.primaryBorder, backgroundColor: colors.primaryLight },
  reviewHero: { alignItems: 'flex-start', gap: 4, padding: 16, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  routeLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  startToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  error: { padding: 12, borderRadius: radii.md, backgroundColor: colors.dangerBg },
  sheet: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  workflowOption: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border },
  workflowOptionOn: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  placeOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  placeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  placeIconShelf: { backgroundColor: colors.primaryLight },
  mapPick: { gap: 8, flex: 1 },
  fifoCard: { gap: 10, padding: 14, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fifoStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.md, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border, padding: 4 },
  fifoStepBtn: { width: 44, height: 44, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  fifoStepInput: { flex: 1, height: 44, padding: 0, textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  disabledControl: { opacity: 0.4 },
  staticPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle, borderWidth: 1, borderColor: colors.border },
  warningBox: { gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder },
});
