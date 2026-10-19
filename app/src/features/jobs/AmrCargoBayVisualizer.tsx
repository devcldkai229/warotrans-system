import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Box, Layers, CheckCircle2, ArrowDownRight, ArrowUpRight, ShieldAlert } from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { typography } from '../../shared/theme/typography';
import { Text } from '../../shared/ui';

export interface CargoBayItem {
  id?: string;
  code: string;
  sequenceNo?: number;
  status?: string;
  action?: 'PICKUP' | 'UNLOAD' | 'KEEP_ONBOARD' | 'KEEP ONBOARD' | 'DELIVERED' | string;
  location?: string;
  isTarget?: boolean;
}

interface AmrCargoBayVisualizerProps {
  robotCode?: string;
  robotId?: string;
  containers?: CargoBayItem[];
  targetCode?: string;
  isWaiting?: boolean;
  onSelectContainer?: (containerCode: string) => void;
}

export function AmrCargoBayVisualizer({
  robotCode,
  robotId = 'AMR-01',
  containers = [],
  targetCode,
  isWaiting = false,
  onSelectContainer,
}: AmrCargoBayVisualizerProps) {
  const activeRobot = robotCode || robotId;

  const totalCount = containers.length;
  const targetItems = containers.filter(
    (c) => isWaiting && c.status !== 'DELIVERED' && c.action !== 'DELIVERED' &&
      (c.action === 'UNLOAD' || c.action === 'PICKUP') &&
      (targetCode ? c.code === targetCode : c.isTarget ?? c === containers.find((item) => item.action === 'UNLOAD' || item.action === 'PICKUP')),
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <View style={styles.iconWell}>
            <Layers size={16} color={colors.primary} />
          </View>
          <View style={styles.titleTextBlock}>
            <Text variant="headline" style={styles.titleText}>
              {activeRobot} Cargo Bay
            </Text>
            <Text variant="caption" color={colors.textSecondary} numberOfLines={1}>
              Payload manifest · Max 2 bays
            </Text>
          </View>
        </View>

        <View style={styles.capacityBadge}>
          <Text variant="caption" style={styles.capacityText}>
            {totalCount}/2 {totalCount === 1 ? 'Bay' : 'Bays'}
          </Text>
        </View>
      </View>

      {/* Manifest List / Cards */}
      {containers.length === 0 ? (
        <View style={styles.emptyBay}>
          <Box size={24} color={colors.textMuted} />
          <Text variant="caption" color={colors.textSecondary} style={styles.emptyText}>
            Cargo bay ready · No containers allocated
          </Text>
        </View>
      ) : (
        <View style={styles.containersList}>
          {containers.map((container, idx) => {
            const isTarget =
              targetItems.includes(container);

            const isDelivered =
              container.status === 'DELIVERED' || container.action === 'DELIVERED';

            const isPickup =
              container.action === 'PICKUP' && !isDelivered;

            const isUnload =
              container.action === 'UNLOAD' && !isDelivered;

            return (
              <Pressable
                key={container.id || container.code || idx}
                style={[
                  styles.containerCard,
                  isTarget && styles.targetCard,
                  isDelivered && styles.deliveredCard,
                ]}
                onPress={() => {
                  if (container.code && onSelectContainer) {
                    onSelectContainer(container.code);
                  }
                }}
                disabled={!onSelectContainer}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.barcodeGroup}>
                    <View
                      style={[
                        styles.indicatorDot,
                        isTarget ? styles.indicatorTarget : isDelivered ? styles.indicatorDelivered : styles.indicatorOnboard,
                      ]}
                    />
                    <Text variant="headline" style={styles.barcodeText}>
                      {container.code || `Container #${container.sequenceNo || idx + 1}`}
                    </Text>
                  </View>

                  {/* Status Badge */}
                  {isTarget ? (
                    <View style={[styles.targetActionBadge, styles.handoverActionBadge]}>
                      {isUnload ? (
                        <ArrowDownRight size={13} color="#FFFFFF" />
                      ) : (
                        <ArrowUpRight size={13} color="#FFFFFF" />
                      )}
                      <Text variant="caption" style={styles.targetActionText}>
                        {isUnload ? 'Verify Unload' : 'Verify Pickup'}
                      </Text>
                    </View>
                  ) : isDelivered ? (
                    <View style={styles.deliveredBadge}>
                      <CheckCircle2 size={13} color={colors.success} />
                      <Text variant="caption" color={colors.success} style={styles.badgeText}>
                        Delivered
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.onboardBadge}>
                      <Text variant="caption" color={colors.textSecondary} style={styles.badgeText}>
                        {isPickup && container.status !== 'LOADED' && container.status !== 'ONBOARD'
                          ? 'Waiting Pickup'
                          : targetItems.some((c) => c.action === 'UNLOAD') ? 'Keep Onboard' : 'Onboard AMR'}
                      </Text>
                    </View>
                  )}
                </View>

                {container.location ? (
                  <Text variant="caption" color={colors.textSecondary} style={styles.locationText}>
                    Destination: {container.location}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Operational Hint */}
      {isWaiting && targetItems.length > 0 ? (
        <View style={styles.waitingBanner}>
          <ShieldAlert size={14} color={colors.warning} />
          <Text variant="caption" color={colors.warning} style={styles.waitingText}>
            AMR stationed. Scan container barcode to confirm handover.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  handoverActionBadge: {
    backgroundColor: colors.primary,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  titleTextBlock: {
    flex: 1,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: '#121317',
    fontSize: 15,
    fontWeight: '700',
  },
  capacityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.sm,
    backgroundColor: '#F3F4F6',
    flexShrink: 0,
  },
  capacityText: {
    color: '#4B5563',
    fontWeight: '600',
    fontSize: 12,
  },
  containersList: {
    gap: 8,
  },
  containerCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  targetCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#121317',
    borderWidth: 1.5,
  },
  deliveredCard: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barcodeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  indicatorTarget: {
    backgroundColor: '#121317',
  },
  indicatorDelivered: {
    backgroundColor: colors.success,
  },
  indicatorOnboard: {
    backgroundColor: '#3B82F6',
  },
  barcodeText: {
    color: '#121317',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  targetActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#121317',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  targetActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#ECFDF5',
  },
  onboardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#EFF6FF',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  locationText: {
    marginTop: 6,
    fontSize: 12,
  },
  emptyBay: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 12,
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  waitingText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
