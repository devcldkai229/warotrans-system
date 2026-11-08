import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { Button, Card, Text } from '../../shared/ui';
import { colors } from '../../shared/theme/colors';
import { radii } from '../../shared/theme/radii';
import { useTopInset } from '../../shared/theme/layout';

interface Props {
  message: string;
  loading: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}

export function AuthConnectionScreen({ message, loading, onRetry, onSignOut }: Props) {
  const topInset = useTopInset();
  return <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingTop: topInset + 32 }]}>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32 },
  icon: { width: 52, height: 52, borderRadius: radii.lg, backgroundColor: colors.warningBg, alignItems: 'center', justifyContent: 'center' },
});
