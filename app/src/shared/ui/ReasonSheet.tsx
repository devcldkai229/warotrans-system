import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Text } from './Text';
import { TextField } from './TextField';
import { useThemedStyles } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';

interface ReasonSheetProps {
  title: string;
  message?: string;
  confirmTitle: string;
  /** A reason the server requires (reject, takeover); otherwise it may be left empty. */
  required?: boolean;
  danger?: boolean;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}

/** Asks for a reason before an action that needs one; the server error stays visible inside the sheet. */
export function ReasonSheet({ title, message, confirmTitle, required = false, danger = false, onSubmit, onClose }: ReasonSheetProps) {
  const { styles, colors } = useThemedStyles(createStyles);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy || (required && !reason.trim())) return;
    setBusy(true); setError(null);
    try { await onSubmit(reason.trim()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The action failed. Try again.'); }
    finally { setBusy(false); }
  };
  return (
    <BottomSheet onClose={busy ? () => {} : onClose} accessibilityLabel={title} autoHeight>
      <View style={styles.body}>
        <Text variant="headline">{title}</Text>
        {message ? <Text variant="body" color={colors.textSecondary}>{message}</Text> : null}
        <TextField label={required ? 'Reason' : 'Reason (Optional)'} value={reason} onChangeText={setReason}
          placeholder="Why?" multiline maxLength={500} editable={!busy} />
        {error ? <Text variant="body" color={colors.dangerText}>{error}</Text> : null}
        <Button title={confirmTitle} variant={danger ? 'danger' : 'primary'} onPress={submit} loading={busy}
          disabled={required && !reason.trim()} fullWidth />
        <Button title="Close" variant="outline" onPress={onClose} disabled={busy} fullWidth />
      </View>
    </BottomSheet>
  );
}

const createStyles = (_colors: ThemeColors) => StyleSheet.create({
  body: { padding: 20, gap: 12 },
});
