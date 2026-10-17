import React from 'react';
import { ActionModal, Text } from '../../shared/ui';
/** Legacy route: slot occupancy and reservations have no backend contract. */
export function TargetSlotPickerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <ActionModal visible={visible} onClose={onClose} title="Storage Selection">
    <Text>Select Real Endpoints, Storage Locations And Levels In The Transport Request Form. Slot Occupancy And Reservations Are Not Available On The Server.</Text>
  </ActionModal>;
}
