import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, TextField, ErrorBanner } from '../../shared/ui';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { useAuth } from './authContext';

export function LoginScreen() {
  const { loginAsync } = useAuth();
  const topInset = useTopInset();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [zone, setZone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await loginAsync(username, password, zone.trim()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign In Failed'); }
    finally { setBusy(false); }
  };
  return <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: topInset + 24 }]}>
    <Text variant="display">WaroTrans</Text>
    <Text color="textSecondary">Mobile Staff Console</Text>
    <Card gap={16}>
      <Text variant="headline">Sign In</Text>
      <ErrorBanner message={error} />
      <TextField label="Username" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} editable={!busy} />
      <TextField label="Password" secureTextEntry value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={submit} />
      <TextField label="Local Zone Display Preference (Optional)" value={zone} onChangeText={setZone} editable={!busy} />
      <Text variant="caption">This preference only changes the label on this device. Work assignments come from the server.</Text>
      <Button title="Sign In" fullWidth loading={busy} disabled={!username.trim() || !password} onPress={submit} />
    </Card>
  </ScrollView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' } });
