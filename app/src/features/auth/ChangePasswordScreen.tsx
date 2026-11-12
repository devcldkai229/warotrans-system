import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Globe } from 'lucide-react-native';
import { BrandMark } from '../../shared/components/BrandMark';
import { Button } from '../../shared/components/Button';
import { Input } from '../../shared/components/Input';
import { ApiError } from '../../shared/api/client';
import { translateText } from '../../shared/i18n';
import { useLanguage } from '../../shared/i18n/LanguageContext';
import { colors } from '../../shared/theme/colors';
import { useTopInset } from '../../shared/theme/layout';
import { typography } from '../../shared/theme/typography';
import { triggerHaptic } from '../../shared/utils/haptics';
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
  const { language, toggleLanguage, t } = useLanguage();
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

  const langLabel = language === 'vi' ? 'Tiếng Việt' : 'English';

  return (
    <ScrollView contentContainerStyle={[styles.root, { paddingTop: topInset + 16 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            triggerHaptic('tap');
            toggleLanguage();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('Language: {lang}. Tap to switch language.', { lang: langLabel })}
          style={styles.langPill}
        >
          <Globe size={13} color={colors.primaryText} strokeWidth={2.2} />
          <Text style={styles.langLabel}>
            {language === 'vi' ? 'VI · Tiếng Việt' : 'EN · English'}
          </Text>
        </Pressable>
      </View>
      <BrandMark />
      <Text style={styles.title}>{t('Choose your own password')}</Text>
      <Text style={styles.subtitle}>
        {t('You signed in with a temporary password. Replace it before you start work.')}
      </Text>
      <View style={styles.form}>
        <Input label={t('Temporary password')} secureTextEntry value={current} onChangeText={setCurrent} autoCapitalize="none" />
        <Input
          label={t('New password')}
          secureTextEntry
          value={next}
          onChangeText={setNext}
          autoCapitalize="none"
          hint={t('At least {min} characters, with a letter and a digit.', { min: MIN_PASSWORD_LENGTH })}
        />
        <Input label={t('Repeat new password')} secureTextEntry value={confirm} onChangeText={setConfirm} autoCapitalize="none" />
        {error ? <Text style={styles.error}>{translateText(error)}</Text> : null}
        <Button label={t(busy ? 'Saving…' : 'Save password')} onPress={submit} disabled={busy} loading={busy} />
        <Button label={t('Sign out')} variant="outline" onPress={logout} disabled={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32, backgroundColor: colors.surface, gap: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    fontFamily: typography.fontSans,
  },
  title: { marginTop: 12, fontSize: 24, fontWeight: '600', color: colors.textPrimary, fontFamily: typography.fontSans },
  subtitle: { fontSize: 15, color: colors.textSecondary, fontFamily: typography.fontSans },
  form: { marginTop: 16, gap: 16 },
  error: { color: colors.danger, fontSize: 14, fontFamily: typography.fontSans },
});
