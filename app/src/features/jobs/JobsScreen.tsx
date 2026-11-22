import { Check, ChevronDown, Filter, Inbox, MapPin, Search, SearchX, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { ThemeColors } from '../../shared/theme/colors';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import {
  EmptyState,
  SegmentedControl,
  Text,
  TextField,
} from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import {
  getMyHandoverWorkZone, getUserErrorMessage, listHandoverStops, listJobs, setMyHandoverWorkZone,
} from '../../shared/api';
import { PERMISSIONS, sessionCan } from '../../shared/auth/permissions';
import { t } from '../../shared/i18n';
import type { HandoverStopResponse } from '../../shared/types/contracts';
import { useRealtime } from '../../shared/realtime/RealtimeContext';
import { HandoverStopCard } from './HandoverStopCard';
import { handoverStopOwnerState, mergeMyJobIdsWithStops } from './handoverData';
import { JobCard } from './JobCard';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { usePlaceDirectory } from '../../shared/places/usePlaceDirectory';
import type { PlaceDirectory } from '../../shared/places/placeDirectory';
import { AppJobItem, isTerminalJobStatus, mapJobDetailToAppJobItem } from './jobData';

type JobScope = 'mine' | 'fleet' | 'history';

const SCOPES: ReadonlyArray<{ label: string; value: JobScope }> = [
  { label: 'My Tasks', value: 'mine' },
  { label: 'Fleet Queue', value: 'fleet' },
  { label: 'History', value: 'history' },
];

/**
 * Deep-link `view` -> scope.
 *
 * `?screen=jobs-history` and `?screen=jobs-global` are how a reviewer (and the
 * prototype's screenshot pass) reaches a specific scope, so the screen has to
 * open *on* it rather than showing "My Tasks" and quietly disagreeing with the
 * URL. `global` is the prototype's name for the fleet queue.
 */
function scopeFromParams(view: unknown): JobScope | null {
  if (typeof view !== 'string') return null;
  const normalized = view.trim().toLowerCase();
  if (normalized === 'history') return 'history';
  if (normalized === 'fleet' || normalized === 'global') return 'fleet';
  if (normalized === 'mine') return 'mine';
  return null;
}

/**
 * Case-insensitive substring match across everything an operator could
 * plausibly type: the job number, a container code, a rack, a robot, or a
 * workflow name. Hyphens and spaces are ignored in both the query and the
 * haystack, so "JOB20260812" finds `JOB-2026-0812` — on a PDA that is a
 * two-thumb keypress nobody enjoys getting wrong.
 */
function matchesQuery(job: AppJobItem, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const squash = (value: string) => value.toLowerCase().replace(/[-\s]/g, '');
  const needle = squash(query);

  const haystack: string[] = [
    job.id,
    job.jobNo,
    job.target,
    job.currentStop,
    job.route,
    job.routeText,
    job.workflowName,
    job.workflowCode,
    job.robot,
    job.assignedRobotCode ?? '',
    job.sourceEndpointCode ?? '',
    job.destinationEndpointCode ?? '',
    ...(job.containers ?? []).flatMap((c) => [c.code, c.product, c.location]),
    ...(job.slots ?? []).flatMap((s) => [s.containerBarcode ?? '', s.productName ?? '']),
  ];

  return haystack.some((value) => {
    if (!value) return false;
    const lower = value.toLowerCase();
    return lower.includes(query) || squash(value).includes(needle);
  });
}

/** No area selected -> everything is visible. Otherwise the job's source or destination lies in that map area. */
function matchesArea(job: AppJobItem, areaId: string | null, places: PlaceDirectory): boolean {
  if (!areaId) return true;
  return [job.sourceEndpointCode, job.destinationEndpointCode, ...job.tasks.map(task => task.endpointCode ?? '')]
    .some(code => places.areasOf(code).some(area => area.id === areaId));
}

function matchesStopQuery(stop: HandoverStopResponse, rawQuery: string, places: PlaceDirectory): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const squash = (value: string) => value.toLowerCase().replace(/[-\s]/g, '');
  const needle = squash(query);
  const haystack = [
    stop.jobId,
    stop.jobNo,
    stop.endpointId,
    places.name(stop.endpointId),
    ...stop.containers.flatMap(item => [item.barcode ?? '', item.containerId]),
  ];
  return haystack.some(value => {
    if (!value) return false;
    const lower = value.toLowerCase();
    return lower.includes(query) || squash(value).includes(needle);
  });
}

