import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
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
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';

function PulsingBeaconDot() {
  const pingAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pingAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pingAnim]);

  const scale = pingAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.2],
  });
  const opacity = pingAnim.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.8, 0.25, 0],
  });

  return (
    <View style={styles.beaconContainer}>
      <Animated.View
        style={[
          styles.beaconPing,
          {
            transform: [{ scale }],
            opacity,
          },
        ]}
      />
      <View style={styles.beaconCore} />
    </View>
  );
}

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
    triggerHaptic('tap');
    if (isHolding) {
      setIsHolding(false);
      setToastMessage('Nearby AMR soft-pause released. Normal Nav2 navigation resumed.');
    } else {
      setIsHolding(true);
      setToastMessage('Hold active: AMRs within 3m perimeter paused. (E-STOP not triggered).');
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <ShieldAlert size={20} color={colors.textPrimary} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Field safety & incident hub</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>Perimeter controls & emergency exceptions</Text>
          </View>
        </View>
        <View style={styles.incidentBadge}>
          <Text style={styles.incidentBadgeText}>1 active incident</Text>
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
          <View style={[styles.incidentPingRow, { flex: 1, minWidth: 0 }]}>
            <PulsingBeaconDot />
            <Text style={styles.incidentTitle} numberOfLines={1}>AMR-01 stalled · Payload at risk</Text>
          </View>
          <Text style={styles.incidentLocation} numberOfLines={1}>Zone A · Aisle 2</Text>
        </View>
        <Text style={styles.incidentDesc}>
          Hardware motor fault with cargo BOX-101 (45 units). Rescue AMR-02 is staged for tote transfer.
        </Text>
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            onLaunchRescue();
          }}
          style={({ pressed }) => [
            styles.rescueBtn,
            pressed && styles.rescueBtnPressed,
          ]}
          accessibilityRole="button"
        >
          <LifeBuoy size={16} color="#ffffff" style={styles.rescueBtnIcon} />
          <Text style={styles.rescueBtnText} numberOfLines={1}>Launch rescue workflow</Text>
        </Pressable>
      </View>

      {/* Safety Action Buttons Row */}
      <View style={styles.actionsRow}>
        {/* Soft Hold Toggle */}
        <Pressable
          onPress={toggleHold}
          style={[
            styles.safetyBtn,
            isHolding && styles.safetyBtnActive,
          ]}
          accessibilityRole="button"
        >
          <View style={styles.safetyBtnTop}>
            <Text style={styles.safetyBtnLabel}>Perimeter</Text>
            {isHolding ? (
              <PlayCircle size={16} color={colors.darkAction} />
            ) : (
              <PauseCircle size={16} color={colors.textSecondary} />
            )}
          </View>
          <Text
            style={[
              styles.safetyBtnTitle,
              isHolding && styles.safetyBtnTitleActive,
            ]}
          >
            {isHolding ? 'Hold active (3m)' : 'Soft hold (3m)'}
          </Text>
          <Text style={styles.safetyBtnDesc}>
            {isHolding ? 'Motion locked' : 'Local pause'}
          </Text>
        </Pressable>

        {/* Block Path Report */}
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            onBlockPath?.();
          }}
          style={styles.safetyBtn}
          accessibilityRole="button"
        >
          <View style={styles.safetyBtnTop}>
            <Text style={styles.safetyBtnLabel}>Hazard</Text>
            <AlertTriangle size={16} color="#b45309" />
          </View>
          <Text style={styles.safetyBtnTitle}>Block corridor</Text>
          <Text style={styles.safetyBtnDesc}>Detour Nav2</Text>
        </Pressable>

        {/* Fleet Recall Notice */}
        {onFleetRecall && (
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onFleetRecall?.();
            }}
            style={styles.safetyBtn}
            accessibilityRole="button"
          >
            <View style={styles.safetyBtnTop}>
              <Text style={styles.safetyBtnLabel}>Recall</Text>
              <OctagonAlert size={16} color="#dc2626" />
            </View>
            <Text style={styles.safetyBtnTitle}>Fleet recall</Text>
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
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 14,
    ...shadows.panel,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
    fontFamily: typography.fontSans,
  },
  incidentBadge: {
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  incidentBadgeText: {
    fontSize: 11,
    fontFamily: typography.fontSans,
    fontWeight: '700',
    color: '#dc2626',
  },
  toastBox: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    marginBottom: 10,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: typography.fontSans,
  },
  incidentBox: {
    backgroundColor: 'rgba(220, 38, 38, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.2)',
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 12,
  },
  incidentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  incidentPingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  beaconContainer: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  beaconPing: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#dc2626',
  },
  beaconCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#dc2626',
    zIndex: 2,
  },
  incidentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
    fontFamily: typography.fontSans,
  },
  incidentLocation: {
    fontSize: 12,
    fontFamily: typography.fontMono,
    fontWeight: '600',
    color: '#dc2626',
  },
  incidentDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
    fontFamily: typography.fontSans,
  },
  rescueBtn: {
    backgroundColor: colors.darkAction,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: radii.sm,
  },
  rescueBtnPressed: {
    backgroundColor: colors.darkActionPressed,
  },
  rescueBtnIcon: {
    marginRight: 6,
  },
  rescueBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: typography.fontSans,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  safetyBtn: {
    flex: 1,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSubtle,
    minHeight: 68,
    justifyContent: 'space-between',
  },
  safetyBtnActive: {
    backgroundColor: '#ffffff',
    borderColor: colors.darkAction,
    borderWidth: 1.5,
  },
  safetyBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  safetyBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
  safetyBtnTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    marginTop: 4,
  },
  safetyBtnTitleActive: {
    color: colors.darkAction,
  },
  safetyBtnDesc: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.fontSans,
  },
});
