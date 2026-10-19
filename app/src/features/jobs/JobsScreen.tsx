import { Filter, Inbox, MapPin, Search, SearchX, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace, useTopInset } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import {
  EmptyState,
  SegmentedControl,
  Text,
  TextField,
} from '../../shared/ui';
import { toast } from '../../shared/context/ToastContext';
import { triggerHaptic } from '../../shared/utils/haptics';
import { acceptHumanTask, listJobs, startJob } from '../../shared/api';
import { useRealtime } from '../../shared/realtime/RealtimeContext';
import { JobCard } from './JobCard';
import { AppJobItem, countMyActiveJobs, isTerminalJobStatus, mapJobDetailToAppJobItem, MOCK_JOBS } from './jobData';

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

/* -------------------------------------------------------------------------- */
/* Zone matching                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Words that describe the *building*, not the place. `Inbound Dock 01` and
 * `Outbound Dock 04` are different places that share the word "dock", so these
 * cannot be what makes a job belong to a zone — only the place codes below can.
 */
const ZONE_NOISE_WORDS: ReadonlySet<string> = new Set([
  'area',
  'bay',
  'dock',
  'docks',
  'inbound',
  'outbound',
  'receiving',
  'shipping',
  'staging',
  'warehouse',
  'zone',
  'zones',
]);

/** "Dock 01 ➔ Rack A-02" -> ['dock', '01', 'rack', 'a', '02']. */
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * The place codes that make a zone name specific: a numbered dock (`01`), a
 * lettered zone (`a`), a rack range (`a01`). The generic warehouse words never
 * qualify — see `ZONE_NOISE_WORDS`.
 */
function matchesZone(job: AppJobItem, zone: string): boolean {
  const zLower = zone.toLowerCase();
  const text = [
    job.route,
    job.routeText,
    job.target,
    job.sourceEndpointCode,
    job.destinationEndpointCode,
    job.currentStop,
    ...job.stopsList.map((stop) => `${stop.name} ${stop.description}`),
  ]
    .join(' ')
    .toLowerCase();

  if (zLower.includes('inbound') || zLower.includes('dock 01') || zLower.includes('dock 1')) {
    return ['dock 01', 'dock-01', 'dock-in', 'inbound', 'ep-a', 'ep-b'].some((code) => text.includes(code));
  }
  if (zLower.includes('zone a')) {
    return ['rack a', 'rack-a', 'zone a', 'ep-a', 'ep-b', 'ep-c'].some((code) => text.includes(code));
  }
  if (zLower.includes('zone b')) {
    return ['rack b', 'rack-b', 'zone b', 'ep-d', 'ep-e', 'ep-f'].some((code) => text.includes(code));
  }
  if (zLower.includes('outbound') || zLower.includes('dock 04') || zLower.includes('shipping')) {
    return ['dock 04', 'dock out', 'dock-out', 'outbound', 'shipping', 'ep-d', 'ep-e', 'ep-f'].some((code) => text.includes(code));
  }
  return true;
}

/** No zone selected -> everything is visible. This is the only place that says so. */
function matchesZoneFilter(job: AppJobItem, zone: string | null): boolean {
  return zone === null ? true : matchesZone(job, zone);
}

/** `mine` is my open work; `fleet` is everything not finished; `history` is the finished work. */
function inScope(job: AppJobItem, scope: JobScope): boolean {
  const terminal = isTerminalJobStatus(job.status);
  if (scope === 'history') return terminal;
  if (terminal) return false;
  return scope === 'fleet' ? true : job.isMine;
}