function matchesStopArea(stop: HandoverStopResponse, areaId: string | null, places: PlaceDirectory): boolean {
  if (!areaId) return true;
  return places.areasOf(stop.endpointId).some(area => area.id === areaId);
}

/** `mine` is my open work; `fleet` is everything not finished; `history` is the finished work. */
function inScope(job: AppJobItem, scope: JobScope, myStopJobIds: Set<string>): boolean {
  const terminal = isTerminalJobStatus(job.status);
  if (scope === 'history') return terminal;
  if (terminal) return false;
  return scope === 'fleet' ? true : (job.isMine || myStopJobIds.has(job.id));
}

const EMPTY_COPY: Record<JobScope, { title: string; message: string }> = {
  mine: {
    title: 'No Claimed Tasks',
    message:
      'Claim an open handover offer or waiting task from Fleet Queue to see it here.',
  },
  fleet: {
    title: 'The fleet queue is clear',
    message:
      'No jobs are waiting for a robot right now. New requests from WES land here as soon as they are dispatched.',
  },
  history: {
    title: 'Nothing in history yet',
    message:
      'Finished, failed and cancelled jobs stay here, so you can check a putaway against its target after the fact.',
  },
};

/**
 * Jobs — the execution centre.
 *
 * One screen, three scopes: what is assigned to me, what the fleet is working,
 * and what has already been done.
 */
