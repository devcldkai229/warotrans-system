import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react-native';
import { getOperatingContext, getMapVersionDetail } from '../../shared/api';
import { Button, Text } from '../../shared/ui';
import { colors } from '../../shared/theme/colors';
import { hasMapCalibration } from '../../shared/utils/mapCoordinates';
import { OperationalMap } from './OperationalMap';
import type { RobotDto } from '../../shared/api';
import type { StyleProp, ViewStyle } from 'react-native';
import type { MapUpdateMode } from '../../shared/maps/mapTelemetry';

interface Props {
  fleet: RobotDto[];
  updateMode: MapUpdateMode;
  selectedRobotId: string;
  onSelectRobot: (code: string) => void;
  style?: StyleProp<ViewStyle>;
  bottomInset: number;
  onOpenJobs: () => void;
}

export function HomeMapPanel({ bottomInset, onOpenJobs, style, ...props }: Props) {
  const operating = useQuery({ queryKey: ['operating-context'], queryFn: () => getOperatingContext(), staleTime: 0, refetchInterval: 30_000 });
  const active = operating.data?.map;
  const warehouseId = operating.data?.warehouse.id;
  const detail = useQuery({ queryKey: ['home-map-detail', active?.id], queryFn: () => getMapVersionDetail(active!.id), enabled: !!active?.id });
  const invalidMap = detail.data && (!hasMapCalibration(detail.data) || detail.data.status !== 'PUBLISHED');
  const error = (invalidMap ? new Error('The published map calibration is unavailable. Ask your admin to check this map.') : null)
    || operating.error || detail.isEnabled && detail.error;
  const loading = operating.isPending || detail.isEnabled && detail.isPending;
  const map = detail.data?.id === active?.id && detail.data?.warehouseId === warehouseId ? detail.data : null;

  return <View style={style}>
    {map && !error ? <OperationalMap map={map} fleet={props.fleet || []} updateMode={props.updateMode} selectedRobotId={props.selectedRobotId}
      onSelectRobot={props.onSelectRobot} bottomInset={bottomInset} /> : <View style={[styles.state, { bottom: bottomInset }]}>
      {loading ? <><ActivityIndicator color={colors.primary} /><Text variant="body">Loading Warehouse Map…</Text></> : <>
        <View style={styles.icon}><MapPin size={24} color={colors.primaryText} /></View>
        <Text variant="headline" textAlign="center">{error ? 'Map Could Not Be Loaded' : warehouseId ? 'No Published Map' : 'Your Warehouse Map'}</Text>
        <Text variant="body" textAlign="center" color="textSecondary">{error ? error.message : warehouseId
          ? 'The warehouse map will appear here when your admin publishes it.'
          : 'The latest published warehouse map will appear here.'}</Text>
        <Button title={error ? 'Retry Map' : 'View Jobs'} variant="outline" onPress={error ? () => { void operating.refetch(); if (detail.isEnabled) void detail.refetch(); } : onOpenJobs} />
      </>}
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  state: { position: 'absolute', top: 0, left: 24, right: 24, justifyContent: 'center', alignItems: 'center', gap: 14 },
  icon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
});
