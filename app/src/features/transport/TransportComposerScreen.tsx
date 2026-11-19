import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowDown, ArrowRight, Box, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, List, Map as MapIcon, MapPin, Package, ScanLine, Search, Warehouse } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { BarcodeScannerHUD } from '../monitoring/BarcodeScannerHUD';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { Button, EmptyState, SegmentedControl, Text, TextField } from '../../shared/ui';
import type { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { radii } from '../../shared/theme/radii';
import {
  getContainerByBarcode, getMapVersionDetail, getOperatingContext, getTransportRequest, getWorkflowRequestInputSchema,
  listContainers, listPublishedWorkflows, listStorageLocations, listTransportRequests,
  type ContainerListItem, type CreateTransportRequestResponse, type QueueTransportRequestResponse,
} from '../../shared/api';
import { getUserErrorMessage } from '../../shared/api/client';
import { MapViewport } from '../../shared/maps/MapViewport';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { t } from '../../shared/i18n';
import { triggerHaptic } from '../../shared/utils/haptics';
import { parseStaffInputs } from './dispatchData';
import { submitDispatch } from './dispatchSubmission';
import { startQueuedJobs, type JobStartResult } from './startQueuedJobs';
import { activeContainerIds } from './transportDraft';
import {
  buildDetails, composerPlaces, defaultDestination, defaultSource, groupContainers, ineligibleReason, movementProblem,
  placeForEndpoint, searchPlaces, suggestedPlaces, workflowKindOf, type ComposerPlace, type Movement, type WorkflowKind,
} from './composerData';

type Step = 'containers' | 'places' | 'review';
type PickTarget = { end: 'source' | 'destination'; containerId: string | null } | null;

const KIND_TITLE: Record<WorkflowKind, string> = {
  INBOUND: 'Put away received containers', OUTBOUND: 'Bring containers to shipping', INTERNAL: 'Move containers between shelves', OTHER: 'Move containers',
};
const KIND_HINT: Record<WorkflowKind, string> = {
  INBOUND: 'Containers on a confirmed receiving voucher that are not on a shelf yet.',
  OUTBOUND: 'Containers on a shelf that are on a confirmed issue voucher.',
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
  const lock = useRef(false);
  const canStartJobs = sessionCan(session, PERMISSIONS.jobOperate);

  const workflow = data?.workflows.find(item => item.id === workflowId);
  const kind = workflowKindOf(workflow?.code);
  const schema = useQuery({ queryKey: ['workflow-input-schema', workflowId], queryFn: () => getWorkflowRequestInputSchema(workflowId), enabled: !!workflowId });
  const staffFields = schema.data?.workflowInputs ?? [];
  const places = useMemo(() => data ? composerPlaces({ endpoints: data.map.endpoints, locations: data.locations, mapId: data.map.id }) : [], [data]);
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
      setSelected(data.previous.details.map(line => line.containerId));
      setMovements(Object.fromEntries(data.previous.details.map(line => [line.containerId, {
        source: placeForEndpoint(composerPlaces({ endpoints: data.map.endpoints, locations: data.locations, mapId: data.map.id }), line.sourceEndpointId),
        destination: placeForEndpoint(composerPlaces({ endpoints: data.map.endpoints, locations: data.locations, mapId: data.map.id }), line.destinationEndpointId),
      }])));
    }
  }, [data, workflowId, params?.workflow]);

  useEffect(() => {
    if (!data || !workflow || !routeBarcodes.length || prefilled.current === `${routeKey}:${workflow.id}`) return;
    prefilled.current = `${routeKey}:${workflow.id}`;
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

  const chooseWorkflow = (id: string) => {
    triggerHaptic('tap');
    if (id !== workflowId) { setSelected([]); setMovements({}); setInputs({}); setStep('containers'); }
    setWorkflowId(id); setWorkflowSheet(false);
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
  const problems = selectedItems.map(item => movementProblem(movements[item.id]));
  const placesReady = selectedItems.length > 0 && problems.every(problem => !problem);
  const back = () => {
    if (receipt) { goBack(); return; }
    if (step === 'review') setStep('places'); else if (step === 'places') setStep('containers'); else goBack();
  };
  const submit = async () => {
    if (lock.current || !data || !workflow) return;
    lock.current = true; setPending(true); setError(null);
    try {
      const details = buildDetails(selectedItems, movements);
      const workflowInputs = parseStaffInputs(staffFields, inputs);
      const result = await submitDispatch({ warehouseId: data.warehouse.id, mapVersionId: data.map.id, workflowId: workflow.id, workflowInputs, note: null, details }, true);
      const started = startNow && canStartJobs && result.queued ? await startQueuedJobs(result.queued.jobs) : [];
      triggerHaptic('success');
      setReceipt({ ...result, started });
    } catch (failure) {
      setError(getUserErrorMessage(failure, failure instanceof Error ? failure.message : 'The request could not be created.'));
    } finally { lock.current = false; setPending(false); }
  };

  const title = receipt ? 'Request Created' : step === 'containers' ? 'Choose Containers' : step === 'places' ? 'Pick-up & Delivery' : 'Review Request';
  const stepIndex = step === 'containers' ? 0 : step === 'places' ? 1 : 2;

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
        {['Containers', 'Places', 'Review'].map((label, index) => <View key={label} style={styles.stepItem}>
          <View style={[styles.stepDot, index <= stepIndex && styles.stepDotActive]}>
            {index < stepIndex ? <Check size={12} color="#fff" strokeWidth={3} /> : <Text variant="caption" fontWeight="700" color={index === stepIndex ? '#fff' : colors.textMuted}>{index + 1}</Text>}
          </View>
          <Text variant="caption" fontWeight={index === stepIndex ? '700' : '500'} color={index === stepIndex ? colors.textPrimary : colors.textMuted}>{label}</Text>
          {index < 2 ? <View style={[styles.stepLine, index < stepIndex && styles.stepLineActive]} /> : null}
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
          <View style={styles.searchRow}>
            <TextField value={query} onChangeText={setQuery} placeholder="Barcode, product or voucher" leftIcon={<Search size={16} color={colors.textMuted} />}
              showClearButton autoCorrect={false} autoCapitalize="none" containerStyle={{ flex: 1 }} accessibilityLabel="Search containers" />
            <Pressable style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]} onPress={() => setScanner(true)} accessibilityRole="button" accessibilityLabel="Scan a container">
              <ScanLine size={20} color={colors.primaryText} />
            </Pressable>
          </View>
          {workflow ? <Text variant="caption" color="textSecondary">{t(KIND_HINT[kind])}{hiddenCount ? ` ${t('{count} other containers are hidden.', { count: hiddenCount })}` : ''}</Text> : null}
          {notice ? <Text variant="caption" color="primaryText">{notice}</Text> : null}
        </View>
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
      </> : null}

      {step === 'places' ? <>
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 140 + insets.bottom }]}>
          <View style={styles.bulkRow}>
            <Button title="Same Pick-up For All" variant="outline" size="sm" icon={MapPin} onPress={() => setPick({ end: 'source', containerId: null })} />
            <Button title="Same Delivery For All" variant="outline" size="sm" icon={MapPin} onPress={() => setPick({ end: 'destination', containerId: null })} />
          </View>
          {selectedItems.map((item, index) => {
            const movement = movements[item.id];
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
              <PlaceButton label="Pick up at" place={movement?.source ?? null} onPress={() => setPick({ end: 'source', containerId: item.id })} />
              <View style={{ alignItems: 'center' }}><ArrowDown size={16} color={colors.textMuted} /></View>
              <PlaceButton label="Deliver to" place={movement?.destination ?? null} onPress={() => setPick({ end: 'destination', containerId: item.id })} />
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
            <Text variant="caption" color="textSecondary">{workflow?.name}</Text>
            <Text variant="title">{t(KIND_TITLE[kind])}</Text>
            <Text variant="bodyMedium" color="textSecondary">{t('{count} containers · {trips} trips', { count: selectedItems.length, trips: selectedItems.length })}</Text>
          </View>
          {selectedItems.map((item, index) => {
            const movement = movements[item.id];
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
          {staffFields.map(field => <TextField key={field.key} label={field.label || field.key} value={inputs[field.key] ?? ''} onChangeText={value => setInputs(previous => ({ ...previous, [field.key]: value }))}
            placeholder={field.description ?? undefined} />)}
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
          <Button title={startNow && canStartJobs ? 'Create And Start' : 'Create Request'} fullWidth loading={pending} disabled={pending} onPress={() => { void submit(); }} />
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

    {pick ? <PlacePickerSheet places={places} suggested={suggestedPlaces(kind, pick.end, places)} end={pick.end} bulk={!pick.containerId}
      map={data.map} onPick={applyPlace} onClose={() => setPick(null)} /> : null}

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
        {!query && suggested.length ? <View style={styles.bulkRow}>
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
          <MapViewport map={map} robots={[]} selectedRobot="" onSelectRobot={() => {}} showHeader={false}
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
});
