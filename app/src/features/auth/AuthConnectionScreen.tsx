import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Globe, WifiOff } from 'lucide-react-native';
import { Button, Card, Text } from '../../shared/ui';
import { useLanguage } from '../../shared/i18n/LanguageContext';
import { colors, ThemeColors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useTopInset } from '../../shared/theme/layout';
import { useThemedStyles } from '../../shared/theme/ThemeContext';
import { triggerHaptic } from '../../shared/utils/haptics';

interface Props {
  message: string;
  loading: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}

export function AuthConnectionScreen({ message, loading, onRetry, onSignOut }: Props) {
  const topInset = useTopInset();
  const styles = useThemedStyles(createStyles);
  const { language, toggleLanguage, t } = useLanguage();
  const langLabel = language === 'vi' ? 'Tiếng Việt' : 'English';
  return <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: topInset + 32 }]}>
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
        <Text variant="caption" color="textSecondary" style={styles.langLabel}>
          {language === 'vi' ? 'VI · Tiếng Việt' : 'EN · English'}
        </Text>
      </Pressable>
    </View>
    <Card gap={16} padding="lg">
      <View style={styles.icon}><WifiOff size={28} color={colors.warningText} /></View>
      <Text variant="title">Connection Unavailable</Text>
      <Text variant="body" color="textSecondary" accessibilityRole="alert">{message}</Text>
      <Text variant="caption">Your saved sign-in is kept on this device. Reconnect to verify your session and continue.</Text>
      <Button title="Retry Connection" onPress={onRetry} loading={loading} fullWidth />
      <Button title="Sign Out" onPress={onSignOut} variant="ghost" fullWidth />
    </Card>
  </ScrollView>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32, gap: 12 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langLabel: { fontWeight: '600' },
  icon: { width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' },
});
