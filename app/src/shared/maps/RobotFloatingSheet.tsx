import React, { useEffect, useMemo, useRef } from 'react';
import {
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
  Focus,
  Navigation,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../app/navigation/NavigationContext';
import { useAuth } from '../../features/auth/authContext';
import type { MapVersionDetailDto } from '../api/navigationApi';
import { t } from '../i18n';
import { ThemeColors } from '../theme/colors';
import { radii } from '../theme/radii';
import { ThemeShadows } from '../theme/shadows';
import { useThemedStyles } from '../theme/ThemeContext';
import { typography } from '../theme/typography';
import type { RobotResponse } from '../types/contracts';
import { Button, Text } from '../ui';
import { BatteryIndicator } from '../ui/RobotBadges';
import { triggerHaptic } from '../utils/haptics';
import { type MapJobContext } from './mapLabels';
import { ROBOT_COLOR } from './mapStyle';
import { sampleAgeLabel, type MapRobotState } from './mapTelemetry';
import { RobotChargingPanel } from './RobotChargingPanel';
import { robotStatusLabel } from './robotLabels';
import { RobotLocalizePanel } from './RobotLocalizePanel';

const WEB_GLASS_STYLE: ViewStyle | null =
  Platform.OS === 'web'
    ? ({
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      } as unknown as ViewStyle)
    : null;

interface RobotFloatingSheetProps {
  robot: RobotResponse;
  state: MapRobotState;
  map: MapVersionDetailDto;
  jobContext?: MapJobContext;
  active: boolean;
  following: boolean;
  bottomOffset: number;
  compact?: boolean;
  showBackToLayers: boolean;
  onBackToLayers: () => void;
  onFocus: () => void;
  onClose: () => void;
  onToggleFollow: () => void;
  onManualDrive?: (robotId: string) => void;
  onLocalizeRobot?: (robotId: string, endpointId: string) => Promise<void>;
  onLayoutHeight?: (height: number) => void;
}

/**
 * Non-modal floating robot telemetry & control card rendered directly over the map
 * so operators can pan, switch between robots/stations directly, or dismiss in one gesture.
 */
export function RobotFloatingSheet({
  robot,
  state,
  map,
  jobContext,
  active,
  following,
  bottomOffset,
  compact = false,
  showBackToLayers,
  onBackToLayers,
  onFocus,
  onClose,
  onToggleFollow,
  onManualDrive,
  onLocalizeRobot,
  onLayoutHeight,
}: RobotFloatingSheetProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const { session } = useAuth();
  const { navigate } = useNavigation();

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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

  const isTechnicalRole = session?.role === 'ADMIN' || session?.role === 'TECHNICIAN';
  const statusAccent = ROBOT_COLOR[robot.status] ?? colors.textMuted;
  const iconColor = robot.isOnline ? colors.textPrimary : colors.textMuted;

  const subtitleText = !robot.isOnline
    ? t('Offline')
    : state.lastReported
      ? sampleAgeLabel(state.ageSeconds)
      : `${t('Online')} · ${t('Live')}`;

  const hasAssignedJob = Boolean(
    jobContext?.jobId
    && (jobContext.robotId === robot.id || jobContext.robotCode === robot.code),
  );
  const hasSpeed = robot.isOnline && Number.isFinite(Number(robot.linearVelocity));

  return (
    <View
      onLayout={event => onLayoutHeight?.(event.nativeEvent.layout.height)}
      style={[
        styles.card,
        compact && styles.cardCompact,
        WEB_GLASS_STYLE,
        { bottom: bottomOffset },
      ]}
      accessibilityLabel="Robot Telemetry"
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
          <Bot size={18} color={iconColor} />
        </View>

        <View style={styles.titleGroup}>
          <Text variant="title" mono numberOfLines={1} style={styles.title}>
            {robot.code}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitleText}
          </Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            onPress={() => {
              if (!state.showPose) return;
              triggerHaptic('tap');
              onFocus();
            }}
            disabled={!state.showPose}
            accessibilityRole="button"
            accessibilityLabel={t('Focus on map')}
            style={({ pressed }) => [
              styles.circleBtn,
              !state.showPose && styles.btnDisabled,
              pressed && state.showPose && styles.btnPressed,
            ]}
          >
            <Focus size={16} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Close robot details')}
            style={({ pressed }) => [styles.circleBtn, pressed && styles.btnPressed]}
          >
            <X size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* Active Job Pill */}
        {hasAssignedJob ? (
          <Pressable
            onPress={() => {
              triggerHaptic('tap');
              onClose();
              navigate('job_detail', { jobId: jobContext!.jobId! });
            }}
            accessibilityRole="button"
            accessibilityLabel={t('Assigned to active job')}
            style={({ pressed }) => [styles.jobPill, pressed && styles.btnPressed]}
          >
            <View style={[styles.dot, { backgroundColor: colors.primary }]} />
            <Text variant="caption" fontWeight="600" color="primaryText" numberOfLines={1} style={styles.jobPillText}>
              {t('Assigned to active job')}
              {jobContext?.status ? ` · ${t(jobContext.status)}` : ''}
            </Text>
            <ArrowUpRight size={14} color={colors.primaryText} />
          </Pressable>
        ) : null}

        {/* Compact Telemetry Inset Card */}
        <View style={styles.statsCard}>
          <View style={styles.statCell}>
            <Text variant="caption" color="textMuted" style={styles.statLabel}>
              Battery
            </Text>
            <BatteryIndicator
              percent={robot.batteryPercent}
              charging={robot.status === 'CHARGING'}
              size="lg"
              bar
            />
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statCell}>
            <Text variant="caption" color="textMuted" style={styles.statLabel}>
              Status
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: statusAccent }]} />
              <Text variant="bodyMedium" fontWeight="600" numberOfLines={1} style={styles.statValue}>
                {t(robotStatusLabel(robot.status))}
              </Text>
            </View>
          </View>

          {hasSpeed ? (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statCell}>
                <Text variant="caption" color="textMuted" style={styles.statLabel}>
                  Speed
                </Text>
                <Text variant="bodyMedium" mono fontWeight="600" numberOfLines={1} style={styles.statValue}>
                  {`${Math.abs(Number(robot.linearVelocity)).toFixed(2)} m/s`}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Primary CTA Row */}
        <View style={styles.ctaRow}>
          <Button
            title={following ? 'Stop Following' : 'Follow Robot'}
            variant={following ? 'secondary' : 'primary'}
            size="sm"
            icon={Navigation}
            fullWidth={!onManualDrive}
            disabled={!following && (!state.canFollow || !active)}
            style={onManualDrive ? styles.ctaFlex : styles.ctaButton}
            onPress={() => {
              triggerHaptic('success');
              onToggleFollow();
            }}
          />
          {onManualDrive ? (
            <Button
              title="Manual Drive"
              variant="secondary"
              size="sm"
              icon={SlidersHorizontal}
              style={[styles.ctaFlex, styles.ctaButton]}
              onPress={() => {
                triggerHaptic('tap');
                onClose();
                onManualDrive(robot.id);
              }}
            />
          ) : null}
        </View>

        {/* Admin / Technician Operational Controls */}
        <RobotChargingPanel
          key={`charge-${robot.id}`}
          robotId={robot.id}
          robotCode={robot.code}
          status={robot.status}
          batteryPercent={robot.batteryPercent}
          chargingSince={robot.chargingSince}
          chargeFullAt={robot.chargeFullAt}
        />

        {onLocalizeRobot ? (
          <RobotLocalizePanel
            key={robot.id}
            robotCode={robot.code}
            isOnline={robot.isOnline}
            localizationStatus={robot.localizationStatus}
            mapVersionId={map.id}
            endpoints={map.endpoints}
            onLocalize={epId => onLocalizeRobot(robot.id, epId)}
          />
        ) : null}

        {/* Technical Coords Footer (Admin / Technician only) */}
        {isTechnicalRole && state.showPose ? (
          <Text variant="caption" mono color="textMuted" style={styles.techCoords}>
            {`X ${robot.poseX.toFixed(2)} m · Y ${robot.poseY.toFixed(2)} m · Yaw ${((robot.poseYaw * 180) / Math.PI).toFixed(1)}°${robot.localizationStatus ? ` · ${robot.localizationStatus}` : ''}`}
          </Text>
        ) : null}
      </ScrollView>
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
      maxHeight: '68%',
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
    btnDisabled: {
      opacity: 0.4,
    },
    bodyScroll: {
      flexShrink: 1,
    },
    bodyContent: {
      gap: 10,
    },
    jobPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: radii.pill,
      backgroundColor: colors.primaryLight,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primaryBorder,
    },
    jobPillText: {
      flex: 1,
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(18, 19, 23, 0.035)',
      borderRadius: 12,
      borderCurve: 'continuous',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(18, 19, 23, 0.07)',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    statCell: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: colors.border,
      marginHorizontal: 10,
    },
    statLabel: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '500',
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    statValue: {
      fontSize: 13,
      lineHeight: 17,
      flexShrink: 1,
    },
    dot: {
      width: 6.5,
      height: 6.5,
      borderRadius: 3.25,
      flexShrink: 0,
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
