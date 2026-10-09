import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CheckCircle2,
  Clock3,
  Home,
  Lock,
  ShieldCheck,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { Button } from '../../shared/components/Button';
import { SubScreenHeader } from '../../shared/components/SubScreenHeader';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

export function FleetRecallScreen() {
  const { goBack } = useNavigation();

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="SCR-STF-11-MAINT · STATUS NOTICE"
        title="Fleet Status Notice"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Admin Exclusive Authority Notice Card */}
        <View style={styles.warningCard}>
          <View style={styles.warningIconWrap}>
            <Lock size={22} color={colors.warning} />
          </View>
          <View style={{ flex: 1 }}>
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
              <Clock3 size={13} color={colors.warning} />
              <Text style={styles.telemetryTextWarning}>
                ETA to Dock: ~1m 15s · Battery: 78%
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
              <CheckCircle2 size={13} color={colors.success} />
              <Text style={styles.telemetryTextSuccess}>
                Docked & Equalizing · Battery: 94%
              </Text>
            </View>
          </View>
        </View>

        {/* Section 8.1 RBAC Policy Clarification Card */}
        <View style={styles.rbacCard}>
          <View style={styles.rbacHeader}>
            <ShieldCheck size={18} color={colors.primary} />
            <Text style={styles.rbacTitle}>Section 8.1 RBAC Operational Rule</Text>
          </View>
          <Text style={styles.rbacDesc}>
            In accordance with industrial ISO 3691-4 safety protocols, whole-fleet recall (MAINTENANCE_ALL_ROBOTS) is strictly restricted to Administrator and Maintenance Technician web consoles. Floor staff mobile devices operate in operational supervision mode.
          </Text>
        </View>

        <Button
          label="Return to Home Console"
          icon={<Home size={18} color="#ffffff" />}
          onPress={goBack}
          variant="primary"
          size="lg"
          style={{ width: '100%', marginTop: 8 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  warningCard: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1.5,
    borderColor: colors.warningBorder,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    ...shadows.panel,
  },
  warningIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontFamily: typography.fontMono,
  },
  screenTag: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 4,
    fontFamily: typography.fontSans,
  },
  warningDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginTop: 2,
  },
  matrixSection: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  recallModeBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recallModeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    fontFamily: typography.fontMono,
  },
  robotRecallCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.panel,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  robotIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  robotCode: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  dockingBadge: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dockingText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.warning,
    fontFamily: typography.fontMono,
  },
  dockedBadge: {
    backgroundColor: colors.successSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dockedText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  chargerAssigned: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  robotTaskText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginVertical: 8,
  },
  telemetryPillWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  telemetryTextWarning: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
    fontFamily: typography.fontMono,
  },
  telemetryPillSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  telemetryTextSuccess: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.success,
    fontFamily: typography.fontMono,
  },
  rbacCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    ...shadows.panel,
  },
  rbacHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  rbacTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  rbacDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
  },
});
