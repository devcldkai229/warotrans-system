import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {
  AlertOctagon,
  ArrowUpRight,
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
        return <PackageCheck size={iconSize} color={iconColor} strokeWidth={2.2} />;
      case 'truck':
        return <Truck size={iconSize} color={iconColor} strokeWidth={2.2} />;
      case 'rotate-cw':
        return <RotateCw size={iconSize} color={iconColor} strokeWidth={2.2} />;
      case 'navigation':
        return <Navigation size={iconSize} color={iconColor} strokeWidth={2.2} />;
      case 'layers':
        return <Layers size={iconSize} color={iconColor} strokeWidth={2.2} />;
      case 'octagon':
        return <AlertOctagon size={iconSize} color={iconColor} strokeWidth={2.2} />;
      case 'life-buoy':
        return <LifeBuoy size={iconSize} color={iconColor} strokeWidth={2.2} />;
      default:
        return <PackageCheck size={iconSize} color={iconColor} strokeWidth={2.2} />;
    }
  };

  return (
    <Pressable
      onPress={() => onSelect(workflow)}
      style={({ pressed }) => [
        styles.card,
        isSafety && styles.cardSafety,
        pressed && (isSafety ? styles.cardSafetyPressed : styles.cardPressed),
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Select workflow ${workflow.name}`}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconBox, isSafety && styles.iconBoxSafety]}>
          {renderIcon()}
        </View>
        <View style={[styles.arrowCircle, isSafety && styles.arrowCircleSafety]}>
          <ArrowUpRight
            size={15}
            color={isSafety ? colors.danger : colors.textMuted}
            strokeWidth={2.2}
          />
        </View>
      </View>

      <Text variant="bodyMedium" numberOfLines={2} style={styles.name}>
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
    minHeight: 96,
    justifyContent: 'space-between',
    gap: 12,
    ...shadows.sm,
  },
  cardSafety: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.surface,
  },
  cardPressed: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceSubtle,
    transform: [{ scale: 0.985 }],
  },
  cardSafetyPressed: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
    transform: [{ scale: 0.985 }],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
    flexShrink: 0,
  },
  iconBoxSafety: {
    backgroundColor: colors.dangerBg,
  },
  arrowCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCircleSafety: {
    backgroundColor: colors.dangerBg,
  },
  name: {
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 19,
  },
});
