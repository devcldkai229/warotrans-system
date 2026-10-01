import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>WaroTrans</Text>
      <Text style={styles.headline}>Warehouse & transport operations</Text>
      <Text style={styles.tagline}>
        Coordinate fleet, warehouse, and delivery workflows from one place.
      </Text>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaLabel}>Get started</Text>
      </Pressable>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f7fa',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  brand: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    color: '#0e7490',
    marginBottom: 16,
  },
  headline: {
    fontSize: 22,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 340,
  },
  cta: {
    backgroundColor: '#0e7490',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  ctaPressed: {
    backgroundColor: '#0f766e',
  },
  ctaLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
