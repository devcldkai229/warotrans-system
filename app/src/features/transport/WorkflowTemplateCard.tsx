import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Badge } from '../../shared/components/Badge';
import { colors } from '../../shared/theme/colors';
import { WorkflowTemplate } from '../../shared/types/contracts';

interface WorkflowTemplateCardProps {
  template: WorkflowTemplate;
  onSelect: (code: WorkflowTemplate['code']) => void;
}

export function WorkflowTemplateCard({
  template,
  onSelect,
}: WorkflowTemplateCardProps) {
  const isSafety = template.category === 'safety';

  return (
    <Pressable
      onPress={() => onSelect(template.code)}
      style={({ pressed }) => [
        styles.card,
        isSafety && styles.cardSafety,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select workflow ${template.title}`}
    >
      <View style={styles.topRow}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{template.iconName}</Text>
        </View>
        <Badge
          label={template.category.toUpperCase()}
          tone={isSafety ? 'danger' : 'info'}
          size="sm"
        />
      </View>

      <Text style={styles.title}>{template.title}</Text>
      <Text style={styles.tagline} numberOfLines={2}>
        {template.tagline}
      </Text>

      <View style={styles.bottomRow}>
        <Text style={styles.durationText}>⏱ {template.estimatedDuration}</Text>
        <Text style={styles.selectCta}>Dispatch ➔</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  cardSafety: {
    borderColor: colors.dangerBorder,
    backgroundColor: '#fffcfc',
  },
  cardPressed: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.primaryBorder,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 11,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSubtle,
    paddingTop: 8,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
  },
  selectCta: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
});
