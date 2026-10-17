import React from 'react';
import { View } from 'react-native';
import type { JobStepResponse } from '../../shared/types/contracts';
import { Card, Text, StatusPill } from '../../shared/ui';
const titles = { CHECK: 'Check', MOVE: 'Move', HUMAN_INTERACTION: 'Human Interaction', WAIT: 'Wait' };
export function JobStepper({ steps, currentStepId }: { steps: JobStepResponse[]; currentStepId?: string | null }) {
  return <View style={{ gap: 10 }}>{steps.map(step => <Card key={step.id} gap={6}>
    <Text variant="headline">{step.id === currentStepId ? 'Current · ' : ''}{titles[step.stepType]} · {step.name}</Text>
    <Text variant="code">{step.operationCode}</Text><StatusPill status={step.status} />
    {!!step.errorMessage && <Text color="dangerText">{step.errorMessage}</Text>}
  </Card>)}</View>;
}
