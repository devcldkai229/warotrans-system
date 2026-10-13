import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CheckCircle2, Filter, Search, SearchX, SlidersHorizontal, X } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { useTopInset } from '../../shared/theme/layout';
import { triggerHaptic } from '../../shared/utils/haptics';
import { JobCard } from './JobCard';
import { AppJobItem, MOCK_JOBS } from './jobData';

type ViewMode = 'active' | 'global' | 'history';
type WorkflowFilter = 'ALL' | 'INBOUND' | 'OUTBOUND' | 'REPLENISHMENT';

export function JobsScreen() {
  const { navigate, params } = useNavigation();
  const topInset = useTopInset();
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (params?.view === 'global' || params?.view === 'history') return params.view;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const v = sp.get('view');
        const s = sp.get('screen');
        if (v === 'global' || s === 'jobs-global') return 'global';
        if (v === 'history' || s === 'jobs-history') return 'history';
      } catch {
        // Fallback
      }
    }
    return 'active';
  });
  const [search, setSearch] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowFilter>('ALL');
  const [showFilterChips, setShowFilterChips] = useState(false);

  const q = search.trim().toLowerCase();
  const qNorm = q.replace(/[-\s]/g, '');

  const matchesSearch = (job: AppJobItem) => {
    if (!q) return true;

    // 1. Job ID & Number (supports exact, partial, and unhyphenated e.g. "JOB20260812")
    const id = (job.id || '').toLowerCase();
    const idNorm = id.replace(/[-\s]/g, '');
    const jobNo = (job.jobNo || '').toLowerCase();
    const jobNoNorm = jobNo.replace(/[-\s]/g, '');
    if (id.includes(q) || idNorm.includes(qNorm) || jobNo.includes(q) || jobNoNorm.includes(qNorm)) {
      return true;
    }

    // 2. Container codes, barcodes, payload summary, and product names
    const payload = (job.payloadSummary || '').toLowerCase();
    if (payload.includes(q)) return true;

    if (
      job.containers?.some((c) => {
        const code = (c.code || '').toLowerCase();
        const codeNorm = code.replace(/[-\s]/g, '');
        const prod = (c.product || '').toLowerCase();
        return code.includes(q) || codeNorm.includes(qNorm) || prod.includes(q);
      })
    ) {
      return true;
    }

    if (
      job.slots?.some((s) => {
        const bc = (s.containerBarcode || '').toLowerCase();
        const bcNorm = bc.replace(/[-\s]/g, '');
        const pName = (s.productName || '').toLowerCase();
        return bc.includes(q) || bcNorm.includes(qNorm) || pName.includes(q);
      })
    ) {
      return true;
    }

    // 3. Shelf locations, stops, routes, and endpoints
    const target = (job.target || '').toLowerCase();
    const currentStop = (job.currentStop || '').toLowerCase();
    const route = (job.route || '').toLowerCase();
    const routeText = (job.routeText || '').toLowerCase();
    const srcEndpoint = (job.sourceEndpointCode || '').toLowerCase();
    const dstEndpoint = (job.destinationEndpointCode || '').toLowerCase();

    if (
      target.includes(q) ||
      currentStop.includes(q) ||
      route.includes(q) ||
      routeText.includes(q) ||
      srcEndpoint.includes(q) ||
      dstEndpoint.includes(q)
    ) {
      return true;
    }

    // Specific container drop locations (e.g. Rack B · Level 1 · Bin 01)
    if (job.containers?.some((c) => (c.location || '').toLowerCase().includes(q))) {
      return true;
    }

    // Stop items list names & descriptions
    if (
      job.stopsList?.some(
        (st) =>
          (st.name || '').toLowerCase().includes(q) ||
          (st.description || '').toLowerCase().includes(q)
      )
    ) {
      return true;
    }

    // 4. Robot assignment & Workflow names
    const robot = (job.robot || '').toLowerCase();
    const assignedRobot = (job.assignedRobotCode || '').toLowerCase();
    const workflow = (job.workflowName || '').toLowerCase();
    const wfCode = (job.workflowCode || '').toLowerCase();

    return (
      robot.includes(q) ||
      assignedRobot.includes(q) ||
      workflow.includes(q) ||
      wfCode.includes(q)
    );
  };

  const matchesWorkflow = (job: AppJobItem) => {
    if (selectedWorkflow === 'ALL') return true;
    const wf = (job.workflowCode || '').toUpperCase();
    if (selectedWorkflow === 'INBOUND') return wf.includes('INBOUND');
    if (selectedWorkflow === 'OUTBOUND') return wf.includes('OUTBOUND');
    if (selectedWorkflow === 'REPLENISHMENT') return wf.includes('REPLENISH') || wf.includes('CROSS_DOCK');
    return true;
  };

  const activeCount = MOCK_JOBS.filter((j) => j.isMine && j.kind !== 'complete' && matchesSearch(j) && matchesWorkflow(j)).length;
  const globalCount = MOCK_JOBS.filter((j) => j.kind !== 'complete' && matchesSearch(j) && matchesWorkflow(j)).length;
  const historyCount = MOCK_JOBS.filter((j) => j.kind === 'complete' && matchesSearch(j) && matchesWorkflow(j)).length;

  const visible = MOCK_JOBS.filter((job) => {
    const matchView =
      viewMode === 'active'
        ? job.isMine && job.kind !== 'complete'
        : viewMode === 'global'
          ? job.kind !== 'complete'
          : job.kind === 'complete';
    if (!matchView) return false;
    return matchesSearch(job) && matchesWorkflow(job);
  });

  const handleOpenJob = (job: AppJobItem) => {
    triggerHaptic('tap');
    navigate('job_detail', { jobId: job.id });
  };

  return (
    <View style={styles.container}>
      {/* Page Header (Matching Prototype PageHeader exactly) */}
      <View style={[styles.pageHeader, { paddingTop: topInset, minHeight: topInset + 56 }]}>
        <Text style={styles.eyebrow}>EXECUTION CENTER</Text>
        <Text style={styles.pageTitle}>Job Control</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Bar & Filter Toggle Row */}
        <View style={styles.searchSection}>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={15} color={colors.textSecondary} style={styles.searchIcon} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search by Job ID, Container, Shelf / Bin..."
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
              {search ? (
                <Pressable
                  onPress={() => setSearch('')}
                  style={styles.clearBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <X size={14} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              onPress={() => {
                triggerHaptic('tap');
                setShowFilterChips(!showFilterChips);
              }}
              style={[
                styles.filterBtn,
                (selectedWorkflow !== 'ALL' || showFilterChips) && styles.filterBtnActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Toggle workflow filter"
            >
              <SlidersHorizontal
                size={16}
                color={selectedWorkflow !== 'ALL' || showFilterChips ? colors.primary : colors.textSecondary}
              />
              {selectedWorkflow !== 'ALL' && <View style={styles.filterDotBadge} />}
            </Pressable>
          </View>

          {/* Collapsible Workflow Filter Chips */}
          {showFilterChips && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterChipsRow}
            >
              {[
                { key: 'ALL', label: 'All Types' },
                { key: 'INBOUND', label: 'Inbound Putaway' },
                { key: 'OUTBOUND', label: 'Outbound Retrieval' },
                { key: 'REPLENISHMENT', label: 'Replenishment / Move' },
              ].map((chip) => {
                const isActive = selectedWorkflow === chip.key;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => {
                      triggerHaptic('tap');
                      setSelectedWorkflow(chip.key as WorkflowFilter);
                    }}
                    style={[
                      styles.filterChip,
                      isActive && styles.filterChipActive,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Filter by ${chip.label}`}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        isActive && styles.filterChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* 3-Column Scope Segmented Control (My Active | Fleet | History) */}
        <View style={styles.scopeBar}>
          {(['active', 'global', 'history'] as const).map((item) => {
            const count =
              item === 'active' ? activeCount : item === 'global' ? globalCount : historyCount;
            const label =
              item === 'active' ? 'My Active' : item === 'global' ? 'Fleet' : 'History';
            const isSelected = viewMode === item;

            return (
              <Pressable
                key={item}
                onPress={() => {
                  triggerHaptic('tap');
                  setViewMode(item);
                }}
                style={[
                  styles.scopeBtn,
                  isSelected && styles.scopeBtnActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${label} jobs (${count})`}
              >
                <Text
                  style={[
                    styles.scopeLabel,
                    isSelected && styles.scopeLabelActive,
                  ]}
                >
                  {label}
                </Text>
                <View
                  style={[
                    styles.scopeBadge,
                    isSelected ? styles.scopeBadgeActive : styles.scopeBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeBadgeText,
                      isSelected && styles.scopeBadgeTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Job Cards List or Empty State */}
        {visible.length > 0 ? (
          <View style={styles.listContainer}>
            {visible.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onPress={() => handleOpenJob(job)}
              />
            ))}
          </View>
        ) : q || selectedWorkflow !== 'ALL' ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptySearchIconCircle}>
              <SearchX size={34} color={colors.textSecondary} strokeWidth={2} />
            </View>
            <Text style={styles.emptyTitle}>No matching jobs</Text>
            <Text style={styles.emptySubtitle}>
              No jobs match your search or filter criteria in {viewMode === 'active' ? 'My Active' : viewMode === 'global' ? 'Fleet' : 'History'}. Try adjusting your keywords or clearing filters.
            </Text>
            <Pressable
              onPress={() => {
                setSearch('');
                setSelectedWorkflow('ALL');
              }}
              style={styles.clearSearchBtn}
              accessibilityRole="button"
              accessibilityLabel="Reset filters and search"
            >
              <Text style={styles.clearSearchBtnText}>Reset Filters</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <CheckCircle2 size={36} color={colors.success} strokeWidth={2.5} />
            </View>
            <Text style={styles.emptyTitle}>
              {viewMode === 'history' ? 'No history yet' : "You're all caught up!"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {viewMode === 'history'
                ? 'Completed tasks will appear here.'
                : 'No active tasks in your queue. Take a breather or check the fleet tab.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pageHeader: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 14,
    minHeight: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: colors.primary,
    textTransform: 'uppercase',
    fontFamily: typography.fontSans,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 28,
    color: colors.textPrimary,
    marginTop: 2,
    fontFamily: typography.fontSans,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: Platform.select({ ios: 104, default: 96 }),
  },
  searchSection: {
    marginBottom: 14,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtnActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(0, 92, 209, 0.08)',
  },
  filterDotBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '900',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: 0,
    fontFamily: typography.fontSans,
  },
  clearBtn: {
    padding: 4,
  },
  scopeBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 6,
  },
  scopeBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  scopeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  scopeLabelActive: {
    color: colors.primary,
    fontWeight: '900',
    fontFamily: typography.fontSans,
  },
  scopeBadge: {
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  scopeBadgeActive: {
    backgroundColor: 'rgba(0, 92, 209, 0.15)',
  },
  scopeBadgeInactive: {
    backgroundColor: 'rgba(71, 85, 105, 0.15)',
  },
  scopeBadgeText: {
    fontFamily: typography.fontMono,
    fontSize: 9,
    fontWeight: '900',
    color: colors.textSecondary,
  },
  scopeBadgeTextActive: {
    color: colors.primary,
  },
  listContainer: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: typography.fontSans,
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 240,
    lineHeight: 18,
    fontFamily: typography.fontSans,
  },
  emptySearchIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  clearSearchBtn: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  clearSearchBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    fontFamily: typography.fontSans,
  },
});
