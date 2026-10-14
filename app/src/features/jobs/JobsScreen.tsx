import { Filter, Inbox, Search, SearchX, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../auth/authContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { radii } from '../../shared/theme/radii';
import {
  EmptyState,
  SegmentedControl,
  Text,
  TextField,
} from '../../shared/ui';
import { triggerHaptic } from '../../shared/utils/haptics';
import { JobCard } from './JobCard';
import { AppJobItem, countMyActiveJobs, isTerminalJobStatus, MOCK_JOBS } from './jobData';

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
function zonePlaceCodes(zone: string): string[] {
  return tokenize(zone).filter(
    (token) =>
      !ZONE_NOISE_WORDS.has(token) && (/[0-9]/.test(token) || /^[a-z]$/.test(token))
  );
}

/**
 * Does this job belong to the operator's zone?
 *
 * The rule is deliberately text-based rather than an id join: the mock carries
 * endpoint *codes* (`Dock 01`, `Rack A-02`) and nothing that says which zone
 * code belongs to, so the only honest implementation with the data on hand is
 * "does the job name the same place the zone names".
 *
 *   1. At least one of the zone's place codes appears in the job's own place
 *      text (`Inbound Dock 01` -> `01`; a job routed through `Dock 01` matches).
 *   2. Neither side contradicts the other on *direction*: an inbound zone does
 *      not match a job whose endpoints say `Outbound`, and vice versa. This is
 *      what stops `Dock Out 01` being treated as `Inbound Dock 01`.
 */
function matchesZone(job: AppJobItem, zone: string): boolean {
  const zoneCodes = zonePlaceCodes(zone);
  if (zoneCodes.length === 0) return true; // Unknown zone shape: do not hide work.

  const jobTokens = new Set(
    tokenize(
      [
        job.route,
        job.routeText,
        job.target,
        job.sourceEndpointCode,
        job.destinationEndpointCode,
        job.currentStop,
        ...job.stopsList.map((stop) => `${stop.name} ${stop.description}`),
        ...job.containers.map((container) => container.location),
      ].join(' ')
    )
  );

  const zoneDirection = tokenize(zone).find(
    (token) => token === 'inbound' || token === 'outbound'
  );
  const jobIsOutbound = jobTokens.has('outbound');
  const jobIsInbound = jobTokens.has('inbound');
  if (zoneDirection === 'inbound' && jobIsOutbound && !jobIsInbound) return false;
  if (zoneDirection === 'outbound' && jobIsInbound && !jobIsOutbound) return false;

  return zoneCodes.some((code) =>
    Array.from(jobTokens).some((token) => token === code || token.startsWith(code))
  );
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
 * and what has already been done. The scopes are a segmented control rather
 * than separate tabs because an operator moves between them constantly (check
 * mine, glance at the fleet, back to mine) and re-picking a bottom tab for each
 * hop would cost more than the list is worth.
 *
 * Search runs across every scope's data — the query is what the operator
 * remembers, not the filter they happened to be on — so typing a container code
 * while History is selected still finds the job that is still running.
 *
 * The zone filter is a *second*, narrower axis on top of that: the operator's
 * shift is in one zone, and the header already says which one. It is off by
 * default (an operator checking the fleet still wants the whole fleet) and says
 * so on the chip when it is on.
 */
export function JobsScreen() {
  const { navigate, params, dockHeight, setActiveJobCount } = useNavigation();
  const { session } = useAuth();
  const deepLinkedScope = scopeFromParams(params?.view);
  const [scope, setScope] = useState<JobScope>(deepLinkedScope ?? 'mine');
  const [query, setQuery] = useState('');
  const [isZoneOnly, setIsZoneOnly] = useState(false);

  /**
   * Re-syncing on `params.view` (rather than only reading it as a `useState`
   * initialiser) matters because `navigate('jobs', { view: 'history' })` from
   * another screen re-uses this component instance instead of remounting it —
   * without the effect the screen would stay on whatever the operator last
   * tapped.
   */
  useEffect(() => {
    if (deepLinkedScope) setScope(deepLinkedScope);
  }, [deepLinkedScope]);

  /** Measured against the live bottom bar. `dockReservedSpace` already carries
   *  the gutter, so this adds nothing on top of it. */
  const bottomInset = dockReservedSpace(dockHeight);

  /** `null` while the filter is off, or when there is no signed-in session. */
  const zoneScope = isZoneOnly && session?.zone ? session.zone : null;

  const counts = useMemo(() => {
    const filtered = MOCK_JOBS.filter(
      (job) => matchesQuery(job, query) && matchesZoneFilter(job, zoneScope)
    );
    return {
      mine: filtered.filter((job) => inScope(job, 'mine')).length,
      fleet: filtered.filter((job) => inScope(job, 'fleet')).length,
      history: filtered.filter((job) => inScope(job, 'history')).length,
    } as Record<JobScope, number>;
  }, [query, zoneScope]);

  /**
   * The bar's badge counts *my open work*, unfiltered — a badge that changed
   * every keystroke would be noise, and a badge that counted completed history
   * would be a lie. It is seeded from the same helper, so this only keeps it
   * honest once the data changes underneath it.
   */
  useEffect(() => {
    setActiveJobCount(countMyActiveJobs());
  }, [setActiveJobCount]);

  const visible = useMemo(
    () =>
      MOCK_JOBS.filter(
        (job) => inScope(job, scope) && matchesQuery(job, query) && matchesZoneFilter(job, zoneScope)
      ),
    [scope, query, zoneScope]
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text variant="title">Job Execution Center</Text>
        <Text variant="caption" color={colors.textSecondary}>
          {counts.mine} assigned to you · {counts.fleet} in the fleet queue
        </Text>

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
          <Pressable
            onPress={toggleZoneFilter}
            accessibilityRole="switch"
            accessibilityState={{ checked: isZoneOnly }}
            accessibilityLabel={`Filter jobs to ${session.zone}`}
            style={({ pressed }) => [
              styles.zoneFilter,
              isZoneOnly && styles.zoneFilterActive,
              pressed && styles.zoneFilterPressed,
            ]}
          >
            <Filter size={15} color={isZoneOnly ? colors.primaryText : colors.textSecondary} />
            <Text
              variant="label"
              color={isZoneOnly ? colors.primaryText : colors.textSecondary}
              numberOfLines={1}
              style={styles.zoneFilterText}
            >
              {isZoneOnly
                ? `Filtered by ${session.zone}`
                : `Filter to my zone · ${session.zone}`}
            </Text>
            {isZoneOnly ? (
              <View style={styles.zoneFilterClear}>
                <X size={12} color={colors.primaryText} strokeWidth={2.6} />
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JobCard job={item} onPress={() => openJob(item)} />
        )}
        ItemSeparatorComponent={ListSeparator}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
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
  scopeControl: {
    marginTop: 2,
  },
  /**
   * A filter that hides rows has to announce itself, or the operator reads the
   * shorter list as "this is everything there is". The active state therefore
   * carries the full sentence rather than just a tint.
   */
  zoneFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    minHeight: 44,
    maxWidth: '100%',
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneFilterActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
  },
  zoneFilterPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  zoneFilterText: {
    flexShrink: 1,
    fontWeight: '600',
  },
  zoneFilterClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  separator: {
    height: 12,
  },
});