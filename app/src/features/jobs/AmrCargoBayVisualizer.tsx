import React from 'react';
import { View } from 'react-native';
import type { JobContainerResponse } from '../../shared/types/contracts';
import type { ContainerDetailsResponse } from '../../shared/api/warehouseApi';
import { Card, Text, StatusPill } from '../../shared/ui';
export function AmrCargoBayVisualizer({ containers, inventory = [] }: { containers: JobContainerResponse[]; inventory?: ContainerDetailsResponse[] }) {
  return <View style={{ gap: 10 }}>
    <Text variant="headline">Job Containers ({containers.length})</Text>
    {containers.map(item => {
      const container = inventory.find(c => c.id === item.containerId);
      return <Card key={item.id} gap={6}>
        <Text variant="code">{container?.barcode ?? item.containerId}</Text>
        {!!container && <Text>{container.productSku} · {container.productName}</Text>}
        <StatusPill status={item.status} />
      </Card>;
    })}
    {!containers.length && <Text>No Containers Assigned</Text>}
  </View>;
}
