import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCheck,
  Filter,
  History,
  MapPin,
  Radio,
  ScanLine,
  Search,
  SearchX,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
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
import { useLanguage } from '../../shared/i18n/LanguageContext';
import type { HandoverStopResponse } from '../../shared/types/contracts';
import { useRealtime } from '../../shared/realtime/RealtimeContext';
import { HandoverStopCard } from './HandoverStopCard';
import { handoverStopOwnerState, mergeMyJobIdsWithStops } from './handoverData';
import { JobCard } from './JobCard';
import { BottomSheet } from '../../shared/ui/BottomSheet';
import { usePlaceDirectory } from '../../shared/places/usePlaceDirectory';
import type { PlaceDirectory } from '../../shared/places/placeDirectory';
import {
  AppJobItem,
  formatPlaceDisplayName,
  groupHistoryJobs,
  HistoryListRow,
  isTerminalJobStatus,
  mapJobDetailToAppJobItem,
} from './jobData';

type JobScope = 'mine' | 'fleet' | 'history';
type HistoryStatusFilter = 'ALL' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
type JobListRow = HistoryListRow | { type: 'job'; key: string; job: AppJobItem };

const SCOPES: ReadonlyArray<{ label: string; value: JobScope }> = [
  { label: 'My Tasks', value: 'mine' },
  { label: 'All', value: 'fleet' },
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
  const { language } = useLanguage();
  const client = useQueryClient();
  const { isConnected, lastJobUpdate, lastHandoverStopsChange } = useRealtime();
  const deepLinkedScope = scopeFromParams(params?.view);
  const [scope, setScope] = useState<JobScope>(deepLinkedScope ?? 'fleet');
  const [query, setQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>('ALL');
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
    // Places read by name (a shelf's storage location name, else the endpoint's own name), never raw endpoint codes.
    const sourceName = formatPlaceDisplayName(places, job.sourceEndpointCode, 'Pickup');
    const destinationName = formatPlaceDisplayName(places, job.destinationEndpointCode, 'Drop-off');
    const route = `${sourceName} ➔ ${destinationName}`;
    const currentStop = job.currentStop ? formatPlaceDisplayName(places, job.currentStop, '') : '';
    return { ...job, sourceName, destinationName, currentStop, route, routeText: route, target: destinationName };
  }), [jobsQuery.data, session?.id, places]);

  const jobsById = useMemo(
    () => new Map(jobsList.map((job) => [job.id, job])),
    [jobsList],
  );
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

  const unfilteredCounts = useMemo(() => {
    const stops = stopsQuery.data ?? [];
    const mineJobs = jobsList.filter((job) => inScope(job, 'mine', myStopJobIds));
    const fleetJobs = jobsList.filter((job) => inScope(job, 'fleet', myStopJobIds));
    const historyJobs = jobsList.filter((job) => inScope(job, 'history', myStopJobIds));

    const mineJobIds = new Set(mineJobs.map((j) => j.id));
    const fleetJobIds = new Set(fleetJobs.map((j) => j.id));
    const extraMineStops = canOperate
      ? stops.filter((s) => handoverStopOwnerState(s, session?.id) === 'mine' && !mineJobIds.has(s.jobId)).length
      : 0;
    const extraFleetStops = canOperate
      ? stops.filter((s) => !fleetJobIds.has(s.jobId)).length
      : 0;

    return {
      mine: mineJobs.length + extraMineStops,
      fleet: fleetJobs.length + extraFleetStops,
      history: historyJobs.length,
      historyFailed: historyJobs.filter((j) => j.status === 'FAILED').length,
    };
  }, [jobsList, myStopJobIds, stopsQuery.data, canOperate, session?.id]);

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

  const filteredVisible = useMemo(
    () =>
      scope !== 'history' || historyFilter === 'ALL'
        ? visible
        : visible.filter((job) => job.status === historyFilter),
    [scope, historyFilter, visible]
  );

  const listRows = useMemo<JobListRow[]>(() => {
    if (scope === 'history') {
      return groupHistoryJobs(filteredVisible, new Date(), language);
    }
    const stopJobIds = new Set(visibleStops.map((stop) => stop.jobId));
    return filteredVisible
      .filter((job) => !stopJobIds.has(job.id))
      .map((job) => ({ type: 'job', key: job.id, job }));
  }, [scope, filteredVisible, visibleStops, language]);

  const options = useMemo(
    () =>
      SCOPES.map((entry) => ({
        ...entry,
        label: entry.value === 'fleet' && language === 'vi' ? 'Toàn kho' : entry.label,
        badge:
          entry.value === 'history' || jobsQuery.data === undefined
            ? undefined
            : counts[entry.value],
      })),
    [counts, jobsQuery.data, language]
  );

  const hasAnyInScope = unfilteredCounts[scope] > 0;
  const showSearch = hasAnyInScope || query.trim().length > 0;
  const showHistoryFilters = scope === 'history' && unfilteredCounts.history > 0;
  const isEmptyList = jobsQuery.data === undefined || (listRows.length === 0 && visibleStops.length === 0);

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

        {showSearch ? (
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder="Search by Job ID, container, or rack…"
            placeholderTextColor={colors.textMuted}
            leftIcon={<Search size={18} color={colors.textMuted} />}
            showClearButton
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search jobs"
          />
        ) : null}

        {showHistoryFilters ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.historyFiltersRow}
          >
            {(
              [
                { value: 'ALL', label: 'All' },
                { value: 'COMPLETED', label: 'Completed' },
                { value: 'CANCELLED', label: 'Cancelled' },
                ...(unfilteredCounts.historyFailed > 0 || historyFilter === 'FAILED'
                  ? [{ value: 'FAILED' as const, label: 'Failed' }]
                  : []),
              ] as const
            ).map((chip) => {
              const active = historyFilter === chip.value;
              return (
                <Pressable
                  key={chip.value}
                  onPress={() => {
                    triggerHaptic('tap');
                    setHistoryFilter(chip.value);
                  }}
                  hitSlop={{ top: 5, bottom: 5 }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.historyChip,
                    active && styles.historyChipActive,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    variant="caption"
                    color={active ? '#ffffff' : colors.textSecondary}
                    fontWeight={active ? '600' : '500'}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

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
        data={listRows}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index }) => {
          if (item.type === 'date') {
            return (
              <View style={[styles.dateHeaderWrap, index > 0 && styles.dateHeaderSpaced]}>
                <Text variant="caption" color="textSecondary" style={styles.dateHeaderText}>
                  {item.label}
                </Text>
              </View>
            );
          }

          const prevIsJob = index > 0 && listRows[index - 1]?.type === 'job';
          return (
            <View style={prevIsJob ? styles.jobRowSpaced : undefined}>
              <JobCard
                job={item.job}
                variant={scope === 'history' ? 'history' : 'active'}
                onPress={() => openJob(item.job)}
              />
            </View>
          );
        }}
        contentContainerStyle={[
          styles.listContent,
          isEmptyList && styles.listContentEmpty,
          { paddingBottom: bottomInset },
        ]}
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
                  {visibleStops.map((stop) => {
                    const stopJob = jobsById.get(stop.jobId);
                    return (
                      <HandoverStopCard
                        key={`${stop.jobId}:${stop.id}:${stop.moveId}`}
                        stop={stop}
                        placeName={formatPlaceDisplayName(places, stop.endpointId, stop.endpointId)}
                        jobMeta={stopJob ? {
                          workflowName: stopJob.workflowName,
                          routeLabel: stopJob.route,
                          robotCode: stopJob.robot !== 'Unassigned' ? stopJob.robot : undefined,
                        } : undefined}
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
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : undefined
        }
        ListEmptyComponent={jobsQuery.data === undefined ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              title={jobsQuery.error ? 'Jobs Unavailable' : jobsQuery.fetchStatus === 'paused' ? 'Waiting For Connection' : 'Loading Jobs…'}
              message={jobsQuery.error ? jobsQuery.error.message : 'The queue has not loaded yet.'}
              actionTitle={jobsQuery.error ? 'Retry' : undefined}
              onAction={() => { void refetch(); }}
            />
          </View>
        ) : visibleStops.length > 0 ? undefined : (
          <View style={styles.emptyWrap}>
            <ListEmpty
              scope={scope}
              hasQuery={query.trim().length > 0}
              zone={area?.name}
              historyFilter={historyFilter}
              fleetAvailableCount={unfilteredCounts.fleet}
              isConnected={isConnected}
              onClear={() => setQuery('')}
              onClearZone={() => setAreaId(null)}
              onClearHistoryFilter={() => setHistoryFilter('ALL')}
              onShowFleet={() => handleScopeChange('fleet')}
              onScan={() => {
                triggerHaptic('tap');
                navigate('scanner');
              }}
            />
          </View>
        )}
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

/**
 * State-aware empty states: filter dead-ends get one-tap resets, "My Tasks"
 * checks whether the fleet queue actually has work before offering a jump
 * there (and falls back to scanning when the whole floor is clear), and
 * "Fleet Queue" surfaces real WES realtime connectivity.
 */
function ListEmpty({
  scope,
  hasQuery,
  zone,
  historyFilter,
  fleetAvailableCount,
  isConnected,
  onClear,
  onClearZone,
  onClearHistoryFilter,
  onShowFleet,
  onScan,
}: {
  scope: JobScope;
  hasQuery: boolean;
  zone?: string;
  historyFilter: HistoryStatusFilter;
  fleetAvailableCount: number;
  isConnected: boolean;
  onClear: () => void;
  onClearZone: () => void;
  onClearHistoryFilter: () => void;
  onShowFleet: () => void;
  onScan: () => void;
}) {
  if (hasQuery) {
    return (
      <EmptyState
        icon={SearchX}
        title="No Matching Jobs"
        message="Check the Job ID, container, or rack spelling, or clear the search."
        actionTitle="Clear Search"
        actionVariant="secondary"
        onAction={onClear}
      />
    );
  }

  if (zone) {
    return (
      <EmptyState
        icon={Filter}
        title={t('Nothing Routed Through {zone}', { zone })}
        message="No jobs in this view start or end in that area."
        actionTitle="Show All Zones"
        actionVariant="secondary"
        onAction={onClearZone}
      />
    );
  }

  if (scope === 'history' && historyFilter !== 'ALL') {
    return (
      <EmptyState
        icon={Filter}
        title="No Matching History"
        message="No past jobs match this status filter."
        actionTitle="Show All History"
        actionVariant="secondary"
        onAction={onClearHistoryFilter}
      />
    );
  }

  if (scope === 'mine') {
    if (fleetAvailableCount > 0) {
      return (
        <EmptyState
          icon={ClipboardCheck}
          title="No Claimed Tasks"
          message="Claim an open handover or waiting job from All Jobs to begin."
          actionTitle={t('Browse All Jobs ({count})', { count: fleetAvailableCount })}
          actionVariant="secondary"
          actionIcon={ArrowRight}
          actionIconPosition="right"
          onAction={onShowFleet}
        />
      );
    }

    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No Claimed Tasks"
        message="No open jobs across the warehouse either. Scan a container or pull down to refresh."
        actionTitle="Scan Container"
        actionVariant="secondary"
        actionIcon={ScanLine}
        actionIconPosition="left"
        onAction={onScan}
      />
    );
  }

  if (scope === 'fleet') {
    return (
      <EmptyState
        icon={Radio}
        title="All Jobs Clear"
        message="New dispatches from WES will appear here automatically."
        statusIndicator={
          isConnected
            ? { label: 'WES connected · Standing by', tone: 'success' }
            : { label: 'Reconnecting to WES…', tone: 'warning' }
        }
      />
    );
  }

  return (
    <EmptyState
      icon={History}
      title="No Job History Yet"
      message="Completed, failed, and cancelled jobs will be logged here."
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
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  historyFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  historyChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyChipActive: {
    backgroundColor: colors.darkAction,
    borderColor: colors.darkAction,
  },
  dateHeaderWrap: {
    paddingTop: 2,
    paddingBottom: 8,
  },
  dateHeaderSpaced: {
    marginTop: 16,
  },
  dateHeaderText: {
    fontWeight: '600',
  },
  jobRowSpaced: {
    marginTop: 12,
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
});
