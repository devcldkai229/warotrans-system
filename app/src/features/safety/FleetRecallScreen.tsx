import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { colors } from '../../shared/theme/colors';

export function FleetRecallScreen() {
  const { goBack } = useNavigation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Admin Exclusive Authority Notice Card */}
      <View style={styles.warningCard}>
        <View style={styles.warningTopRow}>
          <Text style={styles.lockIcon}>🔒</Text>
          <View style={styles.warningTextCol}>
            <View style={styles.badgeRow}>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>ADMIN-EXCLUSIVE AUTHORITY</Text>
              </View>
              <Text style={styles.screenTag}>SCREEN W-06</Text>
            </View>
            <Text style={styles.warningTitle}>Scheduled Fleet Maintenance in Progress</Text>
            <Text style={styles.warningDesc}>
              Command issued from Admin Web Dashboard: Autonomous fleet is recalled to charging bays for battery equalization and PM inspection. New transport dispatches are temporarily locked.
            </Text>
          </View>
        </View>
      </View>

      {/* Fleet Telemetry Matrix (Read-Only) */}
      <View style={styles.matrixSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ACTIVE FLEET STATUS (2 PHYSICAL AMRS)</Text>
          <View style={styles.recallModeBadge}>
            <Text style={styles.recallModeText}>RECALL MODE</Text>
          </View>
        </View>

        {/* AMR-01 Card */}
        <View style={styles.robotRecallCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.robotIdGroup}>
              <Text style={styles.robotCode}>AMR-01</Text>
              <View style={styles.dockingBadge}>
                <Text style={styles.dockingText}>DOCKING</Text>
              </View>
            </View>
            <Text style={styles.chargerAssigned}>Assigned: Charger-01</Text>
          </View>
          <Text style={styles.robotTaskText}>
            Finishing last tote dropoff ➔ Staging into Charger Pad 01
          </Text>
          <View style={styles.telemetryPillWarning}>
            <Text style={styles.telemetryTextWarning}>
              ⏱ ETA to Dock: ~1m 15s · Battery: 78%
            </Text>
          </View>
        </View>

        {/* AMR-02 Card */}
        <View style={styles.robotRecallCard}>
          <View style={styles.cardTopRow}>
            <View style={styles.robotIdGroup}>
              <Text style={styles.robotCode}>AMR-02</Text>
              <View style={styles.dockedBadge}>
                <Text style={styles.dockedText}>DOCKED</Text>
              </View>
            </View>
            <Text style={styles.chargerAssigned}>Assigned: Charger-02</Text>
          </View>
          <Text style={styles.robotTaskText}>
            Docking verified · High-voltage equalization charging active
          </Text>
          <View style={styles.telemetryPillSuccess}>
            <Text style={styles.telemetryTextSuccess}>
              ✓ Docked & Equalizing · Battery: 94%
            </Text>
          </View>
        </View>
      </View>

      {/* Section 8.1 RBAC Policy Clarification Card */}
      <View style={styles.rbacCard}>
        <View style={styles.rbacHeader}>
          <Text style={styles.shieldIcon}>🛡️</Text>
          <Text style={styles.rbacTitle}>Section 8.1 RBAC Operational Rule</Text>
        </View>
        <Text style={styles.rbacDesc}>
          In accordance with industrial ISO 3691-4 safety protocols, whole-fleet recall (MAINTENANCE_ALL_ROBOTS) is strictly restricted to Administrator and Maintenance Technician web consoles. Floor staff mobile devices operate in operational supervision mode.
        </Text>
      </View>

      <Button
        label="Return to Operational Console"
        onPress={goBack}
        variant="secondary"
        size="lg"
      />
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
  warningCard: {
    backgroundColor: colors.warningBg,
    borderWidth: 1.5,
    borderColor: colors.warningBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  warningTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  lockIcon: {
    fontSize: 22,
    marginTop: 2,
  },
  warningTextCol: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  adminBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adminBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#ffffff',
  },
  screenTag: {
    fontSize: 9,
    fontFamily: 'monospace',
    color: colors.textMuted,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  warningDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 4,
  },
  matrixSection: {
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
  recallModeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recallModeText: {
    fontSize: 8,
    fontWeight: '800',
    fontFamily: 'monospace',
    color: colors.primaryDark,
  },
  robotRecallCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  robotIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  robotCode: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
  dockingBadge: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dockingText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.warning,
  },
  dockedBadge: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  dockedText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.success,
  },
  chargerAssigned: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: colors.textMuted,
  },
  robotTaskText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  telemetryPillWarning: {
    backgroundColor: colors.warningBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  telemetryTextWarning: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.warning,
  },
  telemetryPillSuccess: {
    backgroundColor: colors.successBg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  telemetryTextSuccess: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.success,
  },
  rbacCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  rbacHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  shieldIcon: {
    fontSize: 14,
  },
  rbacTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  rbacDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    lineHeight: 15,
  },
});
