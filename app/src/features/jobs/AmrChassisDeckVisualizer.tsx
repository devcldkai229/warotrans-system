import React from 'react';
import { ContainerSlot } from '../../shared/types/contracts';
import { JobContainerItem } from './jobData';
import { AmrCargoBayVisualizer, CargoBayItem } from './AmrCargoBayVisualizer';

interface AmrChassisDeckVisualizerProps {
  containers?: JobContainerItem[];
  slots?: ContainerSlot[];
  targetCode?: string;
  isWaiting?: boolean;
  robotId?: string;
  robotCode?: string;
  onSelectSlot?: (containerCode: string) => void;
}

/**
 * @deprecated Legacy wrapper for AmrCargoBayVisualizer to support dynamic payload sizes.
 */
export function AmrChassisDeckVisualizer({
  containers,
  slots: legacySlots,
  targetCode,
  isWaiting = false,
  robotId = 'AMR-01',
  robotCode,
  onSelectSlot,
}: AmrChassisDeckVisualizerProps) {
  const bayItems: CargoBayItem[] =
    containers?.map((c, i) => ({
      code: c.code,
      sequenceNo: i + 1,
      status: c.action === 'DELIVERED' ? 'DELIVERED' : 'ONBOARD',
      action: c.action,
      location: c.location,
    })) ||
    legacySlots
      ?.filter((s) => s.action !== 'EMPTY' && s.containerBarcode)
      .map((s, i) => ({
        code: s.containerBarcode || `TOTE-${s.slotNo}`,
        sequenceNo: i + 1,
        status: 'ONBOARD',
        action: s.action,
        location: '',
      })) ||
    [];

  return (
    <AmrCargoBayVisualizer
      robotCode={robotCode}
      robotId={robotId}
      containers={bayItems}
      targetCode={targetCode}
      isWaiting={isWaiting}
      onSelectContainer={onSelectSlot}
    />
  );
}
