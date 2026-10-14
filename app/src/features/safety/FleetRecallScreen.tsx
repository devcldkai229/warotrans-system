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
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';

export function FleetRecallScreen() {
  const { goBack } = useNavigation();

  return (
    <View style={styles.container}>
      <SubScreenHeader
        label="Fleet recall"
        title="Fleet Status Notice"
        onBack={goBack}
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Admin Authority Notice Card */}
        <View style={styles.warningCard}>
          <View style={styles.warningIconWrap}>
            <Lock size={20} color="#b45309" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.badgeRow}>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>Admin authority only</Text>
              </View>
            </View>
            <Text style={styles.warningTitle}>Scheduled fleet maintenance in progress</Text>
            <Text style={styles.warningDesc}>
              Command issued from Central Web Dashboard: Autonomous robot fleet is recalled to charging bays for battery equalization and preventative maintenance. New transport dispatches are temporarily locked.
            </Text>
          </View>
        </View>

        {/* Fleet Telemetry Matrix (Read-Only) */}
        <View style={styles.matrixSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active fleet status (2 AMRs)</Text>
            <View style={styles.recallModeBadge}>
              <Text style={styles.recallModeText}>Recall mode active</Text>
            </View>
          </View>

          {/* AMR-01 Card */}
          <View style={styles.robotRecallCard}>
            <View style={styles.cardTopRow}>
              <View style={styles.robotIdGroup}>
                <Text style={styles.robotCode}>AMR-01</Text>
                <View style={styles.dockingBadge}>
                  <Text style={styles.dockingText}>Docking</Text>
                </View>
              </View>
              <Text style={styles.chargerAssigned}>Assigned: Charger-01</Text>
            </View>
            <Text style={styles.robotTaskText}>
              Finishing last tote dropoff ➔ Navigating into Charger Pad 01
            </Text>
            <View style={styles.telemetryPillWarning}>
              <Clock3 size={14} color="#b45309" />
              <Text style={styles.telemetryTextWarning}>
                ETA to Dock: <Text style={styles.boldWarning}>~1m 15s</Text> · Battery: <Text style={styles.boldWarning}>78%</Text>
              </Text>
            </View>
          </View>

          {/* AMR-02 Card */}
          <View style={styles.robotRecallCard}>
            <View style={styles.cardTopRow}>
              <View style={styles.robotIdGroup}>
                <Text style={styles.robotCode}>AMR-02</Text>
                <View style={styles.dockedBadge}>
                  <Text style={styles.dockedText}>Docked</Text>
                </View>
              </View>
              <Text style={styles.chargerAssigned}>Assigned: Charger-02</Text>
            </View>
            <Text style={styles.robotTaskText}>
              Docking verified · High-voltage equalization charging active
            </Text>
            <View style={styles.telemetryPillSuccess}>
              <CheckCircle2 size={14} color="#16a34a" />
              <Text style={styles.telemetryTextSuccess}>
                Docked & Equalizing · Battery: <Text style={styles.boldSuccess}>94%</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* Access Control Policy Card */}
        <View style={styles.rbacCard}>
          <View style={styles.rbacHeader}>
            <ShieldCheck size={18} color={colors.textPrimary} />
            <Text style={styles.rbacTitle}>Access control policy</Text>
          </View>
          <Text style={styles.rbacDesc}>
            In accordance with industrial ISO 3691-4 safety protocols, whole-fleet recall is strictly restricted to Administrator web consoles. Floor staff handheld terminals operate in operational supervision mode.
          </Text>
        </View>

        <Button
          label="Return to Dashboard"
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
    paddingBottom: 48,
    gap: 16,
  },
  warningCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: radii.lg,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    ...shadows.panel,
  },
  warningIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  adminBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontSans,
  },
  warningTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 6,
    fontFamily: typography.fontSans,
  },
  warningDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: 3,
    fontFamily: typography.fontSans,
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  recallModeBadge: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recallModeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontMono,
  },
  robotRecallCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
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
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: typography.fontMono,
  },
  dockingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dockingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    fontFamily: typography.fontSans,
  },
  dockedBadge: {
    backgroundColor: 'rgba(22, 163, 74, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dockedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
    fontFamily: typography.fontSans,
  },
  chargerAssigned: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontMono,
  },
  robotTaskText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginVertical: 10,
    fontFamily: typography.fontSans,
  },
  telemetryPillWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  telemetryTextWarning: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    fontFamily: typography.fontMono,
  },
  telemetryPillSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radii.sm,
  },
  telemetryTextSuccess: {
    fontSize: 12,
    fontWeight: '500',
    color: '#16a34a',
    fontFamily: typography.fontMono,
  },
  boldWarning: {
    fontWeight: '800',
    color: '#b45309',
  },
  boldSuccess: {
    fontWeight: '800',
    color: '#16a34a',
  },
  rbacCard: {
    backgroundColor: '#ffffff',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.panel,
  },
  rbacHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  rbacTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  rbacDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.fontSans,
  },
});
