import React, { useEffect, useRef, useState } from 'react';
import { getContainerByBarcode } from '../../shared/api/warehouseApi';
import { confirmJobStep } from '../../shared/api/executionApi';
import type { JobDetailResponse } from '../../shared/types/contracts';
import { ActionModal, Button, ErrorBanner, Text, TextField } from '../../shared/ui';

export function VerifyModal({ visible, onClose, stepId, operationCode, expectedContainerId, onConfirmed }: {
  visible: boolean; onClose: () => void; stepId: string; operationCode: string;
  expectedContainerId?: string; onConfirmed: (job: JobDetailResponse) => void;
}) {
  const [barcode, setBarcode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setBarcode(''); setNote(''); setError(null); } }, [visible, stepId]);
  const confirm = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const container = await getContainerByBarcode(barcode.trim());
      if (expectedContainerId && container.id.toLowerCase() !== expectedContainerId.toLowerCase()) {
        throw new Error('This Container Does Not Match The Container Required By This Step.');
      }
      const updated = await confirmJobStep(stepId, container.id, note.trim() || undefined);
      onConfirmed(updated);
      onClose();
    } catch (error) { setError(error instanceof Error ? error.message : 'Handover Confirmation Failed'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <ActionModal visible={visible} onClose={onClose} busy={busy} title={operationCode === 'PICKUP_CONFIRM' ? 'Confirm Pickup Handover' : 'Confirm Dropoff Handover'}>
    <Text variant="code">{operationCode}</Text>
    <Text>Scan With A Handheld Scanner Or Enter The Container Barcode.</Text>
    {!!expectedContainerId && <Text variant="caption">Expected Container ID: {expectedContainerId}</Text>}
    <TextField label="Container Barcode" value={barcode} onChangeText={setBarcode} autoCapitalize="none" autoCorrect={false} editable={!busy} onSubmitEditing={confirm} />
    <TextField label="Note (Optional)" value={note} onChangeText={setNote} editable={!busy} multiline />
    <ErrorBanner message={error} />
    <Button title="Confirm Handover" loading={busy} disabled={!barcode.trim()} onPress={confirm} />
  </ActionModal>;
}
