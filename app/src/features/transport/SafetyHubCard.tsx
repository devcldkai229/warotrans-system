import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertTriangle,
  LifeBuoy,
  OctagonAlert,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';

interface SafetyHubCardProps {
  onLaunchRescue: () => void;
  onBlockPath?: () => void;
  onFleetRecall?: () => void;
}

export function SafetyHubCard({
  onLaunchRescue,
  onBlockPath,
  onFleetRecall,
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
          <ShieldAlert size={20} color={colors.primary} />
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
          <LifeBuoy size={16} color="#ffffff" style={styles.rescueBtnIcon} />
          <Text style={styles.rescueBtnText}>Launch Rescue Mission (SCR-STF-11)</Text>
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
            {isHolding ? (
              <PlayCircle size={16} color={colors.primary} />
            ) : (
              <PauseCircle size={16} color="#64748b" />
            )}
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
            <AlertTriangle size={16} color="#f59e0b" />
          </View>
          <Text style={styles.safetyBtnTitle}>Block Path (Nav2)</Text>
          <Text style={styles.safetyBtnDesc}>Flag aisle obstacle</Text>
        </Pressable>

        {/* Fleet Recall Notice */}
        {onFleetRecall && (
          <Pressable
            onPress={onFleetRecall}
            style={[styles.safetyBtn, styles.safetyBtnDefault]}
          >
            <View style={styles.safetyBtnTop}>
              <Text style={styles.safetyBtnLabel}>Recall</Text>
              <OctagonAlert size={16} color="#ef4444" />
            </View>
            <Text style={styles.safetyBtnTitle}>Fleet Recall</Text>
            <Text style={styles.safetyBtnDesc}>Dock policy</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  incidentBadge: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  incidentBadgeText: {
    fontSize: 9,
    fontFamily: 'monospace',
    fontWeight: '900',
    color: '#dc2626',
  },
  toastBox: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  toastText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
  },
  incidentBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  incidentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  incidentPingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  incidentDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#ef4444',
  },
  incidentTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#991b1b',
  },
  incidentLocation: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#b91c1c',
  },
  incidentDesc: {
    fontSize: 11,
    color: '#7f1d1d',
    lineHeight: 16,
    marginBottom: 10,
  },
  rescueBtn: {
    backgroundColor: '#dc2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
  },
  rescueBtnPressed: {
    opacity: 0.85,
  },
  rescueBtnIcon: {
    marginRight: 6,
  },
  rescueBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  safetyBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  safetyBtnDefault: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  safetyBtnActive: {
    backgroundColor: '#eff6ff',
    borderColor: colors.primary,
  },
  safetyBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  safetyBtnLabel: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    color: '#64748b',
  },
  safetyBtnTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  safetyBtnTitleActive: {
    color: colors.primary,
  },
  safetyBtnDesc: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
  },
});
