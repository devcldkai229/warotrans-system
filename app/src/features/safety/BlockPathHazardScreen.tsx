import React from 'react';
import { OperationalScreen } from '../../app/shell/OperationalScreen';
import { Button, Card, Text } from '../../shared/ui';
export function BlockPathHazardScreen() {
  return <OperationalScreen title="Path Hazard">
    <Card gap={16}>
      <Text variant="headline">Operations Capability Unavailable</Text>
      <Text>The Server Does Not Provide A Path Hazard Reporting Or Rerouting Endpoint. No Hazard Has Been Submitted And No Robot Route Has Been Changed.</Text>
      <Button title="Submit Hazard (Unavailable)" disabled onPress={() => {}} />
    </Card>
  </OperationalScreen>;
}
