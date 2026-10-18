import React, { useEffect, useState } from 'react';
import { ActionModal, Button, Text, TextField } from '../../shared/ui';
export function BarcodeScannerHUD({ visible, onClose, onScanResult }: {
  visible: boolean; onClose: () => void; onScanResult: (barcode: string) => void; targetBarcode?: string;
}) {
  const [barcode, setBarcode] = useState('');
  useEffect(() => { if (visible) setBarcode(''); }, [visible]);
  const submit = () => { if (barcode.trim()) onScanResult(barcode.trim()); };
  return <ActionModal visible={visible} onClose={onClose} title="Container Barcode">
    <Text>Camera Scanning Is Not Connected. Use A Handheld Scanner Or Enter The Barcode Printed On The Container.</Text>
    <TextField label="Barcode" value={barcode} onChangeText={setBarcode} autoCapitalize="none" autoCorrect={false} onSubmitEditing={submit} />
    <Button title="Use Entered Barcode" disabled={!barcode.trim()} onPress={submit} />
  </ActionModal>;
}
