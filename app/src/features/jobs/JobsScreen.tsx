import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../shared/components/Card';
import { colors } from '../../shared/theme/colors';

export function JobsScreen() {
  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>Jobs Queue</Text>
        <Text style={styles.subtitle}>Active & Pending Fleet Workflows</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  card: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
