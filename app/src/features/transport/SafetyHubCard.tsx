import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../shared/theme/colors';

interface SafetyHubCardProps {
  onLaunchRescue: () => void;
  onBlockPath?: () => void;
}

export function SafetyHubCard({
  onLaunchRescue,
  onBlockPath,
}: SafetyHubCardProps) {
  const [isHolding, setIsHolding] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toggleHold = () => {
    if (isHolding) {
      setIsHolding(false);
      setToastMessage('Nearby AMR soft-pause released. Normal Nav2 navigation resumed.');
    } else {
      setIsHolding(true);
      setToastMessage('HOLD ROBOT ACTIVE: AMRs within 3m perimeter paused. (E-STOP not triggered).');
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <Text style={styles.headerIcon}>🛡️</Text>
          <View>
            <Text style={styles.headerTitle}>SAFETY & INCIDENT HUB</Text>
            <Text style={styles.headerSubtitle}>Field Safety & AMR Perimeter Controls</Text>
          </View>
        </View>
        <View style={styles.incidentBadge}>
          <Text style={styles.incidentBadgeText}>1 ACTIVE INCIDENT</Text>
        </View>
      </View>

      {/* Toast Feedback */}
      {toastMessage && (
        <View style={styles.toastBox}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Active Incident Alert Box */}
      <View style={styles.incidentBox}>
        <View style={styles.incidentTopRow}>
          <View style={styles.incidentPingRow}>
            <View style={styles.incidentDot} />
            <Text style={styles.incidentTitle}>AMR-01 STALLED · PAYLOAD AT RISK</Text>
          </View>
          <Text style={styles.incidentLocation}>Zone A · Aisle 2</Text>
        </View>
        <Text style={styles.incidentDesc}>
          Hardware motor fault with cargo BOX-101 (45 units). Rescue AMR-02 is ready for tote transfer.
        </Text>
        <Pressable
          onPress={onLaunchRescue}
          style={({ pressed }) => [
            styles.rescueBtn,
            pressed && styles.rescueBtnPressed,
          ]}
        >
          <Text style={styles.rescueBtnText}>🛟 Launch Rescue Mission (SCR-STF-11)</Text>
        </Pressable>
      </View>

      {/* Safety Action Buttons Row */}
      <View style={styles.actionsRow}>
        {/* Soft Hold Toggle */}
        <Pressable
          onPress={toggleHold}
          style={[
            styles.safetyBtn,
            isHolding ? styles.safetyBtnActive : styles.safetyBtnDefault,
          ]}
        >
          <View style={styles.safetyBtnTop}>
            <Text style={styles.safetyBtnLabel}>Perimeter</Text>
            <Text style={styles.safetyBtnIcon}>{isHolding ? '⏸️' : '⏹️'}</Text>
          </View>
          <Text
            style={[
              styles.safetyBtnTitle,
              isHolding && styles.safetyBtnTitleActive,
            ]}
          >
            {isHolding ? 'Hold Active (3m)' : 'Soft Hold (3m)'}
          </Text>
          <Text style={styles.safetyBtnDesc}>
            {isHolding ? 'Motion locked' : 'Local pause'}
          </Text>
        </Pressable>

        {/* Block Path Report */}
        <Pressable
          onPress={onBlockPath}
          style={[styles.safetyBtn, styles.safetyBtnDefault]}
        >
          <View style={styles.safetyBtnTop}>
            <Text style={styles.safetyBtnLabel}>Hazard</Text>
            <Text style={styles.safetyBtnIcon}>⚠️</Text>
          </View>
          <Text style={styles.safetyBtnTitle}>Block Path (Nav2)</Text>
          <Text style={styles.safetyBtnDesc}>Flag aisle obstacle</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSubtle,
    paddingBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  incidentBadge: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  incidentBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: colors.danger,
    fontFamily: 'monospace',
  },
  toastBox: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  toastText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryDark,
  },
  incidentBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  incidentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  incidentPingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  incidentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  incidentTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.danger,
    fontFamily: 'monospace',
  },
  incidentLocation: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  incidentDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 15,
    marginBottom: 8,
  },
  rescueBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rescueBtnPressed: {
    backgroundColor: '#b91c1c',
  },
  rescueBtnText: {
    color: colors.textInverse,
    fontSize: 11,
    fontWeight: '800',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  safetyBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
  },
  safetyBtnDefault: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  safetyBtnActive: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.danger,
  },
  safetyBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  safetyBtnLabel: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  safetyBtnIcon: {
    fontSize: 12,
  },
  safetyBtnTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  safetyBtnTitleActive: {
    color: colors.danger,
  },
  safetyBtnDesc: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 2,
  },
});
