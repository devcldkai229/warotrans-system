import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import {
  ArrowUpRight,
  Bot,
  ChevronLeft,
  Crosshair,
  FileText,
  Focus,
  Package,
  Truck,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../../features/auth/authContext';
import type { EndpointDto } from '../api/navigationApi';
import { getUserErrorMessage } from '../api/client';
import { PERMISSIONS, sessionCan } from '../auth/permissions';
import { t } from '../i18n';
import { usePlaceDirectory } from '../places/usePlaceDirectory';
import { ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { ThemeShadows } from '../theme/shadows';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { typography } from '../theme/typography';
import type { RobotResponse } from '../types/contracts';
import { Button, StatusPill, Text } from '../ui';
import { BatteryIndicator } from '../ui/RobotBadges';
import { triggerHaptic } from '../utils/haptics';
import { EndpointIcon } from './EndpointGlyph';
import {
  resolveEndpointInspection,
  type EndpointActionSpec,
} from './endpointInspect';
import { JOB_HIGHLIGHT_COLOR, ROBOT_COLOR } from './mapStyle';
import type { MapJobContext } from './mapLabels';
import { robotStatusLabel } from './robotLabels';

const WEB_GLASS_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      } as unknown as ViewStyle)
    : null;

interface EndpointFloatingSheetProps {
  endpoint: EndpointDto;
  robots: RobotResponse[];
  jobContext?: MapJobContext;
  bottomOffset: number;
  compact?: boolean;
  showBackToLayers: boolean;
  onBackToLayers: () => void;
  onFocus: () => void;
  onClose: () => void;
  onInspectRobot: (robotCode: string) => void;
  onLocalizeRobot?: (robotId: string, endpointId: string) => Promise<void>;
  onLayoutHeight?: (height: number) => void;
}

/**
 * Non-modal floating endpoint inspection card rendered directly over the map
 * so operators can pan, tap another station directly, or dismiss in one gesture.
 */
