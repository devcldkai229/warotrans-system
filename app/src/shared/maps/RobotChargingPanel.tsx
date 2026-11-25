import React, { useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { useAuth } from '../../features/auth/authContext';
import { ApiError, getUserErrorMessage } from '../api/client';
import { confirmChargerPluggedIn, confirmChargerUnplugged } from '../api/fleetApi';
import { PERMISSIONS, sessionCan } from '../auth/permissions';
import { toast } from '../context/ToastContext';
import { t } from '../i18n';
import { Button, Text } from '../ui';

interface Props {
  robotId: string;
  robotCode: string;
  status: string;
  batteryPercent: number | null | undefined;
  chargingSince?: string | null;
  chargeFullAt?: string | null;
  /** Called after a confirmation was accepted, so the caller refreshes the robot. */
  onChanged?: () => void;
}

function percent(value: number | null | undefined): string {
  return value == null || !Number.isFinite(Number(value)) ? t('unknown') : `${Math.round(Number(value))}%`;
}

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('End charge'), style: 'destructive', onPress: onYes },
  ]);
}

/**
 * Manual charging on the robot panel (Admins and Technicians, robot.command): confirm the charger is plugged in, and
 * once the battery is full (the app is notified) confirm it is unplugged so the robot takes work again.
 */
export function RobotChargingPanel({ robotId, robotCode, status, batteryPercent, chargingSince, chargeFullAt, onChanged }: Props) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!sessionCan(session, PERMISSIONS.robotCommand) || status === 'MAINTENANCE') return null;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      onChanged?.();
    } catch (failure) {
      toast.error(getUserErrorMessage(failure, t('The robot could not be updated.')));
    } finally {
      setBusy(false);
    }
  };

  const unplug = async () => {
    setBusy(true);
    try {
      await confirmChargerUnplugged(robotId);
      toast.success(t('{robot} is back in service.', { robot: robotCode }));
      onChanged?.();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'charge_not_full') {
        confirm(
          t('Battery not full'),
          t('The battery is not full yet ({battery}). End the charge anyway?', { battery: percent(batteryPercent) }),
          () => void run(() => confirmChargerUnplugged(robotId, true), t('{robot} is back in service.', { robot: robotCode })),
        );
      } else {
        toast.error(getUserErrorMessage(failure, t('The robot could not be updated.')));
      }
    } finally {
      setBusy(false);
    }
  };

  if (status === 'CHARGING') {
    return (
      <View style={styles.box}>
        <Text variant="bodyMedium" fontWeight="600">
          {chargeFullAt ? t('Fully charged: unplug the charger') : t('Charging')}
        </Text>
        <Text variant="caption" color="textMuted">
          {t('Plugged in since {time}. Battery {battery}.', {
            time: chargingSince ? new Date(chargingSince).toLocaleString() : '-',
            battery: percent(batteryPercent),
          })}
        </Text>
        <Button title={t('Charger unplugged')} variant="primary" size="md" fullWidth disabled={busy} onPress={() => void unplug()} />
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <Button
        title={t('Charger plugged in')}
        variant="secondary"
        size="md"
        fullWidth
        disabled={busy}
        onPress={() => void run(() => confirmChargerPluggedIn(robotId), t('{robot} is charging.', { robot: robotCode }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6, marginTop: 12 },
});
