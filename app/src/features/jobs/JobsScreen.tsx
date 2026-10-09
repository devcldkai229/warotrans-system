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
import { CheckCircle2, Search, X } from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
import { JobCard } from './JobCard';
import { AppJobItem, MOCK_JOBS } from './jobData';

type ViewMode = 'active' | 'global' | 'history';

export function JobsScreen() {
  const { navigate, params } = useNavigation();
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

  const activeCount = MOCK_JOBS.filter((j) => j.isMine && j.kind !== 'complete').length;
  const globalCount = MOCK_JOBS.filter((j) => j.kind !== 'complete').length;
  const historyCount = MOCK_JOBS.filter((j) => j.kind === 'complete').length;

  const visible = MOCK_JOBS.filter((job) => {
    const matchView =
      viewMode === 'active'
        ? job.isMine && job.kind !== 'complete'
        : viewMode === 'global'
          ? job.kind !== 'complete'
          : job.kind === 'complete';
    if (!matchView) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      job.id.toLowerCase().includes(q) ||
      job.workflowName.toLowerCase().includes(q) ||
      job.target.toLowerCase().includes(q) ||
      job.payloadSummary.toLowerCase().includes(q) ||
      job.robot.toLowerCase().includes(q) ||
      job.containers.some((c) => c.code.toLowerCase().includes(q))
    );
  });

  const handleOpenJob = (job: AppJobItem) => {
    triggerHaptic('tap');
    navigate('job_detail', { jobId: job.id });
  };

  return (
    <View style={styles.container}>
      {/* Page Header (Matching Prototype PageHeader exactly) */}
      <View style={styles.pageHeader}>
        <Text style={styles.eyebrow}>EXECUTION CENTER</Text>
        <Text style={styles.pageTitle}>Job Control</Text>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Filter Input Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBox}>
            <Search size={15} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search jobs, containers, locations..."
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
        </View>

        {/* 3-Column Scope Segmented Control */}
        <View style={styles.scopeBar}>
          {(['active', 'global', 'history'] as const).map((item) => {
            const count =
              item === 'active' ? activeCount : item === 'global' ? globalCount : historyCount;
            const label =
              item === 'active' ? 'My Active' : item === 'global' ? 'Global' : 'History';
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
                : 'No active tasks in your queue. Take a breather or check the global fleet.'}
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
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    minHeight: Platform.OS === 'ios' ? 104 : 75,
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
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 28,
    color: colors.textPrimary,
    marginTop: 2,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  searchSection: {
    marginBottom: 12,
  },
  searchBox: {
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
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: 0,
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
  },
  scopeLabelActive: {
    color: colors.primary,
    fontWeight: '900',
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
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 240,
    lineHeight: 18,
  },
});
