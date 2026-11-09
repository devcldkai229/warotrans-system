import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '../../shared/components/BrandMark';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { ApiError } from '../../shared/api/client';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { typography } from '../../shared/theme/typography';
import { useAuth } from './authContext';
import { MIN_PASSWORD_LENGTH, passwordProblem } from './passwordPolicy';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'current_password_incorrect') return 'The temporary password is incorrect.';
    if (error.code === 'password_contains_username') return 'The password must not contain your username.';
    return error.message;
  }
  return 'The password could not be changed. Check the connection and try again.';
}

/**
 * IDN-01: shown instead of every other screen while the account holds a temporary password (new account or Admin
 * reset). The backend refuses all other calls until the password is changed.
 */
export function ChangePasswordScreen() {
  const { session, changePassword, logout } = useAuth();
  const topInset = useTopInset();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !session) return;
    const problem = passwordProblem(next, confirm, session.username);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: topInset + 32 }]} keyboardShouldPersistTaps="handled">
      <BrandMark />
      <Text style={styles.title}>Choose your own password</Text>
      <Text style={styles.subtitle}>
        You signed in with a temporary password. Replace it before you start work.
      </Text>
      <View style={styles.form}>
        <Input label="Temporary password" secureTextEntry value={current} onChangeText={setCurrent} autoCapitalize="none" />
        <Input
          label="New password"
          secureTextEntry
          value={next}
          onChangeText={setNext}
          autoCapitalize="none"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters, with a letter and a digit.`}
        />
        <Input label="Repeat new password" secureTextEntry value={confirm} onChangeText={setConfirm} autoCapitalize="none" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={busy ? 'Saving…' : 'Save password'} onPress={submit} disabled={busy} loading={busy} />
        <Button label="Sign out" variant="outline" onPress={logout} disabled={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32, backgroundColor: colors.surface, gap: 12 },
  title: { marginTop: 24, fontSize: 24, fontWeight: '600', color: colors.textPrimary, fontFamily: typography.fontSans },
  subtitle: { fontSize: 15, color: colors.textSecondary, fontFamily: typography.fontSans },
  form: { marginTop: 16, gap: 16 },
  error: { color: colors.danger, fontSize: 14, fontFamily: typography.fontSans },
});