export function EndpointFloatingSheet({
  endpoint,
  robots,
  jobContext,
  bottomOffset,
  compact = false,
  showBackToLayers,
  onBackToLayers,
  onFocus,
  onClose,
  onInspectRobot,
  onLocalizeRobot,
  onLayoutHeight,
}: EndpointFloatingSheetProps) {
  const { isDark } = useTheme();
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { navigate } = useNavigation();
  const places = usePlaceDirectory();

  const [localizeOpen, setLocalizeOpen] = useState(false);
  const [localizingId, setLocalizingId] = useState<string | null>(null);
  const [localizeError, setLocalizeError] = useState<string | null>(null);
  const [localizeDone, setLocalizeDone] = useState<string | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setLocalizeOpen(false);
    setLocalizingId(null);
    setLocalizeError(null);
    setLocalizeDone(null);
  }, [endpoint.id]);

  useEffect(() => () => {
    onLayoutHeight?.(0);
  }, [onLayoutHeight]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 36) {
            triggerHaptic('tap');
            onCloseRef.current();
          }
        },
      }),
    [],
  );

  const model = useMemo(() => {
    const isTechnicalRole = session?.role === 'ADMIN' || session?.role === 'TECHNICIAN';
    return resolveEndpointInspection({
      endpoint,
      robots,
      locations: places.locations,
      areas: places.areasOf(endpoint.id),
      jobContext,
      permissions: {
        canReadWarehouse: sessionCan(session, PERMISSIONS.warehouseRead),
        canCreateTransport: sessionCan(session, PERMISSIONS.transportCreate),
        canReadVouchers:
          ['STAFF', 'ADMIN'].includes(session?.role ?? '')
          && sessionCan(session, PERMISSIONS.warehouseRead),
        canLocalize: Boolean(onLocalizeRobot) && sessionCan(session, PERMISSIONS.robotLocalize),
        isTechnicalRole,
      },
    });
  }, [endpoint, robots, places, jobContext, session, onLocalizeRobot]);

  const showEmptyStationTag =
    !model.robotHere
    && !model.jobRole
    && (model.visualKind === 'CHARGER'
      || model.visualKind === 'PARK'
      || model.visualKind === 'WAIT'
      || model.visualKind === 'INSPECTION');

  const subtitleParts = [t(model.kindLabel), endpoint.code];
  if (model.areaNames.length > 0) subtitleParts.push(model.areaNames[0]);
  if (showEmptyStationTag) subtitleParts.push(t('Empty'));

  const onlineMapRobots = useMemo(
    () => robots.filter(r => r.isOnline && r.currentMapVersionId === endpoint.mapVersionId),
    [robots, endpoint.mapVersionId],
  );

  const runAction = (action: EndpointActionSpec) => {
    triggerHaptic('tap');
    switch (action.kind) {
      case 'view_shelf_stock':
        if (model.storageLocation) {
          onClose();
          navigate('inventory_lookup', { locationId: model.storageLocation.id });
        }
        break;
      case 'move_from_shelf':
        if (model.shelfSummary?.occupiedBarcodes.length) {
          onClose();
          navigate('transport_create', {
            workflow: 'INTERNAL_RELOCATION',
            containers: model.shelfSummary.occupiedBarcodes,
          });
        }
        break;
      case 'start_putaway':
        onClose();
        navigate('transport_create', { workflow: 'inbound' });
        break;
      case 'start_outbound':
        onClose();
        navigate('transport_create', { workflow: 'outbound' });
        break;
      case 'open_inbound_vouchers':
        onClose();
        navigate('stock_vouchers', { voucherType: 'INBOUND' });
        break;
      case 'open_outbound_vouchers':
        onClose();
        navigate('stock_vouchers', { voucherType: 'OUTBOUND' });
        break;
      case 'open_job':
        if (jobContext?.jobId) {
          onClose();
          navigate('job_detail', { jobId: jobContext.jobId });
        }
        break;
      case 'view_robot':
        if (model.robotHere) {
          onInspectRobot(model.robotHere.code);
        }
        break;
      case 'localize_here':
        setLocalizeError(null);
        setLocalizeOpen(prev => !prev);
        break;
    }
  };

  const handleLocalizePick = async (robot: RobotResponse) => {
    if (!onLocalizeRobot || localizingId) return;
    triggerHaptic('tap');
    setLocalizingId(robot.id);
    setLocalizeError(null);
    try {
      await onLocalizeRobot(robot.id, endpoint.id);
      triggerHaptic('success');
      setLocalizeDone(robot.code);
      setLocalizeOpen(false);
    } catch (failure) {
      triggerHaptic('error');
      setLocalizeError(getUserErrorMessage(failure, 'The robot could not be localized.'));
    } finally {
      setLocalizingId(null);
    }
  };

  const actionIcon = (kind: EndpointActionSpec['kind']) => {
    switch (kind) {
      case 'view_shelf_stock':
        return Package;
      case 'move_from_shelf':
        return ArrowUpRight;
      case 'start_putaway':
      case 'start_outbound':
        return Truck;
      case 'open_inbound_vouchers':
      case 'open_outbound_vouchers':
      case 'open_job':
        return FileText;
      case 'view_robot':
        return Bot;
      case 'localize_here':
        return Crosshair;
    }
  };

  const actionTitle = (action: EndpointActionSpec) =>
    action.robotCode ? t(action.label, { code: action.robotCode }) : t(action.label);

  return (
    <View
      onLayout={event => onLayoutHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.card,
        compact && styles.cardCompact,
        WEB_GLASS_STYLE,
        { bottom: bottomOffset },
      ]}
      accessibilityLabel="Station Details"
    >
      {/* Grabber */}
      <View {...panResponder.panHandlers} style={styles.grabberHit}>
        <View style={styles.grabber} />
      </View>

      {/* Header (no hard bottom divider) */}
      <View {...panResponder.panHandlers} style={styles.header}>
        {showBackToLayers ? (
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onBackToLayers();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Back to layers')}
            style={({ pressed }) => [styles.circleBtn, pressed && styles.btnPressed]}
          >
            <ChevronLeft size={17} color={colors.textPrimary} />
          </Pressable>
        ) : null}

        <View style={styles.iconWell}>
          <EndpointIcon
            type={endpoint.endpointType}
            code={endpoint.code}
            name={endpoint.name}
            size={18}
            isDark={isDark}
          />
        </View>

        <View style={styles.titleGroup}>
          <Text variant="title" numberOfLines={1} style={styles.title}>
            {model.displayName}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitleParts.join(' · ')}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onFocus();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Focus on map')}
            style={({ pressed }) => [styles.circleBtn, pressed && styles.btnPressed]}
          >
            <Focus size={16} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Close station details')}
            style={({ pressed }) => [styles.circleBtn, pressed && styles.btnPressed]}
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Active Job Role Tag */}
      {model.jobRole ? (
        <View style={styles.badgeRow}>
          <View
            style={[
              styles.jobBadge,
              {
                backgroundColor: `${JOB_HIGHLIGHT_COLOR[model.jobRole]}18`,
                borderColor: `${JOB_HIGHLIGHT_COLOR[model.jobRole]}44`,
              },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: JOB_HIGHLIGHT_COLOR[model.jobRole] },
              ]}
            />
            <Text
              variant="caption"
              fontWeight="600"
              color={JOB_HIGHLIGHT_COLOR[model.jobRole]}
              numberOfLines={1}
            >
              {model.jobRole === 'pickup'
                ? t('Active Job Pickup')
                : t('Active Job Destination')}
              {jobContext?.robotCode ? ` · ${jobContext.robotCode}` : ''}
            </Text>
          </View>
          {!endpoint.isEnabled ? <StatusPill status="OFFLINE" label="Disabled" size="sm" dot /> : null}
        </View>
      ) : null}

      {/* Shelf Occupancy Summary (flat inset grouped rows) */}
      {model.shelfSummary ? (
        <View style={styles.insetCard}>
          <View style={styles.insetTopRow}>
            <Text variant="caption" fontWeight="600" color="textSecondary">
              {model.shelfSummary.occupied > 0
                ? t('{occupied}/{total} slots occupied', {
                    occupied: model.shelfSummary.occupied,
                    total: model.shelfSummary.total,
                  })
                : t('All {total} slots empty', { total: model.shelfSummary.total })}
            </Text>
          </View>
          <View style={styles.slotList}>
            {model.shelfSummary.slots.map((slot, idx) => {
              const isOccupied = slot.status === 'OCCUPIED';
              const isReserved = slot.status === 'RESERVED';
              const dotColor = isOccupied
                ? colors.primary
                : isReserved
                  ? colors.warning
                  : colors.textMuted;
              return (
                <View key={slot.levelNo}>
                  <View style={styles.insetDivider} />
                  <View style={styles.slotRow}>
                    <View style={styles.slotRowLeft}>
                      <View style={[styles.dot, { backgroundColor: dotColor }]} />
                      <Text variant="caption" mono fontWeight="600" color="textSecondary">
                        {`L${slot.levelNo}`}
                      </Text>
                    </View>
                    <Text
                      variant="caption"
                      mono={isOccupied}
                      fontWeight={isOccupied ? '600' : '500'}
                      color={isOccupied ? 'textPrimary' : 'textSecondary'}
                      numberOfLines={1}
                      style={styles.slotValueText}
                    >
                      {isOccupied
                        ? slot.occupiedByBarcode || t('Occupied')
                        : isReserved
                          ? t('Reserved')
                          : t('Empty')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Robot currently at this endpoint */}
      {model.robotHere ? (
        <View style={styles.insetCard}>
          <View style={styles.robotRow}>
            <View style={styles.robotLeft}>
              <Bot size={16} color={colors.textPrimary} />
              <Text variant="bodyMedium" mono fontWeight="700" numberOfLines={1}>
                {model.robotHere.code}
              </Text>
              <View style={styles.robotStateTag}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: ROBOT_COLOR[model.robotHere.status] ?? colors.textMuted },
                  ]}
                />
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {t(robotStatusLabel(model.robotHere.status))}
                </Text>
              </View>
            </View>
            <BatteryIndicator
              percent={model.robotHere.batteryPercent}
              charging={model.robotHere.status === 'CHARGING'}
              size="sm"
            />
          </View>
        </View>
      ) : null}

      {localizeDone ? (
        <Text variant="caption" color="successText">
          {`Sent: ${localizeDone} stands at ${endpoint.code}.`}
        </Text>
      ) : null}
      {localizeError ? (
        <Text variant="caption" color="dangerText" accessibilityRole="alert">
          {localizeError}
        </Text>
      ) : null}

      {/* Inline Localize Picker */}
      {localizeOpen ? (
        <View style={styles.insetCard}>
          <Text variant="caption" color="textSecondary">
            {t('Pick robot standing at {code}', { code: endpoint.code })}
          </Text>
          {onlineMapRobots.length === 0 ? (
            <Text variant="caption" color="textMuted">
              No online robot on this map.
            </Text>
          ) : (
            <ScrollView style={styles.localizeList} nestedScrollEnabled>
              {onlineMapRobots.map((r, idx) => (
                <View key={r.id}>
                  <Pressable
                    onPress={() => { void handleLocalizePick(r); }}
                    disabled={Boolean(localizingId)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('Localize Here')}: ${r.code}`}
                    style={({ pressed }) => [styles.localizeRow, pressed && styles.btnPressed]}
                  >
                    <Text variant="bodyMedium" mono fontWeight="600">
                      {r.code}
                    </Text>
                    {localizingId === r.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text variant="caption" color="primaryText" fontWeight="600">
                        {t(robotStatusLabel(r.status))}
                      </Text>
                    )}
                  </Pressable>
                  {idx < onlineMapRobots.length - 1 ? <View style={styles.insetDivider} /> : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      {/* Contextual CTA Row (restrained: omitted when endpoint has no actions) */}
      {model.primaryAction ? (
        <View style={styles.ctaRow}>
          <Button
            title={actionTitle(model.primaryAction)}
            variant="primary"
            size="sm"
            icon={actionIcon(model.primaryAction.kind)}
            fullWidth={!model.secondaryAction}
            style={model.secondaryAction ? styles.ctaFlex : styles.ctaButton}
            onPress={() => runAction(model.primaryAction!)}
          />
          {model.secondaryAction ? (
            <Button
              title={actionTitle(model.secondaryAction)}
              variant="secondary"
              size="sm"
              icon={actionIcon(model.secondaryAction.kind)}
              style={[styles.ctaFlex, styles.ctaButton]}
              onPress={() => runAction(model.secondaryAction!)}
            />
          ) : null}
        </View>
      ) : null}

      {/* Technical coords line for Admin / Technician only */}
      {model.showTechCoords ? (
        <Text variant="caption" mono color="textMuted" style={styles.techCoords}>
          {`X ${endpoint.x.toFixed(2)} m · Y ${endpoint.y.toFixed(2)} m · Yaw ${((endpoint.yaw * 180) / Math.PI).toFixed(1)}°`}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors, _shadows: ThemeShadows, isDark: boolean) =>
  StyleSheet.create({
    card: {
      position: 'absolute',
      left: 14,
      right: 14,
      maxWidth: 540,
      alignSelf: 'center',
      zIndex: 35,
      borderRadius: 22,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.13)' : 'rgba(18, 19, 23, 0.08)',
      backgroundColor: isDark ? 'rgba(24, 27, 33, 0.92)' : 'rgba(255, 255, 255, 0.94)',
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 14,
      gap: 8,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.45 : 0.14,
      shadowRadius: 24,
      elevation: 14,
    },
    cardCompact: {
      left: 10,
      right: 10,
      paddingHorizontal: 14,
      paddingBottom: 12,
      borderRadius: 20,
    },
    grabberHit: {
      alignItems: 'center',
      paddingTop: 2,
      paddingBottom: 2,
    },
    grabber: {
      width: 34,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(18, 19, 23, 0.18)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconWell: {
      width: 36,
      height: 36,
      borderRadius: 11,
      borderCurve: 'continuous',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 19, 23, 0.055)',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    titleGroup: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    title: {
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    circleBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(18, 19, 23, 0.055)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(18, 19, 23, 0.08)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPressed: {
      opacity: 0.65,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    jobBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radii.pill,
      borderWidth: 1,
    },
    dot: {
      width: 6.5,
      height: 6.5,
      borderRadius: 3.25,
      flexShrink: 0,
    },
    insetCard: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(18, 19, 23, 0.035)',
      borderRadius: 12,
      borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(18, 19, 23, 0.07)',
      paddingHorizontal: 12,
      paddingVertical: 9,
      gap: 6,
    },
    insetTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    slotList: {
      gap: 0,
    },
    slotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
      gap: 12,
    },
    slotRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    slotValueText: {
      fontSize: 12,
      lineHeight: 16,
      flexShrink: 1,
      textAlign: 'right',
    },
    robotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    robotLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    robotStateTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexShrink: 1,
    },
    localizeList: {
      maxHeight: 132,
    },
    localizeRow: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    insetDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    ctaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    ctaFlex: {
      flex: 1,
    },
    ctaButton: {
      minHeight: 42,
      borderRadius: 12,
    },
    techCoords: {
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: -0.1,
    },
  });