export function JobsScreen() {
  const { styles, colors } = useThemedStyles(createStyles);
  const { navigate, params, dockHeight, setActiveJobCount } = useNavigation();
  const { session } = useAuth();
  const client = useQueryClient();
  const { lastJobUpdate, lastHandoverStopsChange } = useRealtime();
  const deepLinkedScope = scopeFromParams(params?.view);
  const [scope, setScope] = useState<JobScope>(deepLinkedScope ?? 'fleet');
  const [query, setQuery] = useState('');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [areaPickerOpen, setAreaPickerOpen] = useState(false);
  const [workZonePickerOpen, setWorkZonePickerOpen] = useState(false);
  const [workZoneError, setWorkZoneError] = useState<string | null>(null);
  const [workZoneSaving, setWorkZoneSaving] = useState(false);
  const places = usePlaceDirectory();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const canOperate = sessionCan(session, PERMISSIONS.jobOperate);
  const canSelectWorkZone = canOperate && session?.role === 'STAFF' && places.areas.length > 0;
  const jobsQuery = useQuery({
    queryKey: ['jobs-list', session?.id],
    queryFn: () => listJobs(),
    enabled: !!session?.id,
    refetchInterval: 5_000,
  });
  const stopsQuery = useQuery({
    queryKey: ['handover-stops', session?.id],
    queryFn: ({ signal }) => listHandoverStops({ signal }),
    enabled: !!session?.id && canOperate,
    refetchInterval: 5_000,
  });
  const workZoneQuery = useQuery({
    queryKey: ['handover-work-zone', session?.id],
    queryFn: ({ signal }) => getMyHandoverWorkZone(signal),
    enabled: Boolean(session?.id && canOperate && session?.role === 'STAFF'),
  });
  const jobsList = useMemo(() => (jobsQuery.data ?? []).map(detail => {
    const job = mapJobDetailToAppJobItem(detail, session?.id);
    // Places read by name (a shelf's storage location name, else the endpoint's own name), never by endpoint code.
    const route = `${places.name(job.sourceEndpointCode, 'Pickup')} ➔ ${places.name(job.destinationEndpointCode, 'Drop-off')}`;
    return { ...job, route, routeText: route, target: places.name(job.destinationEndpointCode, job.target) };
  }), [jobsQuery.data, session?.id, places]);
  const { refetch } = jobsQuery;
  const { refetch: refetchStops } = stopsQuery;
  useEffect(() => {
    if (lastJobUpdate) {
      void refetch();
      if (canOperate) void refetchStops();
    }
  }, [lastJobUpdate, canOperate, refetch, refetchStops]);

  useEffect(() => {
    if (lastHandoverStopsChange && canOperate) {
      void refetchStops();
    }
  }, [lastHandoverStopsChange, canOperate, refetchStops]);

  const onRefresh = async () => {
    triggerHaptic('tap');
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), ...(canOperate ? [refetchStops()] : [])]);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (deepLinkedScope) setScope(deepLinkedScope);
  }, [deepLinkedScope]);

  const bottomInset = dockReservedSpace(dockHeight);
  const area = places.areas.find(item => item.id === areaId) ?? null;
  const myStopJobIds = useMemo(
    () => mergeMyJobIdsWithStops(jobsList, stopsQuery.data ?? [], session?.id),
    [jobsList, stopsQuery.data, session?.id],
  );

  const counts = useMemo(() => {
    const filtered = jobsList.filter(
      (job) => matchesQuery(job, query) && matchesArea(job, areaId, places)
    );
    return {
      mine: filtered.filter((job) => inScope(job, 'mine', myStopJobIds)).length,
      fleet: filtered.filter((job) => inScope(job, 'fleet', myStopJobIds)).length,
      history: filtered.filter((job) => inScope(job, 'history', myStopJobIds)).length,
    } as Record<JobScope, number>;
  }, [jobsList, query, areaId, places, myStopJobIds]);

  useEffect(() => {
    const myActive = jobsList.filter(
      (j) => !isTerminalJobStatus(j.status) && (j.isMine || myStopJobIds.has(j.id)),
    ).length;
    setActiveJobCount(myActive);
  }, [jobsList, myStopJobIds, setActiveJobCount]);

  const visibleStops = useMemo(() => {
    if (!canOperate || scope === 'history') return [];
    const ownerRank = (stop: HandoverStopResponse) => {
      const state = handoverStopOwnerState(stop, session?.id);
      return state === 'free' ? 0 : state === 'mine' ? 1 : 2;
    };
    const matched = (stopsQuery.data ?? []).filter(
      (stop) =>
        matchesStopQuery(stop, query, places) &&
        matchesStopArea(stop, areaId, places) &&
        (scope === 'fleet' || handoverStopOwnerState(stop, session?.id) === 'mine'),
    );
    if (scope === 'mine') return matched;
    return [...matched].sort((a, b) => ownerRank(a) - ownerRank(b));
  }, [canOperate, scope, stopsQuery.data, query, areaId, places, session?.id]);

  const visible = useMemo(
    () =>
      jobsList.filter(
        (job) => inScope(job, scope, myStopJobIds) && matchesQuery(job, query) && matchesArea(job, areaId, places)
      ),
    [jobsList, scope, myStopJobIds, query, areaId, places]
  );

  const options = useMemo(
    () =>
      SCOPES.map((entry) =>
        entry.value === 'history' || jobsQuery.data === undefined
          ? entry
          : { ...entry, label: `${entry.label} (${counts[entry.value]})` }
      ),
    [counts, jobsQuery.data]
  );

  const handleScopeChange = (next: JobScope) => {
    triggerHaptic('tap');
    setScope(next);
  };


  const openJob = (job: AppJobItem) => {
    triggerHaptic('tap');
    navigate('job_detail', { jobId: job.id });
  };

  const activeWorkZoneCode = workZoneQuery.data?.code ?? null;
  const activeWorkZoneLabel = activeWorkZoneCode
    ? (places.areas.find(a => a.code.toUpperCase() === activeWorkZoneCode.toUpperCase())?.name ?? activeWorkZoneCode)
    : t('Warehouse-wide');

  const handleSelectWorkZone = async (nextZoneId: string | null) => {
    if (workZoneSaving) return;
    triggerHaptic('tap');
    setWorkZoneSaving(true);
    setWorkZoneError(null);
    try {
      const updated = await setMyHandoverWorkZone(nextZoneId);
      client.setQueryData(['handover-work-zone', session?.id], updated);
      setWorkZonePickerOpen(false);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['handover-stops'] }),
        client.invalidateQueries({ queryKey: ['handover-stops-mine'] }),
      ]);
    } catch (failure) {
      setWorkZoneError(getUserErrorMessage(failure, 'Could not update your priority work zone.'));
    } finally {
      setWorkZoneSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <SegmentedControl
          options={options}
          value={scope}
          onChange={handleScopeChange}
          accessibilityLabel="Job scope"
          style={styles.scopeControl}
        />

        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search by Job ID, Container, or Rack..."
          placeholderTextColor={colors.textMuted}
          leftIcon={<Search size={18} color={colors.textMuted} />}
          showClearButton
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search jobs"
        />

        {places.areas.length ? (
          <Pressable
            onPress={() => { triggerHaptic('tap'); setAreaPickerOpen(true); }}
            accessibilityRole="button"
            accessibilityLabel={`Area filter: ${area?.name ?? 'All areas'}. Tap to change.`}
            style={({ pressed }) => [styles.areaSelect, area && styles.areaSelectActive, pressed && { opacity: 0.85 }]}
          >
            <MapPin size={15} color={area ? colors.primaryText : colors.textSecondary} />
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }} color={area ? colors.primaryText : colors.textPrimary}>
              {area?.name ?? 'All areas'}
            </Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}

        {canSelectWorkZone ? (
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              setWorkZoneError(null);
              setWorkZonePickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('My Work Zone: {zone}', { zone: activeWorkZoneLabel })}
            style={({ pressed }) => [
              styles.areaSelect,
              activeWorkZoneCode && styles.areaSelectActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <MapPin size={15} color={activeWorkZoneCode ? colors.primaryText : colors.textSecondary} />
            <Text
              variant="label"
              numberOfLines={1}
              style={{ flex: 1 }}
              color={activeWorkZoneCode ? colors.primaryText : colors.textPrimary}
            >
              {t('My Work Zone: {zone}', { zone: activeWorkZoneLabel })}
            </Text>
            <ChevronDown size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onPress={() => openJob(item)}
          />
        )}
        ItemSeparatorComponent={ListSeparator}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          (jobsQuery.error && jobsQuery.data !== undefined) ||
          (canOperate && scope !== 'history' && stopsQuery.isError) ||
          visibleStops.length > 0 ? (
            <View style={styles.listHeaderGroup}>
              {jobsQuery.error && jobsQuery.data !== undefined ? (
                <EmptyState
                  compact
                  tone="warning"
                  title="Could Not Refresh Jobs"
                  message="Showing the last loaded jobs. Refresh before acting on an old status."
                  actionTitle="Retry"
                  onAction={() => { void refetch(); }}
                />
              ) : null}
              {canOperate && scope !== 'history' && stopsQuery.isError ? (
                <EmptyState
                  compact
                  tone="warning"
                  title="Could Not Load Handover Queue"
                  message={getUserErrorMessage(stopsQuery.error, 'Could not load open handover offers. Try again.')}
                  actionTitle="Retry"
                  onAction={() => { void refetchStops(); }}
                />
              ) : null}
              {visibleStops.length > 0 ? (
                <View style={styles.stopsSection}>
                  <Text variant="label" color="textSecondary" style={styles.stopsSectionTitle}>
                    {scope === 'mine'
                      ? t('My Claimed Handovers ({count})', { count: visibleStops.length })
                      : t('Open Handover Offers ({count})', { count: visibleStops.length })}
                  </Text>
                  {visibleStops.map((stop) => (
                    <HandoverStopCard
                      key={`${stop.jobId}:${stop.id}:${stop.moveId}`}
                      stop={stop}
                      placeName={places.name(stop.endpointId, stop.endpointId)}
                      accountId={session?.id}
                      canOperate={canOperate}
                      showJobLink
                      onOpenJob={() => navigate('job_detail', { jobId: stop.jobId })}
                      onUpdated={() => {
                        void refetchStops();
                        void refetch();
                      }}
                      onConfirmedJob={() => {
                        void refetchStops();
                        void refetch();
                      }}
                      onRefresh={refetchStops}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={jobsQuery.data === undefined ? <EmptyState compact
          title={jobsQuery.error ? 'Jobs Unavailable' : jobsQuery.fetchStatus === 'paused' ? 'Waiting For Connection' : 'Loading Jobs…'}
          message={jobsQuery.error ? jobsQuery.error.message : 'The queue has not loaded yet.'}
          actionTitle={jobsQuery.error ? 'Retry' : undefined} onAction={() => { void refetch(); }} /> :
          visibleStops.length > 0 ? undefined :
          <ListEmpty
            scope={scope}
            hasQuery={query.trim().length > 0}
            zone={area?.name}
            onClear={() => setQuery('')}
            onClearZone={() => setAreaId(null)}
            onShowFleet={() => handleScopeChange('fleet')}
          />
        }
      />
      {areaPickerOpen ? <BottomSheet onClose={() => setAreaPickerOpen(false)} accessibilityLabel="Choose an area">
        <View style={styles.areaSheet}>
          <Text variant="title">Filter by area</Text>
          {[{ id: null as string | null, name: 'All areas' }, ...places.areas].map(item => {
            const chosen = item.id === areaId;
            return <Pressable key={item.id ?? 'all'} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
              onPress={() => { triggerHaptic('tap'); setAreaId(item.id); setAreaPickerOpen(false); }}
              style={[styles.areaOption, chosen && styles.areaOptionActive]}>
              <Text variant="bodyMedium" style={{ flex: 1 }} color={chosen ? colors.primaryText : colors.textPrimary}>{item.name}</Text>
              {chosen ? <Check size={18} color={colors.primaryText} /> : null}
            </Pressable>;
          })}
        </View>
      </BottomSheet> : null}
      {workZonePickerOpen ? <BottomSheet onClose={() => setWorkZonePickerOpen(false)} accessibilityLabel={t('My Priority Work Zone')}>
        <View style={styles.areaSheet}>
          <Text variant="title">My Priority Work Zone</Text>
          <Text variant="caption" color="textSecondary">
            Select a ZONE-AREA work zone to prioritize handover offers near you before warehouse-wide release.
          </Text>
          {workZoneError ? <Text variant="caption" color="dangerText">{workZoneError}</Text> : null}
          {[
            { id: null as string | null, code: '', name: t('Warehouse-wide (All Zones)') },
            ...places.areas,
          ].map(item => {
            const chosen = item.id === null
              ? !activeWorkZoneCode
              : Boolean(activeWorkZoneCode && item.code.toUpperCase() === activeWorkZoneCode.toUpperCase());
            return <Pressable key={item.id ?? 'warehouse-wide'} disabled={workZoneSaving} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
              onPress={() => { void handleSelectWorkZone(item.id); }}
              style={[styles.areaOption, chosen && styles.areaOptionActive]}>
              <Text variant="bodyMedium" style={{ flex: 1 }} color={chosen ? colors.primaryText : colors.textPrimary}>{item.name}</Text>
              {chosen ? <Check size={18} color={colors.primaryText} /> : null}
            </Pressable>;
          })}
        </View>
      </BottomSheet> : null}
    </View>
  );
}

function ListSeparator() {
  const { styles } = useThemedStyles(createStyles);
  return <View style={styles.separator} />;
}

/**
 * Three empty states, not one: "your filter found nothing" and "nothing is
 * routed through your zone" are both dead ends the operator can undo with one
 * tap, while "there is genuinely no work" is information — so the last one
 * points at the fleet queue instead of offering a button that would do nothing.
 */
function ListEmpty({
  scope,
  hasQuery,
  zone,
  onClear,
  onClearZone,
  onShowFleet,
}: {
  scope: JobScope;
  hasQuery: boolean;
  zone?: string;
  onClear: () => void;
  onClearZone: () => void;
  onShowFleet: () => void;
}) {
  if (hasQuery) {
    return (
      <EmptyState
        icon={SearchX}
        title="No jobs match that search"
        message="Job numbers, container codes and rack labels are all searchable. Check the spelling, or clear the box to see the full queue."
        actionTitle="Clear search"
        onAction={onClear}
        compact
      />
    );
  }

  if (zone) {
    return (
      <EmptyState
        icon={Filter}
        title={`Nothing routed through ${zone}`}
        message="No open job names this zone as a source or destination. Clear the zone filter to see the whole queue."
        actionTitle="Show all zones"
        onAction={onClearZone}
        compact
      />
    );
  }

  return (
    <EmptyState
      icon={Inbox}
      title={EMPTY_COPY[scope].title}
      message={EMPTY_COPY[scope].message}
      actionTitle={scope === 'mine' ? 'View fleet queue' : undefined}
      onAction={scope === 'mine' ? onShowFleet : undefined}
      compact
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
  },
  scopeControl: {
    marginTop: 2,
  },
  /**
   * A filter that hides rows has to announce itself, or the operator reads the
   * shorter list as "this is everything there is". The active state therefore
   * carries the full sentence rather than just a tint.
   */
  zoneFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  areaSelect: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: radii.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  areaSelectActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryBorder },
  areaSheet: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  areaOption: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.surfaceSubtle },
  areaOptionActive: { backgroundColor: colors.primaryLight },
  zoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneChipActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  zoneChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  zoneChipTextActive: {
    fontWeight: '700',
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listHeaderGroup: {
    gap: 12,
    marginBottom: 12,
  },
  stopsSection: {
    gap: 10,
  },
  stopsSectionTitle: {
    fontWeight: '700',
  },
  separator: {
    height: 12,
  },
});
