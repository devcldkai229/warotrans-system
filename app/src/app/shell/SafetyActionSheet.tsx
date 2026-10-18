import React from 'react';
import { ActionModal, Button, Text } from '../../shared/ui';
export interface SafetyActionSheetProps {
  visible: boolean; onClose: () => void;
  onReportHazard?: () => void; onReportDefect?: () => void; onOpenMaintenance?: () => void;
}
export function SafetyActionSheet({ visible, onClose, onReportHazard, onReportDefect, onOpenMaintenance }: SafetyActionSheetProps) {
  return <ActionModal visible={visible} onClose={onClose} title="Operational Safety">
    <Text>Nearby Robot Hold Is Not Available On The Server. This App Cannot Assert That A Robot Or Aisle Is Safe To Approach.</Text>
    <Button title="Nearby Robot Hold (Unavailable)" disabled onPress={() => {}} />
    <Button title="Path Hazard Capability" variant="outline" disabled={!onReportHazard} onPress={() => { onClose(); onReportHazard?.(); }} />
    <Button title="Cargo Issue Capability" variant="outline" disabled={!onReportDefect} onPress={() => { onClose(); onReportDefect?.(); }} />
    <Button title="Fleet Command Controls" variant="outline" disabled={!onOpenMaintenance} onPress={() => { onClose(); onOpenMaintenance?.(); }} />
  </ActionModal>;
}
