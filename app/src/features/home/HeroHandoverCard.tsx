import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';

interface HeroHandoverCardProps {
  robotCode: string;
  workflowName: string;
  etaText: string;
  targetLocation: string;
  slotSummary: string;
  onOpenTask: () => void;
}

export function HeroHandoverCard({
  robotCode = 'AMR-01',
  workflowName = 'Inbound Putaway',
  etaText = 'ETA 45s (8m away)',
  targetLocation = 'Rack A · Level 2 · Bin 03',
  slotSummary = 'Slot 1 (Front): BOX-101 (45 pcs)',
  onOpenTask,
}: HeroHandoverCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.robotPillGroup}>
          <View style={styles.robotBadge}>
            <Text style={styles.robotBadgeText}>{robotCode}</Text>
          </View>
          <Text style={styles.workflowText}>{workflowName}</Text>
        </View>

        <View style={styles.etaBadge}>
          <View style={styles.etaDot} />
          <Text style={styles.etaText}>{etaText}</Text>
        </View>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.infoCol}>
          <Text style={styles.targetHeading}>Target: {targetLocation}</Text>
          <Text style={styles.payloadSubtext}>{slotSummary}</Text>
        </View>

        <Pressable
          onPress={onOpenTask}
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && styles.ctaButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Open task for ${robotCode}`}
        >
          <Text style={styles.ctaText}>Open Task ➔</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    padding: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  robotPillGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  robotBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  robotBadgeText: {
    color: colors.textInverse,
    fontSize: 10,
    fontWeight: '900',
    fontFamily: typography.fontMono,
  },
  workflowText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  etaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  etaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.warning,
  },
  etaText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.warning,
    fontFamily: typography.fontMono,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoCol: {
    flex: 1,
  },
  targetHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  payloadSubtext: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  ctaButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  ctaButtonPressed: {
    backgroundColor: colors.primaryDark,
  },
  ctaText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
});
