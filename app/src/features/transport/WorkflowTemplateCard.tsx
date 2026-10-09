import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertOctagon,
  Layers,
  LifeBuoy,
  Navigation,
  PackageCheck,
  RotateCw,
  Truck,
} from 'lucide-react-native';
import { colors } from '../../shared/theme/colors';
import { shadows } from '../../shared/theme/shadows';
import { typography } from '../../shared/theme/typography';
import { WorkflowItem } from './workflowTemplates';

interface WorkflowTemplateCardProps {
  workflow: WorkflowItem;
  onSelect: (workflow: WorkflowItem) => void;
}

export function WorkflowTemplateCard({
  workflow,
  onSelect,
}: WorkflowTemplateCardProps) {
  const isSafety = workflow.category === 'SAFETY';

  const renderIcon = () => {
    switch (workflow.icon) {
      case 'package-check':
        return <PackageCheck size={20} color={workflow.badgeTone} />;
      case 'truck':
        return <Truck size={20} color={workflow.badgeTone} />;
      case 'rotate-cw':
        return <RotateCw size={20} color={workflow.badgeTone} />;
      case 'navigation':
        return <Navigation size={20} color={workflow.badgeTone} />;
      case 'layers':
        return <Layers size={20} color={workflow.badgeTone} />;
      case 'octagon':
        return <AlertOctagon size={20} color={workflow.badgeTone} />;
      case 'life-buoy':
        return <LifeBuoy size={20} color={workflow.badgeTone} />;
      default:
        return <PackageCheck size={20} color={workflow.badgeTone} />;
    }
  };

  return (
    <Pressable
      onPress={() => onSelect(workflow)}
      style={({ pressed }) => [
        styles.card,
        isSafety && styles.cardSafety,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select workflow ${workflow.name}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: workflow.tone }]}>
          {renderIcon()}
        </View>
        <View style={[styles.badge, { borderColor: workflow.badgeTone }]}>
          <Text style={[styles.badgeText, { color: workflow.badgeTone }]}>
            {workflow.category}
          </Text>
        </View>
      </View>

      <Text style={styles.name}>{workflow.name}</Text>
      <Text style={styles.note} numberOfLines={2}>
        {workflow.note}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
    minHeight: 130,
    justifyContent: 'space-between',
    ...shadows.panel,
  },
  cardSafety: {
    borderColor: colors.dangerBorder,
    backgroundColor: '#fffdfd',
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '900',
    fontFamily: typography.fontMono,
    letterSpacing: 0.8,
  },
  name: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textPrimary,
    fontFamily: typography.fontSans,
    marginTop: 6,
  },
  note: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 2,
  },
});
