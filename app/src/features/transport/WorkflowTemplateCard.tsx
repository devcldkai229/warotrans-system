import React from 'react';
import {
  Pressable,
  StyleSheet,
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
import { radii } from '../../shared/theme/radii';
import { shadows } from '../../shared/theme/shadows';
import { Text } from '../../shared/ui/Text';
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
    const iconSize = 20;
    const iconColor = isSafety ? colors.danger : colors.primary;

    switch (workflow.icon) {
      case 'package-check':
        return <PackageCheck size={iconSize} color={iconColor} />;
      case 'truck':
        return <Truck size={iconSize} color={iconColor} />;
      case 'rotate-cw':
        return <RotateCw size={iconSize} color={iconColor} />;
      case 'navigation':
        return <Navigation size={iconSize} color={iconColor} />;
      case 'layers':
        return <Layers size={iconSize} color={iconColor} />;
      case 'octagon':
        return <AlertOctagon size={iconSize} color={iconColor} />;
      case 'life-buoy':
        return <LifeBuoy size={iconSize} color={iconColor} />;
      default:
        return <PackageCheck size={iconSize} color={iconColor} />;
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
        <View style={[styles.iconBox, isSafety && styles.iconBoxSafety]}>
          {renderIcon()}
        </View>
        <View style={[styles.badge, isSafety ? styles.badgeSafety : styles.badgeDefault]}>
          <Text
            variant="caption"
            color={isSafety ? colors.danger : colors.primaryText}
            style={styles.badgeText}
            numberOfLines={1}
          >
            {workflow.category}
          </Text>
        </View>
      </View>

      <Text variant="bodyMedium" numberOfLines={1} style={styles.name}>
        {workflow.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 14,
    minHeight: 92,
    justifyContent: 'space-between',
    gap: 8,
    ...shadows.sm,
  },
  cardSafety: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    flexShrink: 0,
  },
  iconBoxSafety: {
    backgroundColor: colors.dangerBg,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexShrink: 1,
  },
  badgeDefault: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
  },
  badgeSafety: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 11,
  },
  name: {
    fontWeight: '700',
  },
});
