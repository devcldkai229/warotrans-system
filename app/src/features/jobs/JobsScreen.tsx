import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Input } from '../../shared/components/Input';
import { colors } from '../../shared/theme/colors';
import { JobCard } from './JobCard';
import { MOCK_JOBS } from './jobData';

import { Box, Search, X } from 'lucide-react-native';

type ScopeMode = 'active' | 'global' | 'history';
type StatusFilter = 'ALL' | 'RUNNING' | 'QUEUED' | 'COMPLETED';

export function JobsScreen() {
  const { navigate } = useNavigation();
  const [scope, setScope] = useState<ScopeMode>('active');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');

  const activeCount = MOCK_JOBS.filter((j) => j.isMine && j.status !== 'COMPLETED').length;
  const globalCount = MOCK_JOBS.filter((j) => j.status !== 'COMPLETED').length;
  const historyCount = MOCK_JOBS.filter((j) => j.status === 'COMPLETED').length;

  const filteredJobs = MOCK_JOBS.filter((job) => {
    // 1. Scope filter
    if (scope === 'active') {
      if (!job.isMine || job.status === 'COMPLETED') return false;
    } else if (scope === 'global') {
      if (job.status === 'COMPLETED') return false;
    } else if (scope === 'history') {
      if (job.status !== 'COMPLETED') return false;
    }

    // 2. Status filter
    if (statusFilter !== 'ALL' && job.status !== statusFilter) {
      return false;
    }

    // 3. Search query
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        job.jobNo.toLowerCase().includes(q) ||
        job.workflowName.toLowerCase().includes(q) ||
        job.destinationEndpointCode.toLowerCase().includes(q) ||
        job.sourceEndpointCode.toLowerCase().includes(q) ||
        (job.assignedRobotCode && job.assignedRobotCode.toLowerCase().includes(q)) ||
        job.payloadSummary.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const handleOpenJob = (jobId: string) => {
    navigate('job_detail', { jobId });
  };

  return (
    <View style={styles.container}>
      {/* Page Title */}
      <View style={styles.pageHeader}>
        <Text style={styles.eyebrow}>EXECUTION CENTER</Text>
        <Text style={styles.pageTitle}>Job Control</Text>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Search size={16} color="#94a3b8" />
          <Input
            placeholder="Search jobs, containers, locations..."
            value={search}
            onChangeText={setSearch}
            containerStyle={styles.searchInputContainer}
            inputStyle={styles.searchInputText}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} style={styles.clearBtn}>
              <X size={15} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Scope Segmented Control */}
      <View style={styles.scopeBar}>
        <Pressable
          onPress={() => setScope('active')}
          style={[styles.scopeBtn, scope === 'active' && styles.scopeBtnActive]}
        >
          <Text
            style={[
              styles.scopeLabel,
              scope === 'active' && styles.scopeLabelActive,
            ]}
          >
            My Active
          </Text>
          <View
            style={[
              styles.scopeBadge,
              scope === 'active' ? styles.scopeBadgeActive : styles.scopeBadgeInactive,
            ]}
          >
            <Text
              style={[
                styles.scopeBadgeText,
                scope === 'active' && styles.scopeBadgeTextActive,
              ]}
            >
              {activeCount}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setScope('global')}
          style={[styles.scopeBtn, scope === 'global' && styles.scopeBtnActive]}
        >
          <Text
            style={[
              styles.scopeLabel,
              scope === 'global' && styles.scopeLabelActive,
            ]}
          >
            Global Fleet
          </Text>
          <View
            style={[
              styles.scopeBadge,
              scope === 'global' ? styles.scopeBadgeActive : styles.scopeBadgeInactive,
            ]}
          >
            <Text
              style={[
                styles.scopeBadgeText,
                scope === 'global' && styles.scopeBadgeTextActive,
              ]}
            >
              {globalCount}
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => setScope('history')}
          style={[styles.scopeBtn, scope === 'history' && styles.scopeBtnActive]}
        >
          <Text
            style={[
              styles.scopeLabel,
              scope === 'history' && styles.scopeLabelActive,
            ]}
          >
            History
          </Text>
          <View
            style={[
              styles.scopeBadge,
              scope === 'history' ? styles.scopeBadgeActive : styles.scopeBadgeInactive,
            ]}
          >
            <Text
              style={[
                styles.scopeBadgeText,
                scope === 'history' && styles.scopeBadgeTextActive,
              ]}
            >
              {historyCount}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Status Filter Chips (Only for Global Scope) */}
      {scope === 'global' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          {(['ALL', 'RUNNING', 'QUEUED'] as const).map((st) => {
            const isSelected = statusFilter === st;
            return (
              <Pressable
                key={st}
                onPress={() => setStatusFilter(st)}
                style={[
                  styles.filterChip,
                  isSelected && styles.filterChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isSelected && styles.filterChipTextSelected,
                  ]}
                >
                  {st}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Job Cards List */}
      <ScrollView
        style={styles.jobsList}
        contentContainerStyle={styles.jobsListContent}
      >
        {filteredJobs.length > 0 ? (
          filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              onPress={() => handleOpenJob(job.id)}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
              <Box size={36} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No Jobs Found</Text>
            <Text style={styles.emptyDesc}>
              {search
                ? `No jobs matched query "${search}". Try resetting the search.`
                : 'There are currently no tasks in this view scope.'}
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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 2,
    marginBottom: 6,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInputContainer: {
    flex: 1,
    marginBottom: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  searchInputText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  clearBtn: {
    padding: 4,
  },
  scopeBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    padding: 4,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  scopeBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  scopeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  scopeLabelActive: {
    color: colors.primary,
  },
  scopeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  scopeBadgeActive: {
    backgroundColor: colors.primaryLight,
  },
  scopeBadgeInactive: {
    backgroundColor: colors.surfaceMuted,
  },
  scopeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textMuted,
  },
  scopeBadgeTextActive: {
    color: colors.primaryDark,
  },
  filtersScroll: {
    maxHeight: 40,
    marginTop: 8,
  },
  filtersContent: {
    paddingHorizontal: 16,
    gap: 6,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  filterChipTextSelected: {
    color: colors.textInverse,
  },
  jobsList: {
    flex: 1,
    marginTop: 8,
  },
  jobsListContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
