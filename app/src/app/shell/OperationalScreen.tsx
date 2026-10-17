import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '../navigation/NavigationContext';
import { colors } from '../../shared/theme/colors';
import { dockReservedSpace } from '../../shared/theme/layout';
import { ErrorBanner, ScreenHeader } from '../../shared/ui';

export function OperationalScreen({ title, children, error, loading = false, onRefresh, back = true, header = true }: {
  title: string; children: React.ReactNode; error?: string | null; loading?: boolean;
  onRefresh?: () => void; back?: boolean; header?: boolean;
}) {
  const { goBack, dockHeight } = useNavigation();
  return <View style={styles.screen}>
    {header && <ScreenHeader title={title} canGoBack={back} onBack={goBack} />}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: dockReservedSpace(dockHeight) }]}
      refreshControl={onRefresh ? <RefreshControl refreshing={loading} onRefresh={onRefresh} /> : undefined}>
      <ErrorBanner message={error} />
      {loading && <ActivityIndicator color={colors.primaryText} accessibilityLabel="Loading Server Data" />}
      {children}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, gap: 16 } });