const EMPTY_COPY: Record<JobScope, { title: string; message: string }> = {
  mine: {
    title: 'No tasks assigned to you',
    message:
      'Handover tasks in your work zone appear here. Check the fleet queue to pick up work another operator has not started.',
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
  const { navigate, params, dockHeight, setActiveJobCount } = useNavigation();
  const { session } = useAuth();
  const { lastJobUpdate } = useRealtime();
  const deepLinkedScope = scopeFromParams(params?.view);
  const [scope, setScope] = useState<JobScope>(deepLinkedScope ?? 'mine');
  const [query, setQuery] = useState('');
  const [isZoneOnly, setIsZoneOnly] = useState(false);
  const [jobsList, setJobsList] = useState<AppJobItem[]>(MOCK_JOBS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadJobs = React.useCallback(async () => {
    try {
      const res = await listJobs();
      const realJobs = res.filter((job) => !['JOB-2026-0812', 'JOB-2026-0819'].includes(job.id));
      const mapped = (realJobs.length > 0 ? realJobs : res).map(mapJobDetailToAppJobItem);
      const liveIds = new Set(mapped.map((job) => job.id));
      setJobsList(realJobs.length > 0 ? mapped : [...mapped, ...MOCK_JOBS.filter((job) => !liveIds.has(job.id))]);
    } catch (err) {
      console.warn('JobsScreen loadJobs error:', err);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (lastJobUpdate) {
      loadJobs();
    }
  }, [lastJobUpdate, loadJobs]);

  const onRefresh = async () => {
    triggerHaptic('tap');
    setIsRefreshing(true);
    await loadJobs();
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (deepLinkedScope) setScope(deepLinkedScope);
  }, [deepLinkedScope]);

  const bottomInset = dockReservedSpace(dockHeight);
  const zoneScope = isZoneOnly && session?.zone ? session.zone : null;

  const counts = useMemo(() => {
    const filtered = jobsList.filter(
      (job) => matchesQuery(job, query) && matchesZoneFilter(job, zoneScope)
    );
    return {
      mine: filtered.filter((job) => inScope(job, 'mine')).length,
      fleet: filtered.filter((job) => inScope(job, 'fleet')).length,
      history: filtered.filter((job) => inScope(job, 'history')).length,
    } as Record<JobScope, number>;
  }, [jobsList, query, zoneScope]);

  useEffect(() => {
    const myActive = jobsList.filter((j) => j.isMine && !isTerminalJobStatus(j.status)).length;
    setActiveJobCount(myActive);
  }, [jobsList, setActiveJobCount]);

  const visible = useMemo(
    () =>
      jobsList.filter(
        (job) => inScope(job, scope) && matchesQuery(job, query) && matchesZoneFilter(job, zoneScope)
      ),
    [jobsList, scope, query, zoneScope]
  );

  const options = useMemo(
    () =>
      SCOPES.map((entry) =>
        entry.value === 'history'
          ? entry
          : { ...entry, label: `${entry.label} (${counts[entry.value]})` }
      ),
    [counts]
  );

  const handleScopeChange = (next: JobScope) => {
    triggerHaptic('tap');
    setScope(next);
  };

  const toggleZoneFilter = () => {
    triggerHaptic('tap');
    setIsZoneOnly((previous) => !previous);
  };

  const openJob = (job: AppJobItem) => {
    triggerHaptic('tap');
    navigate('job_detail', { jobId: job.id });
  };

  const handleAcceptTask = async (job: AppJobItem) => {
    triggerHaptic('success');
    try {
      if (job.status === 'CREATED' || job.status === 'QUEUED') {
        const updated = await startJob(job.id);
        if (!updated) throw new Error('Job could not be started');
        toast.success(`Job ${job.jobNo || job.id} started!`);
        await loadJobs();
        navigate('job_detail', { jobId: job.id });
        return;
      }
      await acceptHumanTask(job.id, session?.id || 'staff-01');
      toast.success(`Task ${job.id} accepted! Moved to My Tasks.`);
      setJobsList((prev) =>
        prev.map((j) =>
          j.id === job.id
            ? {
                ...j,
                isMine: true,
                status: j.status === 'CREATED' || j.status === 'QUEUED' ? 'ASSIGNED' : j.status,
              }
            : j
        )
      );
      setScope('mine');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to accept task');
    }
  };

  const topInset = useTopInset();

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: topInset + 12 }]}>
        <View style={styles.screenHeader}>
          <Text variant="display" color={colors.textPrimary} style={styles.pageTitle}>
            Job Execution Center
          </Text>
        </View>

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

        {session?.zone ? (
          <View style={styles.zoneFilterRow}>
            <Pressable
              onPress={() => {
                if (isZoneOnly) {
                  triggerHaptic('tap');
                  setIsZoneOnly(false);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Show jobs across all zones"
              style={[
                styles.zoneChip,
                !isZoneOnly && styles.zoneChipActive,
              ]}
            >
              <Text
                variant="caption"
                style={[
                  styles.zoneChipText,
                  !isZoneOnly && styles.zoneChipTextActive,
                ]}
              >
                All Zones
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (!isZoneOnly) {
                  triggerHaptic('tap');
                  setIsZoneOnly(true);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={`Filter jobs to my zone ${session.zone}`}
              style={[
                styles.zoneChip,
                isZoneOnly && styles.zoneChipActive,
              ]}
            >
              <MapPin
                size={13}
                color={isZoneOnly ? '#ffffff' : colors.textSecondary}
                style={{ marginRight: 5 }}
              />
              <Text
                variant="caption"
                style={[
                  styles.zoneChipText,
                  isZoneOnly && styles.zoneChipTextActive,
                ]}
              >
                My Zone: {session.zone}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JobCard
            job={item}
            onPress={() => openJob(item)}
            onAccept={() => handleAcceptTask(item)}
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
        ListEmptyComponent={
          <ListEmpty
            scope={scope}
            hasQuery={query.trim().length > 0}
            zone={zoneScope ?? undefined}
            onClear={() => setQuery('')}
            onClearZone={toggleZoneFilter}
            onShowFleet={() => handleScopeChange('fleet')}
          />
        }
      />
    </View>
  );
}

function ListSeparator() {
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  screenHeader: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  pageTitle: {
    fontWeight: '800',
    letterSpacing: -0.4,
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
  separator: {
    height: 12,
  },
});
