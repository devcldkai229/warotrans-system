import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { ChevronRight, History, PackagePlus, PlusCircle } from 'lucide-react-native';
import { WorkflowCode } from '../../shared/types/contracts';
import { SafetyHubCard } from './SafetyHubCard';
import { WORKFLOW_TEMPLATES } from './workflowTemplates';
import { WorkflowTemplateCard } from './WorkflowTemplateCard';

export function TransportScreen() {
  const { navigate, switchTab } = useNavigation();

  const handleSelectWorkflow = (code: WorkflowCode) => {
    navigate('transport_create', { workflowCode: code });
  };

  const handleLaunchRescue = () => {
    navigate('payload_recovery');
  };

  const handleFleetRecall = () => {
    navigate('fleet_recall');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* 1. Primary Hero Action Buttons */}
      <View style={styles.heroGrid}>
        <Pressable
          onPress={() => navigate('transport_create')}
          style={({ pressed }) => [
            styles.heroActionBtn,
            styles.heroActionPrimary,
            pressed && styles.heroActionPressed,
          ]}
        >
          <PlusCircle size={22} color="#ffffff" style={{ marginBottom: 6 }} />
          <Text style={styles.heroActionTitle}>New Transport</Text>
          <Text style={styles.heroActionSubtitle}>Select workflow & AMR</Text>
        </Pressable>

        <Pressable
          onPress={() => navigate('create_container')}
          style={({ pressed }) => [
            styles.heroActionBtn,
            styles.heroActionSecondary,
            pressed && styles.heroActionPressed,
          ]}
        >
          <PackagePlus size={22} color={colors.primary} style={{ marginBottom: 6 }} />
          <Text style={styles.heroActionTitleSecondary}>Pack & Ingest</Text>
          <Text style={styles.heroActionSubtitle}>Single / batch totes</Text>
        </Pressable>
      </View>

      {/* 2. Safety & Incident Hub */}
      <SafetyHubCard
        onLaunchRescue={handleLaunchRescue}
        onFleetRecall={handleFleetRecall}
        onBlockPath={() => alert('Nav2 Dynamic Obstacle flagged at current location.')}
      />

      {/* 3. Workflow Catalog (6 Core Workflows) */}
      <View style={styles.catalogSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>WORKFLOW TEMPLATES CATALOG</Text>
          <Text style={styles.sectionCount}>6 Workflows</Text>
        </View>

        {WORKFLOW_TEMPLATES.map((tmpl) => (
          <WorkflowTemplateCard
            key={tmpl.code}
            template={tmpl}
            onSelect={handleSelectWorkflow}
          />
        ))}
      </View>

      {/* 4. Recent Dispatches Live Feed */}
      <View style={styles.recentSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT DISPATCHES (FMS FEED)</Text>
          <Pressable onPress={() => switchTab('jobs')}>
            <Text style={styles.viewJobsLink}>View in Jobs ›</Text>
          </Pressable>
        </View>

        <View style={styles.recentCard}>
          <View style={styles.recentTopRow}>
            <View style={styles.recentIdGroup}>
              <Text style={styles.recentIdBadge}>TR-2048</Text>
              <Text style={styles.recentWorkflow}>Inbound Putaway</Text>
            </View>
            <View style={styles.allocatingBadge}>
              <Text style={styles.allocatingText}>AMR-01 ACTIVE</Text>
            </View>
          </View>
          <Text style={styles.recentRoute}>Dock 01 ➔ Rack A · Level 2 · Bin 03 (BOX-101)</Text>
          <View style={styles.recentBottomRow}>
            <Text style={styles.recentRobot}>Assigned: AMR-01</Text>
            <Text style={styles.recentTime}>2 mins ago</Text>
          </View>
        </View>

        <View style={styles.recentCard}>
          <View style={styles.recentTopRow}>
            <View style={styles.recentIdGroup}>
              <Text style={styles.recentIdBadge}>TR-2046</Text>
              <Text style={styles.recentWorkflow}>Outbound Retrieval</Text>
            </View>
            <View style={styles.enRouteBadge}>
              <Text style={styles.enRouteText}>EN ROUTE</Text>
            </View>
          </View>
          <Text style={styles.recentRoute}>Rack B-04 ➔ Dock Out 04 (BOX-204)</Text>
          <View style={styles.recentBottomRow}>
            <Text style={styles.recentRobot}>Assigned: AMR-02</Text>
            <Text style={styles.recentTime}>5 mins ago</Text>
          </View>
        </View>
      </View>

      {/* 5. View Full Audit Trail */}
      <View style={styles.historyLinkSection}>
        <Pressable
          onPress={() => navigate('transport_history')}
          style={({ pressed }) => [
            styles.historyLinkBtn,
            pressed && styles.historyLinkBtnPressed,
          ]}
        >
          <History size={22} color={colors.primary} />
          <View style={styles.historyLinkTextCol}>
            <Text style={styles.historyLinkTitle}>View Transport Audit History</Text>
            <Text style={styles.historyLinkSubtitle}>
              Completed deliveries, timestamps & route metrics
            </Text>
          </View>
          <ChevronRight size={18} color="#94a3b8" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  heroGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  heroActionBtn: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionPrimary: {
    backgroundColor: colors.primary,
  },
  heroActionSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
  },
  heroActionPressed: {
    opacity: 0.85,
  },
  heroActionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  heroActionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textInverse,
  },
  heroActionTitleSecondary: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.primary,
  },
  heroActionSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  catalogSection: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  sectionCount: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  viewJobsLink: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  recentSection: {
    marginBottom: 10,
  },
  recentCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  recentIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentIdBadge: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primary,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recentWorkflow: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  allocatingBadge: {
    backgroundColor: colors.infoBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  allocatingText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.info,
  },
  enRouteBadge: {
    backgroundColor: colors.successBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  enRouteText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.success,
  },
  recentRoute: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  recentBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
    paddingTop: 6,
  },
  recentRobot: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  recentTime: {
    fontSize: 10,
    color: colors.textMuted,
  },
  historyLinkSection: {
    marginTop: 4,
    marginBottom: 8,
  },
  historyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  historyLinkBtnPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  historyLinkIcon: {
    fontSize: 22,
  },
  historyLinkTextCol: {
    flex: 1,
  },
  historyLinkTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  historyLinkSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  historyLinkChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textMuted,
  },
});
